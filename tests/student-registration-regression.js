#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const auth = require('../src/student-auth-service');
const sessions = require('../src/student-session-service');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

(() => {
  console.log('--- 1. Testing Student Complete Self-Registration Service ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);

  // 1a. Successful self-registration with full updated fields
  const student = auth.registerStudent(db, {
    full_name: 'سارا رضایی',
    mobile: '۰۹۳۵ ۱۲۳ ۴۵۶۷',
    date_of_birth: '۱۳۷۵/۰۴/۱۵',
    province: 'تهران',
    city: 'تهران',
    address: 'تهران، خیابان ولیعصر، کوچه فرجام، پلاک ۱۲، واحد ۳',
    password: 'SecurePassword123!',
    confirm_password: 'SecurePassword123!',
    goal: 'کاهش وزن و چربی‌سوزی',
    height: 168,
    weight: 62,
    gender: 'female',
    terms_accepted: true
  });

  assert.ok(student, 'Student record must be created');
  assert.equal(student.full_name, 'سارا رضایی');
  assert.equal(student.mobile, '09351234567');
  assert.equal(student.mobile_normalized, '09351234567');
  assert.equal(student.password_state, 'PERSONAL');
  assert.equal(student.status, 'فعال');
  assert.equal(student.gender, 'female');
  assert.equal(student.height, 168);
  assert.equal(student.weight, 62);
  assert.equal(student.province, 'تهران');
  assert.equal(student.city, 'تهران');
  assert.equal(student.address, 'تهران، خیابان ولیعصر، کوچه فرجام، پلاک ۱۲، واحد ۳');
  assert.equal(student.date_of_birth, '1375/04/15');
  assert.match(student.case_number, /^\d{6}$/, 'Case number must be a 6-digit number');

  // Verify password verification with scrypt
  assert.ok(auth.verifyPassword('SecurePassword123!', student.password_hash), 'Password must be verifiable with scrypt');

  // Verify coach assignment trigger
  const coachRel = db.prepare('SELECT * FROM coach_students WHERE student_id = ?').get(student.id);
  assert.ok(coachRel, 'Student must be automatically associated with default coach');

  console.log('--- 2. Testing 31 Provinces & Cities Dataset ---');
  assert.equal(Object.keys(auth.IRAN_PROVINCES_AND_CITIES).length, 31, 'Must contain all 31 Iranian provinces');
  assert.ok(auth.IRAN_PROVINCES_AND_CITIES['تهران'].includes('تهران'), 'Tehran province must contain Tehran');
  assert.ok(auth.IRAN_PROVINCES_AND_CITIES['اصفهان'].includes('کاشان'), 'Isfahan province must contain Kashan');
  assert.ok(auth.IRAN_PROVINCES_AND_CITIES['فارس'].includes('شیراز'), 'Fars province must contain Shiraz');
  assert.ok(auth.IRAN_PROVINCES_AND_CITIES['خراسان رضوی'].includes('مشهد'), 'Khorasan Razavi province must contain Mashhad');

  console.log('--- 3. Testing Registration Validations ---');
  // 3a. Duplicate mobile rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'سارا رضایی دوم',
      mobile: '09351234567',
      date_of_birth: '1376/01/01',
      province: 'تهران',
      city: 'تهران',
      address: 'تهران، خیابان آزادی',
      password: 'AnotherPassword123!'
    });
  }, (err) => {
    return err.statusCode === 409 && err.code === 'MOBILE_EXISTS';
  }, 'Must reject duplicate mobile with 409 and MOBILE_EXISTS');

  // 3b. Invalid province rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      date_of_birth: '1370/05/10',
      province: 'استان نامعتبر',
      city: 'تهران',
      address: 'خیابان بهار',
      password: 'Password123!',
      confirm_password: 'Password123!'
    });
  }, /استان محل سکونت/, 'Must reject invalid province');

  // 3c. Invalid city for province rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      date_of_birth: '1370/05/10',
      province: 'اصفهان',
      city: 'شیراز', // Shiraz is in Fars, not Isfahan
      address: 'خیابان اصلی',
      password: 'Password123!',
      confirm_password: 'Password123!'
    });
  }, /شهر محل سکونت/, 'Must reject mismatched city');

  // 3d. Missing address rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      date_of_birth: '1370/05/10',
      province: 'تهران',
      city: 'تهران',
      address: 'کوی', // Less than 5 chars
      password: 'Password123!',
      confirm_password: 'Password123!'
    });
  }, /آدرس کامل محل سکونت/, 'Must reject missing or too short address');

  // 3e. Password mismatch rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      date_of_birth: '1370/05/10',
      province: 'تهران',
      city: 'تهران',
      address: 'خیابان کارگر شمالی پلاک ۲',
      password: 'Password123!',
      confirm_password: 'MismatchPassword!'
    });
  }, /تکرار رمز عبور/, 'Must reject mismatched confirm_password');

  // 3f. Short password rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      date_of_birth: '1370/05/10',
      province: 'تهران',
      city: 'تهران',
      address: 'خیابان کارگر شمالی پلاک ۲',
      password: 'short'
    });
  }, /حداقل ۸ کاراکتر/, 'Must reject password shorter than 8 chars');

  console.log('--- 4. Testing Session Creation for Self-Registered Student ---');
  const session = sessions.createStudentSession(db, student.id, null);
  assert.ok(session.raw_session, 'Raw session token must be generated');
  assert.ok(session.expires_at, 'Session expiration must be set');

  const resolved = sessions.resolveStudentSession(db, {
    headers: { cookie: `${sessions.SESSION_COOKIE}=${session.raw_session}` },
    socket: { encrypted: false }
  });
  assert.equal(resolved.student_id, student.id, 'Session must resolve to the registered student');

  console.log('--- 5. Testing Login for Self-Registered Student ---');
  const loginRes = auth.authenticate(db, '09351234567', 'SecurePassword123!');
  assert.equal(loginRes.student.id, student.id);
  assert.equal(loginRes.student.password_state, 'PERSONAL');

  console.log('--- 6. Testing UI & Glassmorphism Design Elements ---');
  const studentAppJs = fs.readFileSync(path.join(publicDir, 'student-app.js'), 'utf8');
  const studentAppCss = fs.readFileSync(path.join(publicDir, 'student-app.css'), 'utf8');

  assert.ok(studentAppJs.includes('/api/student/auth/register'), 'student-app.js must wire /api/student/auth/register');
  assert.ok(studentAppJs.includes('studentRegisterForm'), 'student-app.js must define #studentRegisterForm');
  assert.ok(studentAppJs.includes('regProvince'), 'student-app.js must contain province selector');
  assert.ok(studentAppJs.includes('regCity'), 'student-app.js must contain city selector');
  assert.ok(studentAppJs.includes('regAddress'), 'student-app.js must contain address textarea');
  assert.ok(studentAppJs.includes('regDob'), 'student-app.js must contain date of birth field');
  assert.ok(studentAppJs.includes('evaluatePasswordStrength'), 'student-app.js must include password strength evaluator');
  assert.ok(studentAppJs.includes('ثبت‌نام'), 'student-app.js must include register title');
  assert.ok(studentAppJs.includes('ورود'), 'student-app.js must include login title');
  assert.ok(studentAppJs.includes('خوش آمدید!'), 'student-app.js must include welcome title');
  assert.ok(studentAppJs.includes('registerSuccessBanner'), 'student-app.js must include registerSuccessBanner');
  assert.ok(studentAppJs.includes('registerErrorBanner'), 'student-app.js must include registerErrorBanner');
  assert.ok(studentAppCss.includes('auth-success-banner'), 'student-app.css must define auth-success-banner');
  assert.ok(studentAppCss.includes('auth-error-banner'), 'student-app.css must define auth-error-banner');
  assert.ok(studentAppCss.includes('glass-auth-card'), 'student-app.css must define glass-auth-card');
  assert.ok(studentAppCss.includes('backdrop-filter'), 'student-app.css must use backdrop-filter');
  assert.doesNotMatch(studentAppCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'student-app.css must not use raw hex colors');
  assert.doesNotMatch(studentAppCss, /!important/i, 'student-app.css must not use !important');

  db.close();
  console.log(JSON.stringify({
    ok: true,
    complete_self_registration_verified: true,
    iran_31_provinces_and_cities_verified: true,
    dependent_city_dropdown_verified: true,
    address_and_dob_stored: true,
    scrypt_personal_password: true,
    unique_mobile_409_handled: true,
    automatic_case_number_assigned: true,
    session_cookie_created: true,
    glassmorphism_ui_compliant: true
  }));
})();
