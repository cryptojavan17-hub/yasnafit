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
  console.log('--- 1. Testing Student Self-Registration Service ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);

  // 1a. Successful self-registration
  const student = auth.registerStudent(db, {
    full_name: 'سارا رضایی',
    mobile: '۰۹۳۵ ۱۲۳ ۴۵۶۷',
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
  assert.match(student.case_number, /^\d{6}$/, 'Case number must be a 6-digit number');

  // Verify password verification with scrypt
  assert.ok(auth.verifyPassword('SecurePassword123!', student.password_hash), 'Password must be verifiable with scrypt');

  // Verify coach assignment trigger
  const coachRel = db.prepare('SELECT * FROM coach_students WHERE student_id = ?').get(student.id);
  assert.ok(coachRel, 'Student must be automatically associated with default coach');

  console.log('--- 2. Testing Registration Validations ---');
  // 2a. Duplicate mobile rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'سارا رضایی دوم',
      mobile: '09351234567',
      password: 'AnotherPassword123!'
    });
  }, (err) => {
    return err.statusCode === 409 && err.code === 'MOBILE_EXISTS';
  }, 'Must reject duplicate mobile with 409 and MOBILE_EXISTS');

  // 2b. Password mismatch rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      password: 'Password123!',
      confirm_password: 'MismatchPassword!'
    });
  }, /تکرار رمز عبور/, 'Must reject mismatched confirm_password');

  // 2c. Short password rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: 'علی کریمی',
      mobile: '09129998877',
      password: 'short'
    });
  }, /حداقل ۸ کاراکتر/, 'Must reject password shorter than 8 chars');

  // 2d. Missing name rejection
  assert.throws(() => {
    auth.registerStudent(db, {
      full_name: '',
      mobile: '09129998877',
      password: 'Password123!'
    });
  }, /نام و نام خانوادگی الزامی است/, 'Must reject missing full_name');

  console.log('--- 3. Testing Session Creation for Self-Registered Student ---');
  const session = sessions.createStudentSession(db, student.id, null);
  assert.ok(session.raw_session, 'Raw session token must be generated');
  assert.ok(session.expires_at, 'Session expiration must be set');

  const resolved = sessions.resolveStudentSession(db, {
    headers: { cookie: `${sessions.SESSION_COOKIE}=${session.raw_session}` },
    socket: { encrypted: false }
  });
  assert.equal(resolved.student_id, student.id, 'Session must resolve to the registered student');

  console.log('--- 4. Testing Login for Self-Registered Student ---');
  const loginRes = auth.authenticate(db, '09351234567', 'SecurePassword123!');
  assert.equal(loginRes.student.id, student.id);
  assert.equal(loginRes.student.password_state, 'PERSONAL');

  console.log('--- 5. Testing UI & Glassmorphism Design Elements ---');
  const studentAppJs = fs.readFileSync(path.join(publicDir, 'student-app.js'), 'utf8');
  const studentAppCss = fs.readFileSync(path.join(publicDir, 'student-app.css'), 'utf8');

  assert.ok(studentAppJs.includes('/api/student/auth/register'), 'student-app.js must wire /api/student/auth/register');
  assert.ok(studentAppJs.includes('studentRegisterForm'), 'student-app.js must define #studentRegisterForm');
  assert.ok(studentAppJs.includes('evaluatePasswordStrength'), 'student-app.js must include password strength evaluator');
  assert.ok(studentAppJs.includes('ثبت‌نام شاگرد جدید'), 'student-app.js must include register tab title');
  assert.ok(studentAppJs.includes('ورود به حساب'), 'student-app.js must include login tab title');
  assert.ok(studentAppCss.includes('glass-auth-card'), 'student-app.css must define glass-auth-card');
  assert.ok(studentAppCss.includes('backdrop-filter'), 'student-app.css must use backdrop-filter');
  assert.doesNotMatch(studentAppCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'student-app.css must not use raw hex colors');
  assert.doesNotMatch(studentAppCss, /!important/i, 'student-app.css must not use !important');

  db.close();
  console.log(JSON.stringify({
    ok: true,
    self_registration_verified: true,
    scrypt_personal_password: true,
    unique_mobile_409_handled: true,
    automatic_case_number_assigned: true,
    session_cookie_created: true,
    glassmorphism_ui_compliant: true
  }));
})();
