const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const PHOTO_TYPES = ['front', 'back', 'side', 'front_flex', 'back_flex', 'other'];
const EDITABLE_ASSESSMENT_STATUSES = ['PROFILE_INCOMPLETE', 'ASSESSMENT_PENDING', 'CHANGES_REQUESTED'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_ASSESSMENT = 10;

function genUUID(){
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function sanitizeFileName(name){
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
}

function isWithin(base, target){
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

function getAssessmentDir(studentId, assessmentId){
  if(!Number.isInteger(Number(studentId)) || !Number.isInteger(Number(assessmentId))) {
    throw new Error('Invalid assessment storage identifiers');
  }
  const root = path.resolve(__dirname, '..', 'data', 'assessments');
  const dir = path.resolve(root, String(studentId), String(assessmentId));
  if(!isWithin(root, dir)) throw new Error('Invalid assessment storage path');
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  return dir;
}

function detectImageMime(data){
  if(!Buffer.isBuffer(data) || data.length < 12) return null;
  // JPEG SOI plus EOI prevents accepting a renamed arbitrary prefix-only file.
  if(data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff &&
     data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) return 'image/jpeg';
  const pngSig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const pngEnd = Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
  if(data.subarray(0, 8).equals(pngSig) && data.subarray(-8).equals(pngEnd)) return 'image/png';
  if(data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function validateFile(file){
  const errors = [];
  if(!file || !Buffer.isBuffer(file.data)) return ['فایل نامعتبر'];

  if(file.size !== file.data.length) errors.push('اندازه فایل نامعتبر است');
  if(file.data.length > MAX_FILE_SIZE) errors.push('حجم فایل زیاد است - حداکثر 5MB');
  if(file.data.length === 0) errors.push('فایل خالی است');

  const declaredMime = String(file.mimeType || '').toLowerCase().split(';')[0].trim();
  const normalizedMime = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
  if(!ALLOWED_MIME.includes(normalizedMime)) errors.push('فقط JPEG، PNG و WEBP مجاز است');

  const originalName = String(file.originalFilename || '');
  const ext = path.extname(originalName).toLowerCase();
  if(!ALLOWED_EXT.includes(ext)) errors.push('پسوند فایل نامعتبر است');
  if(!originalName || originalName.length > 255 || originalName.includes('..') || /[\\/\0]/.test(originalName)) {
    errors.push('نام فایل نامعتبر است');
  }
  if(/\.(exe|bat|cmd|sh|php|js|mjs|html?|svg)(\.|$)/i.test(originalName)) errors.push('فایل اجرایی یا برداری مجاز نیست');

  const actualMime = detectImageMime(file.data);
  if(!actualMime) errors.push('محتوای فایل یک تصویر معتبر نیست');
  if(actualMime && normalizedMime !== actualMime) errors.push('نوع واقعی تصویر با MIME اعلام‌شده مطابقت ندارد');
  const expectedExts = actualMime === 'image/jpeg' ? ['.jpg','.jpeg'] : actualMime === 'image/png' ? ['.png'] : ['.webp'];
  if(actualMime && !expectedExts.includes(ext)) errors.push('پسوند با نوع واقعی تصویر مطابقت ندارد');
  return errors;
}

function parseMultipart(req, boundary){
  return new Promise((resolve, reject) => {
    if(!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) return reject(new Error('Invalid multipart boundary'));
    let raw = Buffer.alloc(0);
    let size = 0;
    let settled = false;
    req.on('data', chunk => {
      if(settled) return;
      size += chunk.length;
      if(size > 20 * 1024 * 1024){
        settled = true;
        const err = new Error('Request too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw = Buffer.concat([raw, chunk]);
    });
    req.on('end', () => {
      if(settled) return;
      try { resolve(parseMultipartBuffer(raw, boundary)); } catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}

function parseMultipartBuffer(buffer, boundary){
  const parts = [];
  const raw = buffer.toString('binary');
  for(const rawPart of raw.split('--' + boundary)){
    if(!rawPart || rawPart.trim() === '' || rawPart.trim() === '--') continue;
    const headerEnd = rawPart.indexOf('\r\n\r\n');
    if(headerEnd === -1) continue;
    const headersRaw = rawPart.substring(0, headerEnd);
    let body = rawPart.substring(headerEnd + 4);
    if(body.endsWith('\r\n')) body = body.substring(0, body.length - 2);
    const headers = {};
    for(const line of headersRaw.split('\r\n')){
      const idx = line.indexOf(':');
      if(idx > -1) headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
    }
    const disposition = headers['content-disposition'] || '';
    const name = disposition.match(/name="([^"]+)"/)?.[1] || null;
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    if(filename !== undefined){
      const data = Buffer.from(body, 'binary');
      parts.push({type:'file', name, originalFilename:filename, mimeType:headers['content-type'] || '', size:data.length, data});
    } else {
      parts.push({type:'field', name, value:Buffer.from(body, 'binary').toString('utf8')});
    }
  }
  return parts;
}

function getEditableAssessment(db, studentId, assessmentId){
  return db.prepare(`
    SELECT * FROM body_assessments
    WHERE id=? AND student_id=? AND deleted_at IS NULL
      AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED')
  `).get(assessmentId, studentId);
}

function saveAssessmentPhoto(db, studentId, assessmentId, file, photoType='front'){
  if(!PHOTO_TYPES.includes(photoType)) {
    const err = new Error('نوع عکس نامعتبر است'); err.statusCode = 400; throw err;
  }
  if(!getEditableAssessment(db, studentId, assessmentId)) {
    const err = new Error('ارزیابی متعلق به این شاگرد نیست یا پس از ارسال قابل تغییر نیست'); err.statusCode = 403; throw err;
  }
  const errors = validateFile(file);
  if(errors.length){
    const err = new Error(errors[0]); err.validationErrors = errors; err.statusCode = 400; throw err;
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL').get(assessmentId).c;
  const existing = db.prepare('SELECT id FROM assessment_photos WHERE assessment_id=? AND photo_type=? AND deleted_at IS NULL').get(assessmentId, photoType);
  if(!existing && count >= MAX_FILES_PER_ASSESSMENT){
    const err = new Error(`حداکثر ${MAX_FILES_PER_ASSESSMENT} عکس مجاز است`); err.statusCode = 400; throw err;
  }

  const dir = getAssessmentDir(studentId, assessmentId);
  const actualMime = detectImageMime(file.data);
  const ext = actualMime === 'image/jpeg' ? '.jpg' : actualMime === 'image/png' ? '.png' : '.webp';
  const stableId = genUUID();
  const storagePath = path.join(dir, `${stableId}_${photoType}${ext}`);
  if(!isWithin(dir, storagePath)) throw new Error('Invalid storage path');
  fs.writeFileSync(storagePath, file.data, {mode: 0o600, flag: 'wx'});

  try {
    db.exec('BEGIN');
    if(existing) db.prepare('UPDATE assessment_photos SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?').run(existing.id);
    const res = db.prepare(`
      INSERT INTO assessment_photos
        (stable_id, assessment_id, student_id, photo_type, storage_path, original_filename, mime_type, size_bytes, version, updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)
    `).run(stableId, assessmentId, studentId, photoType, storagePath, sanitizeFileName(file.originalFilename), actualMime, file.data.length);
    db.exec('COMMIT');
    return {id:res.lastInsertRowid, stable_id:stableId, photo_type:photoType, original_filename:sanitizeFileName(file.originalFilename), mime_type:actualMime, size_bytes:file.data.length};
  } catch(e){
    try { db.exec('ROLLBACK'); } catch(_){}
    try { fs.unlinkSync(storagePath); } catch(_){}
    throw e;
  }
}

function getPhotoFilePath(db, photoId){
  const photo = db.prepare('SELECT * FROM assessment_photos WHERE id=? AND deleted_at IS NULL').get(photoId);
  if(!photo || !fs.existsSync(photo.storage_path)) return null;
  const root = path.resolve(__dirname, '..', 'data', 'assessments');
  if(!isWithin(root, photo.storage_path) || !fs.statSync(photo.storage_path).isFile()) return null;
  return photo;
}

function deletePhoto(db, photoId, studentId=null){
  const params = [photoId];
  let ownerClause = '';
  if(studentId != null){ ownerClause = ' AND ap.student_id=?'; params.push(studentId); }
  const photo = db.prepare(`
    SELECT ap.id, ba.status FROM assessment_photos ap
    JOIN body_assessments ba ON ba.id=ap.assessment_id
    WHERE ap.id=? ${ownerClause} AND ap.deleted_at IS NULL AND ba.deleted_at IS NULL
  `).get(...params);
  if(!photo || !EDITABLE_ASSESSMENT_STATUSES.includes(photo.status)) return false;
  return db.prepare('UPDATE assessment_photos SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL').run(photoId).changes > 0;
}

module.exports = {
  ALLOWED_MIME, ALLOWED_EXT, PHOTO_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_ASSESSMENT,
  parseMultipart, parseMultipartBuffer, saveAssessmentPhoto, getPhotoFilePath,
  deletePhoto, getAssessmentDir, validateFile, detectImageMime, genUUID, sanitizeFileName, isWithin
};
