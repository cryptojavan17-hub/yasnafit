'use strict';
// Public site content that is not the magazine: success stories (results),
// the coach profile that drives /about, and public site settings
// (contact info, image overrides, automation toggles).
//
// Privacy rule: success stories never store or expose the student's personal
// data — only a display name (optional, e.g. a first name or case nickname),
// consent status, and images the coach is allowed to publish.

const crypto = require('crypto');

const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
};

const cleanPath = value => {
  const text = String(value ?? '').trim().replace(/^\/+/, '/');
  if (!text) return null;
  if (text.length > 300) return null;
  if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:')) return null;
  if (!text.startsWith('/')) return null;
  if (text.includes('..')) return null;
  return text;
};

// ---------- Success stories ----------

function publicStoryView(row) {
  let metrics = null;
  try { metrics = row.metrics ? JSON.parse(row.metrics) : null; } catch (e) { metrics = null; }
  return {
    title: row.title,
    display_name: row.display_name || null,
    duration_months: row.duration_months,
    goal: row.goal || null,
    metrics,
    testimonial: row.testimonial || null,
    before_image: row.before_image || null,
    after_image: row.after_image || null
  };
}

function listPublicStories(db) {
  // Privacy boundary: a story is public only when explicitly published AND
  // the student consented (consent_status 'none' stays admin-only).
  return db.prepare(`
    SELECT * FROM success_stories
    WHERE status='PUBLISHED' AND deleted_at IS NULL AND consent_status <> 'none'
    ORDER BY sort_order, id DESC
  `).all().map(publicStoryView);
}

