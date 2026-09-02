'use strict';
const crypto=require('crypto');

const KEY_LENGTH=32;
const MAX_FAILURES=5;
const LOCK_MS=15*60*1000;
const PASSWORD_STATES=new Set(['TEMPORARY','PERSONAL','RESET_REQUIRED']);

function normalizeMobile(value){
  let digits=String(value??'').trim()
    .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g,'');
  // Canonicalize explicit country codes (+98 / 0098 / 98...) to the local 0 form.
  // Inputs without a country code are kept exactly as typed (no auto-added 09).
  if(digits.startsWith('0098'))digits='0'+digits.slice(4);
  else if(digits.startsWith('98')&&digits.length>=11)digits='0'+digits.slice(2);
  if(digits.length<7||digits.length>15)throw Object.assign(new Error('شماره همراه معتبر نیست'),{statusCode:400});
  return digits;
}
function temporaryPassword(mobile){const normalized=normalizeMobile(mobile);return normalized.slice(-4);}
function normalizeTemporaryPasswordInput(value){return String(value??'').trim().replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));}
function hashPassword(password,salt=crypto.randomBytes(16)){
  const value=String(password??'');
  const derived=crypto.scryptSync(value,salt,KEY_LENGTH,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}
function verifyPassword(password,encoded){
  try{
    const [algorithm,saltText,hashText]=String(encoded||'').split('$');
    if(algorithm!=='scrypt'||!saltText||!hashText)return false;
    const expected=Buffer.from(hashText,'base64url'),salt=Buffer.from(saltText,'base64url');
    const actual=crypto.scryptSync(String(password??''),salt,expected.length,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
  }catch(error){return false;}
}
const DUMMY_HASH=hashPassword('yasnafit-dummy-password');
function validatePersonalPassword(password){
  const value=String(password??'');
  if(value.length<8||value.length>128)throw Object.assign(new Error('رمز جدید باید حداقل ۸ کاراکتر و حداکثر ۱۲۸ کاراکتر باشد'),{statusCode:400});
  return value;
}
function authColumnsForMobile(mobile){
  const mobileNormalized=normalizeMobile(mobile),temporary=temporaryPassword(mobileNormalized);
  return {mobile_normalized:mobileNormalized,password_hash:hashPassword(temporary),password_state:'TEMPORARY'};
}
function safeStudent(row){
  if(!row)return row;
  const {password_hash,mobile_normalized,password_state,password_changed_at,temporary_login_at,auth_failed_attempts,auth_locked_until,last_login_at,...safe}=row;
  return safe;
}
function authenticate(db,mobile,password,fullName=null){
  let normalized=null;
  try{normalized=normalizeMobile(mobile);}catch(error){normalized=null;}
  let student=null;
  if(normalized){
    student=db.prepare('SELECT * FROM students WHERE mobile_normalized=? AND deleted_at IS NULL').get(normalized);
  }
  if(!student && fullName && typeof fullName === 'string' && fullName.trim()){
    student=db.prepare('SELECT * FROM students WHERE full_name=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1').get(fullName.trim());
  }
  if(!student && !normalized && typeof mobile === 'string' && mobile.trim()){
    student=db.prepare('SELECT * FROM students WHERE (full_name=? OR case_number=?) AND deleted_at IS NULL ORDER BY id DESC LIMIT 1').get(mobile.trim(), mobile.trim());
  }
  if(!student){verifyPassword(password,DUMMY_HASH);return {error:'INVALID_CREDENTIALS'};}
  if(student.auth_locked_until&&new Date(student.auth_locked_until)>new Date())return {error:'AUTH_LOCKED'};
  if(!PASSWORD_STATES.has(student.password_state))return {error:'AUTH_SETUP_REQUIRED'};
  const candidate=student.password_state==='TEMPORARY'?normalizeTemporaryPasswordInput(password):String(password??'');
  let valid=student.password_hash?verifyPassword(candidate,student.password_hash):false,repairedHash=null;
  // Compatibility repair: older installations may have an absent/stale temporary
  // hash. The defined temporary credential is still the mobile's final four digits.
  if(!valid&&student.password_state==='TEMPORARY'&&candidate===temporaryPassword(student.mobile)){
    repairedHash=hashPassword(candidate);valid=true;
  }
  if(!valid){
    if(!student.password_hash&&student.password_state!=='TEMPORARY')return {error:'AUTH_SETUP_REQUIRED'};
    const failures=Number(student.auth_failed_attempts||0)+1,lockUntil=failures>=MAX_FAILURES?new Date(Date.now()+LOCK_MS).toISOString():null;
    db.prepare('UPDATE students SET auth_failed_attempts=?,auth_locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failures>=MAX_FAILURES?0:failures,lockUntil,student.id);
    return {error:lockUntil?'AUTH_LOCKED':'INVALID_CREDENTIALS'};
  }
  db.prepare('UPDATE students SET password_hash=COALESCE(?,password_hash),auth_failed_attempts=0,auth_locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(repairedHash,student.id);
  return {student:{...student,password_hash:repairedHash||student.password_hash,auth_failed_attempts:0,auth_locked_until:null}};
}
function setPersonalPassword(db,studentId,newPassword){
  const student=db.prepare('SELECT id,mobile,password_state FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student)throw Object.assign(new Error('شاگرد پیدا نشد'),{statusCode:404});
  const validated=validatePersonalPassword(newPassword),hash=hashPassword(validated);
  db.prepare("UPDATE students SET password_hash=?,password_state='PERSONAL',password_changed_at=CURRENT_TIMESTAMP,auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?").run(hash,studentId);
  return {password_state:'PERSONAL',password_changed_at:new Date().toISOString()};
}
function passwordStateLabel(state){
  return {TEMPORARY:'رمز موقت',PERSONAL:'رمز شخصی',RESET_REQUIRED:'نیاز به بازنشانی'}[state]||'نامشخص';
}
function credentialsView(student){
  if(!student) return null;
  const state=PASSWORD_STATES.has(student.password_state)?student.password_state:'RESET_REQUIRED';
  const locked=Boolean(student.auth_locked_until && new Date(student.auth_locked_until)>new Date());
  const username=student.mobile||student.mobile_normalized||'';
  return {
    id:student.id,
    case_number:student.case_number||'',
    full_name:student.full_name||'',
    username,
    password_state:state,
    password_state_label:passwordStateLabel(state),
    temporary_password:state==='TEMPORARY'&&username?temporaryPassword(username):null,
    locked,
    locked_until:locked?student.auth_locked_until:null,
    failed_attempts:Number(student.auth_failed_attempts||0),
    last_login_at:student.last_login_at||null,
    password_changed_at:student.password_changed_at||null
  };
}
// Keeps the login credential in sync when a coach edits the student's mobile number
// outside of the credentials dialog: the temporary password is always the last four
// digits of the *current* mobile, so a TEMPORARY account must be re-hashed.
function mobileAuthUpdate(student,mobile){
  const normalized=normalizeMobile(mobile);
  const previous=String(student?.mobile_normalized||student?.mobile||'');
  const state=PASSWORD_STATES.has(student?.password_state)?student.password_state:'RESET_REQUIRED';
  const changed=normalized!==previous;
  const update={mobile:normalized,mobile_normalized:normalized,changed,password_hash:null,password_state:null,temporary_password:null,sessions_revoked:false};
  if(!changed)return update;
  if(state!=='PERSONAL'){
    const temporary=temporaryPassword(normalized);
    update.password_hash=hashPassword(temporary);
    update.password_state='TEMPORARY';
    update.temporary_password=temporary;
  }
  update.sessions_revoked=true;
  return update;
}
function manageCredentials(db,studentId,{username,password,confirmPassword,resetTemporary=false,unlock=false}={}){
  const student=db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student) throw Object.assign(new Error('شاگرد پیدا نشد'),{statusCode:404});
  const changes=[];
  let mobile=student.mobile||student.mobile_normalized||'';
  let mobileNormalized=student.mobile_normalized||student.mobile||'';
  let passwordState=PASSWORD_STATES.has(student.password_state)?student.password_state:'RESET_REQUIRED';
  let passwordHash=student.password_hash;
  let revealedTemporary=null;
  let revealedPassword=null;
  if(username!=null && String(username).trim()!==''){
    const normalized=normalizeMobile(username);
    if(normalized!==String(mobileNormalized||mobile)){
      const duplicate=db.prepare('SELECT id FROM students WHERE mobile_normalized=? AND id<>? AND deleted_at IS NULL').get(normalized,studentId);
      if(duplicate) throw Object.assign(new Error('این شماره همراه برای شاگرد دیگری ثبت شده است'),{statusCode:409,code:'MOBILE_EXISTS'});
      mobile=normalized;
      mobileNormalized=normalized;
      changes.push('username');
      if(passwordState!=='PERSONAL'){
        revealedTemporary=temporaryPassword(normalized);
        passwordHash=hashPassword(revealedTemporary);
        passwordState='TEMPORARY';
        changes.push('temporary_password');
      }
    }
  }
  if(resetTemporary){
    if(!mobileNormalized) throw Object.assign(new Error('شماره همراه برای ساخت رمز موقت لازم است'),{statusCode:400});
    revealedTemporary=temporaryPassword(mobileNormalized);
    passwordHash=hashPassword(revealedTemporary);
    passwordState='TEMPORARY';
    changes.push('reset_temporary');
  }else if(password!=null && String(password)!==''){
    if(confirmPassword!==undefined && String(confirmPassword)!==String(password)){
      throw Object.assign(new Error('تکرار رمز عبور مطابقت ندارد'),{statusCode:400});
    }
    revealedPassword=validatePersonalPassword(password);
    passwordHash=hashPassword(revealedPassword);
    passwordState='PERSONAL';
    changes.push('password');
  }
  if(unlock) changes.push('unlock');
  if(!changes.length) throw Object.assign(new Error('تغییری برای ذخیره وجود ندارد'),{statusCode:400});
  const passwordChanged=changes.includes('password')||changes.includes('reset_temporary')||changes.includes('temporary_password');
  const clearLock=unlock||passwordChanged;
  db.prepare(`
    UPDATE students
    SET mobile=?,mobile_normalized=?,password_hash=?,password_state=?,
        password_changed_at=?,auth_failed_attempts=?,auth_locked_until=?,
        updated_at=CURRENT_TIMESTAMP,version=version+1
    WHERE id=? AND deleted_at IS NULL
  `).run(
    mobile,mobileNormalized,passwordHash,passwordState,
    passwordChanged?new Date().toISOString():(student.password_changed_at||null),
    clearLock?0:Number(student.auth_failed_attempts||0),
    clearLock?null:student.auth_locked_until||null,
    studentId
  );
  let sessionsRevoked=0;
  if(passwordChanged||changes.includes('username')){
    sessionsRevoked=require('./student-session-service').revokeStudentSessions(db,studentId);
  }
  const view=credentialsView(db.prepare('SELECT * FROM students WHERE id=?').get(studentId));
  // A personal password set in the same save supersedes the rebuilt temporary one.
  if(revealedTemporary&&passwordState!=='PERSONAL') view.temporary_password=revealedTemporary;
  return {...view,password_once:revealedPassword||null,sessions_revoked:sessionsRevoked,changes};
}

const IRAN_PROVINCES_AND_CITIES = {
  'تهران': ['تهران', 'ری', 'شمیرانات', 'اسلامشهر', 'شهریار', 'قدس', 'ملارد', 'ورامین', 'پاکدشت', 'بهارستان', 'دماوند', 'پردیس', 'قرچک', 'رباط‌کریم', 'فیروزکوه'],
  'اصفهان': ['اصفهان', 'کاشان', 'نجف‌آباد', 'خمینی‌شهر', 'شاهین‌شهر', 'لنجان', 'فلاورجان', 'فولادشهر', 'مبارکه', 'شهرضا', 'گلپایگان', 'نائین', 'نطنز', 'خوانسار', 'اردستان', 'سمیرم'],
  'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'کاشمر', 'قوچان', 'تربت جام', 'چناران', 'تایباد', 'سرخس', 'گناباد', 'فریمان', 'درگز'],
  'فارس': ['شیراز', 'مرودشت', 'کازرون', 'جهرم', 'فسا', 'لارستان', 'داراب', 'آباده', 'اقلید', 'فیروزآباد', 'نی‌ریز', 'ممسنی', 'استهبان', 'سپیدان'],
  'خوزستان': ['اهواز', 'دزفول', 'آبادان', 'ماهشهر', 'خرمشهر', 'بهبهان', 'ایذه', 'شوشتر', 'شوش', 'اندیمشک', 'مسجدسلیمان', 'رامهرمز', 'امیدیه', 'هندیجان'],
  'آذربایجان شرقی': ['تبریز', 'مراغه', 'مرند', 'میانه', 'اهر', 'بناب', 'شبستر', 'سراب', 'آذرشهر', 'اسکو', 'هریس', 'عجب‌شیر', 'جلفا', 'ملکان'],
  'مازندران': ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'بهشهر', 'بابلسر', 'تنکابن', 'نوشهر', 'چالوس', 'نکا', 'نور', 'رامسر', 'محمودآباد', 'فریدونکنار'],
  'گیلان': ['رشت', 'انزلی', 'لاهیجان', 'لنگرود', 'تالش', 'رودسر', 'فومن', 'صومعه‌سرا', 'آستارا', 'رودبار', 'املش', 'ماسال', 'شفت', 'سیاهکل'],
  'البرز': ['کرج', 'فردیس', 'ساوجبلاغ', 'نظرآباد', 'اشتهارد', 'هشتگرد', 'طالقان', 'چهارباغ'],
  'آذربایجان غربی': ['ارومیه', 'خوی', 'بوکان', 'مهاباد', 'میاندوآب', 'سلماس', 'پیرانشهر', 'نقده', 'سردشت', 'شاهین‌دژ', 'تکاب', 'ماکو'],
  'کرمان': ['کرمان', 'سیرجان', 'رفسنجان', 'جیرفت', 'بم', 'زرند', 'بافت', 'کهنوج', 'شهربابک', 'بردسیر', 'عنبرآباد', 'منوجان'],
  'هرمزگان': ['بندرعباس', 'قشم', 'کیش', 'میناب', 'بندرلنگه', 'رودان', 'بستک', 'حاجی‌آباد', 'جاسک', 'پارسیان', 'خمیر'],
  'کرمانشاه': ['کرمانشاه', 'اسلام‌آباد غرب', 'کنگاور', 'سنقر', 'هرسین', 'صحنه', 'پاوه', 'سرپل ذهاب', 'جوانرود', 'روانسر'],
  'یزد': ['یزد', 'میبد', 'اردکان', 'بافق', 'مهریز', 'ابرکوه', 'تفت', 'خاتم', 'اشکذر', 'بهاباد'],
  'مرکزی': ['اراک', 'ساوه', 'خمین', 'محلات', 'دلیجان', 'شازند', 'زرندیه', 'تفرش', 'فراهان', 'آشتیان'],
  'قم': ['قم', 'قنوات', 'سلفچگان', 'جعفریه', 'کهک', 'دستجرد'],
  'همدان': ['همدان', 'ملایر', 'نهاوند', 'تویسرکان', 'اسدآباد', 'کبودرآهنگ', 'بهار', 'رزن', 'درگزین', 'فامنین'],
  'قزوین': ['قزوین', 'تاکستان', 'الوند', 'بویین‌زهرا', 'آبیک', 'اقبالیه', 'محمدیه', 'محمودآباد نمونه'],
  'گلستان': ['گرگان', 'گنبد کاووس', 'علی‌آباد کتول', 'بندر ترکمن', 'کلاله', 'آق‌قلا', 'کردکوی', 'مینودشت', 'آزادشهر'],
  'لرستان': ['خرم‌آباد', 'بروجرد', 'دورود', 'کوهدشت', 'الیگودرز', 'نورآباد', 'ازنا', 'پلدختر', 'الشتر', 'چگنی'],
  'اردبیل': ['اردبیل', 'پارس‌آباد', 'مشگین‌شهر', 'خلخال', 'گرمی', 'بیله‌سوار', 'نمین', 'سرعین', 'کوثر', 'اصلاندوز'],
  'کردستان': ['سنندج', 'سقز', 'مریوان', 'بانه', 'قروه', 'کامیاران', 'بیجار', 'دیواندره', 'دهگلان', 'سروآباد'],
  'سمنان': ['سمنان', 'شاهرود', 'دامغان', 'گرمسار', 'مهدی‌شهر', 'ایوانکی', 'شهمیرزاد', 'آرادان', 'سرخه'],
  'سیستان و بلوچستان': ['زاهدان', 'زابل', 'چابهار', 'ایرانشهر', 'سراوان', 'خاش', 'کنارک', 'نیک‌شهر', 'دشتیاری', 'راسک'],
  'بوشهر': ['بوشهر', 'برازجان', 'کنگان', 'گناوه', 'عسلویه', 'خورموج', 'جم', 'دیر', 'دیلم', 'تنگستان'],
  'زنجان': ['زنجان', 'ابهر', 'خرمدره', 'قیدار', 'هیدج', 'صائین‌قلعه', 'ماهنشان', 'آب‌بر', 'زرین‌رود'],
  'چهارمحال و بختیاری': ['شهرکرد', 'بروجن', 'لردگان', 'فرخ‌شهر', 'فارسان', 'هفشجان', 'سامان', 'بن', 'کیار'],
  'خراسان جنوبی': ['بیرجند', 'قائنات', 'طبس', 'فردوس', 'نهبندان', 'سرایان', 'سربیشه', 'درمیان', 'بشرویه'],
  'خراسان شمالی': ['بجنورد', 'شیروان', 'اسفراین', 'آشخانه', 'جاجرم', 'گرمه', 'فاروج', 'راز و جرگلان'],
  'کهگیلویه و بویراحمد': ['یاسوج', 'دوگنبدان', 'دهدشت', 'چرام', 'سی‌سخت', 'باشت', 'لنده', 'لیکک'],
  'ایلام': ['ایلام', 'دهلران', 'ایوان', 'آبدانان', 'دره‌شهر', 'مهران', 'سرابله', 'لومار', 'ملکشاهی', 'چوار']
};

function normalizeDateOfBirth(input) {
  const raw = String(input || '').trim()
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\/\-\.]/g, '-');
  
  if (!raw) return null;
  // If in YYYY-MM-DD format (either Jalali or Gregorian)
  const parts = raw.split('-');
  if (parts.length === 3) {
    const y = parts[0].padStart(4, '13');
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
  return raw;
}

function registerStudent(db, data = {}) {
  const fullName = String(data.full_name || '').trim();
  if (!fullName || fullName.length < 2 || fullName.length > 100) {
    throw Object.assign(new Error('نام و نام خانوادگی الزامی است (حداقل ۲ کاراکتر).'), { statusCode: 400 });
  }

  const normalizedMobile = normalizeMobile(data.mobile);
  const existing = db.prepare('SELECT id FROM students WHERE mobile_normalized = ? AND deleted_at IS NULL').get(normalizedMobile);
  if (existing) {
    throw Object.assign(new Error('این شماره همراه قبلاً در سامانه ثبت شده است. لطفاً وارد شوید یا از شماره دیگری استفاده کنید.'), { statusCode: 409, code: 'MOBILE_EXISTS' });
  }

  const dateOfBirth = normalizeDateOfBirth(data.date_of_birth);
  if (!dateOfBirth) {
    throw Object.assign(new Error('تاریخ تولد الزامی است.'), { statusCode: 400 });
  }

  const province = String(data.province || '').trim();
  if (!province || !IRAN_PROVINCES_AND_CITIES[province]) {
    throw Object.assign(new Error('لطفاً استان محل سکونت را به درستی انتخاب کنید.'), { statusCode: 400 });
  }

  const city = String(data.city || '').trim();
  if (!city || !IRAN_PROVINCES_AND_CITIES[province].includes(city)) {
    throw Object.assign(new Error('لطفاً شهر محل سکونت را متناسب با استان انتخاب کنید.'), { statusCode: 400 });
  }

  const address = String(data.address || '').trim();
  if (!address || address.length < 5) {
    throw Object.assign(new Error('آدرس کامل محل سکونت الزامی است (حداقل ۵ کاراکتر).'), { statusCode: 400 });
  }

  const password = validatePersonalPassword(data.password);
  if (data.confirm_password !== undefined && String(data.confirm_password) !== password) {
    throw Object.assign(new Error('تکرار رمز عبور با رمز عبور وارد شده مطابقت ندارد.'), { statusCode: 400 });
  }

  const passwordHash = hashPassword(password);
  const stableId = 'st_' + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const goal = data.goal ? String(data.goal).trim() : '';
  // Accept localized body numbers (e.g. '۷۰', '70 کیلو', '۱۷۵/۵') instead of
  // silently dropping them to null when they contain Persian digits or units.
  const parseBodyNumber = value => {
    const raw = String(value ?? '').trim();
    if (raw === '') return null;
    const normalized = raw
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[٫,\\/]/g, '.').replace(/٬/g, '').replace(/\s+/g, '').replace(/[^\d.\-]/g, '');
    if (normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.') return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const height = parseBodyNumber(data.height);
  const weight = parseBodyNumber(data.weight);
  
  let gender = 'unspecified';
  if (['male', 'female', 'unspecified'].includes(data.gender)) {
    gender = data.gender;
  } else if (data.gender === 'مرد' || data.gender === 'آقا') {
    gender = 'male';
  } else if (data.gender === 'زن' || data.gender === 'خانم') {
    gender = 'female';
  }

  db.exec('BEGIN');
  try {
    const insertRes = db.prepare(`
      INSERT INTO students (
        stable_id, full_name, mobile, mobile_normalized,
        password_hash, password_state, status, profile_status, goal,
        height, weight, gender, date_of_birth, province, city, address,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PERSONAL', 'فعال', 'INVITED', ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      stableId,
      fullName,
      normalizedMobile,
      normalizedMobile,
      passwordHash,
      goal,
      height,
      weight,
      gender,
      dateOfBirth,
      province,
      city,
      address
    );

    const studentId = Number(insertRes.lastInsertRowid);
    const created = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    db.exec('COMMIT');

    return created;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports={IRAN_PROVINCES_AND_CITIES,normalizeMobile,normalizeDateOfBirth,temporaryPassword,normalizeTemporaryPasswordInput,hashPassword,verifyPassword,validatePersonalPassword,authColumnsForMobile,safeStudent,authenticate,setPersonalPassword,credentialsView,mobileAuthUpdate,manageCredentials,registerStudent};