function listAdminStories(db) {
  const rows = db.prepare('SELECT * FROM success_stories WHERE deleted_at IS NULL ORDER BY sort_order, id DESC').all();
  return rows.map(row => ({
    id: row.id,
    ...publicStoryView(row),
    consent_status: row.consent_status,
    status: row.status,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

function validateStory(input) {
  const errors = [];
  const title = clean(input.title, 160);
  if (!title) errors.push('عنوان نتیجه الزامی است');
  const goal = clean(input.goal, 300);
  const testimonial = clean(input.testimonial, 1000);
  const duration = input.duration_months === undefined || input.duration_months === '' || input.duration_months == null ? null : Number(input.duration_months);
  if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 60)) errors.push('مدت زمان باید یک عدد صحیح (۱ تا ۶۰ ماه) باشد');
  let metrics = null;
  if (input.metrics !== undefined && input.metrics !== null && input.metrics !== '') {
    const parsed = typeof input.metrics === 'string' ? (() => { try { return JSON.parse(input.metrics); } catch (e) { return null; } })() : input.metrics;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metrics = JSON.stringify(parsed);
  }
  const consent = ['none', 'verbal', 'written'].includes(input.consent_status) ? input.consent_status : 'none';
  const display = clean(input.display_name, 80);
  return {
    errors,
    title,
    display_name: display || null,
    goal: goal || null,
    testimonial: testimonial || null,
    duration_months: duration,
    metrics,
    consent_status: consent,
    before_image: cleanPath(input.before_image),
    after_image: cleanPath(input.after_image),
    sort_order: Number(input.sort_order) || 0
  };
}

function createStory(db, input) {
  const v = validateStory(input);
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  const info = db.prepare(`
    INSERT INTO success_stories (stable_id, title, display_name, duration_months, goal, metrics, testimonial, before_image, after_image, consent_status, status, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'DRAFT', ?)
  `).run(crypto.randomUUID(), v.title, v.display_name, v.duration_months, v.goal, v.metrics, v.testimonial, v.before_image, v.after_image, v.consent_status, v.sort_order);
  return db.prepare('SELECT * FROM success_stories WHERE id=?').get(Number(info.lastInsertRowid));
}

function updateStory(db, id, input) {
  const existing = db.prepare('SELECT * FROM success_stories WHERE id=? AND deleted_at IS NULL').get(id);
  if (!existing) { const error = new Error('نتیعه پیدا نشد'); error.statusCode = 404; throw error; }
  const merged = {
    title: input.title !== undefined ? input.title : existing.title,
    display_name: input.display_name !== undefined ? input.display_name : existing.display_name,
    goal: input.goal !== undefined ? input.goal : existing.goal,
    testimonial: input.testimonial !== undefined ? input.testimonial : existing.testimonial,
    duration_months: input.duration_months !== undefined ? input.duration_months : existing.duration_months,
    metrics: input.metrics !== undefined ? input.metrics : existing.metrics,
    consent_status: input.consent_status !== undefined ? input.consent_status : existing.consent_status,
    before_image: input.before_image !== undefined ? input.before_image : existing.before_image,
    after_image: input.after_image !== undefined ? input.after_image : existing.after_image,
    sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order
  };
  const v = validateStory(merged);
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  db.prepare(`
    UPDATE success_stories
    SET title=?, display_name=?, duration_months=?, goal=?, metrics=?, testimonial=?,
        before_image=?, after_image=?, consent_status=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND deleted_at IS NULL
  `).run(v.title, v.display_name, v.duration_months, v.goal, v.metrics, v.testimonial, v.before_image, v.after_image, v.consent_status, v.sort_order, id);
  return db.prepare('SELECT * FROM success_stories WHERE id=?').get(id);
}

function transitionStory(db, id, action) {
  const existing = db.prepare('SELECT * FROM success_stories WHERE id=? AND deleted_at IS NULL').get(id);
  if (!existing) { const error = new Error('نتیعه پیدا نشد'); error.statusCode = 404; throw error; }
  if (action === 'publish') {
    db.prepare(`UPDATE success_stories SET status='PUBLISHED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  } else if (action === 'unpublish') {
    db.prepare(`UPDATE success_stories SET status='DRAFT', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  } else if (action === 'archive') {
    db.prepare(`UPDATE success_stories SET status='ARCHIVED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  } else {
    const error = new Error('عملیات نامعتبر است'); error.statusCode = 400; throw error;
  }
  return db.prepare('SELECT * FROM success_stories WHERE id=?').get(id);
}

function deleteStory(db, id) {
  const info = db.prepare('UPDATE success_stories SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').run(id);
  if (!info.changes) { const error = new Error('نتیعه پیدا نشد'); error.statusCode = 404; throw error; }
  return { id, soft_deleted: true };
}

// ---------- Coach profile (drives /about) ----------

const PROFILE_FIELDS = ['display_name', 'title', 'highlight', 'bio', 'philosophy', 'methodology', 'photo', 'specialties', 'certifications', 'timeline', 'stats'];

function getCoachProfile(db) {
  const row = db.prepare('SELECT * FROM coach_profile WHERE id=1').get();
  const profile = {
    display_name: null, title: null, highlight: null, bio: null, philosophy: null,
    methodology: null, photo: null, specialties: [], certifications: [], timeline: [], stats: []
  };
  if (!row) return profile;
  for (const field of ['display_name', 'title', 'highlight', 'bio', 'philosophy', 'methodology', 'photo']) {
    profile[field] = row[field] || null;
  }
  for (const field of ['specialties', 'certifications', 'timeline', 'stats']) {
    try {
      const parsed = row[field] ? JSON.parse(row[field]) : [];
      profile[field] = Array.isArray(parsed) ? parsed : [];
    } catch (e) { profile[field] = []; }
  }
  profile.updated_at = row.updated_at;
  return profile;
}

function updateCoachProfile(db, input) {
  const updates = {};
  for (const field of PROFILE_FIELDS) {
    if (input[field] === undefined) continue;
    if (['specialties', 'certifications', 'timeline', 'stats'].includes(field)) {
      const value = Array.isArray(input[field]) ? input[field].slice(0, 40) : [];
      updates[field] = JSON.stringify(value);
    } else {
      const max = field === 'photo' ? 300 : 20000;
      const text = String(input[field] ?? '').trim();
      if (!text) { updates[field] = null; continue; }
      updates[field] = text.slice(0, max);
    }
  }
  if (updates.photo && updates.photo !== null) {
    const safe = cleanPath(updates.photo);
    if (!safe) { const error = new Error('آدرس تصویر نامعتبر است'); error.statusCode = 400; throw error; }
    updates.photo = safe;
  }
  const fields = Object.keys(updates);
  if (fields.length) {
    db.prepare(`
      INSERT INTO coach_profile (id, ${fields.join(', ')}, updated_at) VALUES (1, ${fields.map(() => '?').join(', ')}, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET ${fields.map(f => `${f}=excluded.${f}`).join(', ')}, updated_at=CURRENT_TIMESTAMP
    `).run(...fields.map(f => updates[f]));
  }
  return getCoachProfile(db);
}

// ---------- Public site settings (key/value in the shared settings table) ----------

const SITE_SETTINGS_DEFAULTS = {
  'site.hero_image': '/images/landing/hero-woman.jpg',
  'site.about_image': '/images/landing/about-woman.jpg',
  'site.cta_image': '/images/landing/cta-woman.jpg',
  'site.og_image': '/login-hero.png',
  'site.contact_telegram': '',
  'site.telegram_bot_username': '',
  'site.contact_instagram': '',
  'site.contact_facebook': '',
  'site.contact_email': '',
  'site.contact_note': '',
  'magazine.auto_fetch': '0',
  'magazine.auto_publish': '0',
  'magazine.fetch_interval': '12',
  'magazine.category_enabled.bodybuilding': '1',
  'magazine.category_enabled.sports-science': '1',
  'magazine.category_enabled.nutrition': '1',
  'magazine.category_enabled.health': '1',
  'magazine.category_enabled.sports-news': '1'
};

function getSiteSettings(db) {
  const result = { ...SITE_SETTINGS_DEFAULTS };
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key LIKE 'site.%' OR key LIKE 'magazine.%'`).all();
  for (const row of rows) result[row.key] = row.value;
  // Automation guard: automatic publishing is never a real default. Even if a
  // stale value exists, the UI must treat it as off unless explicitly '1'.
  if (result['magazine.auto_publish'] !== '1') result['magazine.auto_publish'] = '0';
  return result;
}

function updateSiteSettings(db, input) {
  const keys = Object.keys(SITE_SETTINGS_DEFAULTS);
  for (const key of keys) {
    if (input[key] === undefined) continue;
    let value = String(input[key] ?? '').trim();
    if (key.startsWith('magazine.category_enabled.')) value = value === '1' ? '1' : '0';
    else if (key === 'magazine.auto_fetch' || key === 'magazine.auto_publish') value = value === '1' ? '1' : '0';
    else if (key === 'magazine.fetch_interval') value = ['6','12','24'].includes(value) ? value : '12';
    else if (key.startsWith('site.contact_')) value = value.slice(0, 300);
    else if (key === 'site.telegram_bot_username') value = value.replace(/^@+/, '').trim().slice(0, 64);
    else if (key.startsWith('site.')) value = cleanPath(value) || '';
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  return getSiteSettings(db);
}

function publicSiteInfo(db) {
  const s = getSiteSettings(db);
  const enabledCategories = Object.keys(s)
    .filter(key => key.startsWith('magazine.category_enabled.') && s[key] === '1')
    .map(key => key.replace('magazine.category_enabled.', ''));
  return {
    hero_image: s['site.hero_image'] || null,
    about_image: s['site.about_image'] || null,
    cta_image: s['site.cta_image'] || null,
    og_image: s['site.og_image'] || null,
    contact: {
      telegram: s['site.contact_telegram'] || null,
      instagram: s['site.contact_instagram'] || null,
      facebook: s['site.contact_facebook'] || null,
      email: s['site.contact_email'] || null,
      note: s['site.contact_note'] || null
    },
    telegram_bot_username: s['site.telegram_bot_username'] || null,
    enabled_categories: enabledCategories
  };
}

module.exports = {
  listPublicStories,
  listAdminStories,
  createStory,
  updateStory,
  transitionStory,
  deleteStory,
  getCoachProfile,
  updateCoachProfile,
  SITE_SETTINGS_DEFAULTS,
  getSiteSettings,
  updateSiteSettings,
  publicSiteInfo
};
