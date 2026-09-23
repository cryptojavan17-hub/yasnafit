/**
 * Analytics — بازدید صفحات عمومی، نشست، رویداد و جغرافیا.
 * IP واقعی فقط اینجا و فقط با شواهد عبور از Cloudflare خوانده می‌شود.
 * clientIp() و Rate Limit از این هدر استفاده نمی‌کنند.
 */
const crypto = require('crypto');
const requestSecurity = require('./request-security');

const GEO_MAX_ATTEMPTS = 5;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const ONLINE_MS = 5 * 60 * 1000;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
const VISITOR_COOKIE = 'yasnafit_vid';
const GEO_HTTPS = 'https://ipwho.is/';

// Published Cloudflare edges, fetched 2026-09-23 from cloudflare.com/ips-v4 and ips-v6.
const CF_V4 = ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22'];
const CF_V6 = ['2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'];
const PUBLIC_EXACT = new Set(['/', '/about', '/services', '/results', '/magazine', '/contact']);
const PUBLIC_JOIN = new RegExp('^/join/[A-Za-z0-9_-]{32,120}$');
const EVENT_TYPES = new Set(['landing_view', 'coach_page_view', 'register_start', 'registration_complete', 'login', 'telegram_connect', 'page_view']);
const SENSITIVE_QUERY = /token|password|passwd|secret|code|session|key|auth|jwt|cookie/i;
const BOT_RE = /bot|spider|crawler|slurp|curl|wget|python-requests|headless|preview|facebookexternalhit|embedly|monitor|uptime|pingdom|healthcheck|kube-probe|bytespider|petalbot|ahrefs|semrush/i;

let geoTimer = null;
let lastCleanupAt = 0;

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function faNum(n){ return Number(n || 0).toLocaleString('fa-IR'); }
function normalizeIp(value){
  let ip = String(value || '').trim();
  if(ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}
function isIpv4(ip){
  const parts = String(ip || '').split('.');
  return parts.length === 4 && parts.every(part => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}
function ipv4ToInt(ip){
  if(!isIpv4(ip)) return null;
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}
function inCidr4(ip, cidr){
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipn = ipv4ToInt(ip);
  const basen = ipv4ToInt(base);
  if(ipn == null || basen == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipn & mask) === (basen & mask);
}
function ipv6ToBigInt(ip){
  const value = String(ip || '').toLowerCase();
  if(!value || value.includes('.')) return null;
  const halves = value.split('::');
  if(halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(':').filter(Boolean) : []) : [];
  if(halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if(missing < 0) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if(groups.length !== 8) return null;
  let out = 0n;
  for(const group of groups){
    if(!/^[0-9a-f]{1,4}$/.test(group)) return null;
    out = (out << 16n) + BigInt(parseInt(group, 16));
  }
  return out;
}
function inCidr6(ip, cidr){
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipn = ipv6ToBigInt(ip);
  const basen = ipv6ToBigInt(base);
  if(ipn == null || basen == null || !Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  if(bits === 0) return true;
  const shift = BigInt(128 - bits);
  return (ipn >> shift) === (basen >> shift);
}
function isCloudflareAddress(ip){
  const clean = normalizeIp(ip);
  if(isIpv4(clean)) return CF_V4.some(cidr => inCidr4(clean, cidr));
  return CF_V6.some(cidr => inCidr6(clean, cidr));
}
function isPrivateIp(ip){
  const clean = normalizeIp(ip);
  if(!clean || clean === 'unknown' || clean === '::1' || clean === '0.0.0.0') return true;
  if(isIpv4(clean)){
    const [a, b] = clean.split('.').map(Number);
    if(a === 10 || a === 127 || (a === 192 && b === 168) || (a === 169 && b === 254)) return true;
    if(a === 172 && b >= 16 && b <= 31) return true;
    if(a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  return /^(fc|fd|fe80:)/i.test(clean);
}
function isPublicVisitorIp(ip){ return Boolean(ip) && !isPrivateIp(ip) && (isIpv4(ip) || ipv6ToBigInt(ip) != null); }
function header(req, name){
  const headers = req && req.headers ? req.headers : {};
  return headers[name] || headers[name.toLowerCase()] || '';
}
function connectingPeer(req){
  const socketIp = normalizeIp(req && req.socket ? req.socket.remoteAddress : '');
  if(process.env.YASNAFIT_TRUST_PROXY !== '1') return socketIp;
  const parts = String(header(req, 'x-forwarded-for')).split(',').map(normalizeIp).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : socketIp;
}
function validCfRay(value){ return /^[0-9a-f]{8,32}-[A-Za-z]{3}$/.test(String(value || '').trim()); }
function analyticsClientIp(req){
  const cfIp = normalizeIp(header(req, 'cf-connecting-ip'));
  const peer = connectingPeer(req || {});
  if(cfIp && isPublicVisitorIp(cfIp) && validCfRay(header(req, 'cf-ray')) && isCloudflareAddress(peer)) return cfIp;
  return requestSecurity.clientIp(req || { headers: {}, socket: {} });
}
function isBotUserAgent(ua){ return BOT_RE.test(String(ua || '')); }
function parseUserAgent(ua){
  const text = String(ua || '');
  let device = 'desktop';
  if(/iPad|Tablet/i.test(text)) device = 'tablet';
  else if(/Mobile|iPhone|Android/i.test(text)) device = 'mobile';
  let browser = 'سایر';
  if(/Edg\//.test(text)) browser = 'Edge';
  else if(/OPR\/|Opera/.test(text)) browser = 'Opera';
  else if(/Firefox\//.test(text)) browser = 'Firefox';
  else if(/Chrome\/|CriOS\//.test(text)) browser = 'Chrome';
  else if(/Safari\//.test(text)) browser = 'Safari';
  let os = 'سایر';
  if(/Windows NT/.test(text)) os = 'Windows';
  else if(/Android/.test(text)) os = 'Android';
  else if(/iPhone|iPad|iOS/.test(text)) os = 'iOS';
  else if(/Mac OS X/.test(text)) os = 'macOS';
  else if(/Linux/.test(text)) os = 'Linux';
  return { device, browser, os };
}
function browserGroup(browser){
  if(browser === 'Chrome' || browser === 'Safari' || browser === 'Firefox' || browser === 'Edge') return browser;
  return 'Other';
}
function cleanPath(value){
  const raw = String(value || '/').split('#')[0];
  const cut = raw.indexOf('?');
  let path = (cut >= 0 ? raw.slice(0, cut) : raw) || '/';
  if(!path.startsWith('/')) path = '/' + path;
  return path.slice(0, 300);
}
function isPublicAnalyticsPath(path){
  if(PUBLIC_EXACT.has(path)) return true;
  if(PUBLIC_JOIN.test(path)) return true;
  return /^\/magazine\/[^/?#]{1,600}$/.test(path);
}
function pageLabel(path){
  const labels = { '/':'Home', '/about':'About', '/services':'Services', '/magazine':'Magazine', '/results':'Results', '/contact':'Contact' };
  if(labels[path]) return labels[path];
  if(path.startsWith('/magazine/')) return 'Article';
  if(path.startsWith('/join/')) return 'Invite';
  return 'Other';
}
function sanitizeUtm(value){
  const text = String(value || '').trim();
  if(!text || text.length > 80 || SENSITIVE_QUERY.test(text) || !/^[A-Za-z0-9._~+-]+$/.test(text)) return null;
  return text;
}
function referrerHost(value){
  const text = String(value || '').trim();
  if(!text || SENSITIVE_QUERY.test(text)) return '';
  try{ return new URL(text).hostname.replace(/^www\./, '').toLowerCase().slice(0, 120); }
  catch(error){
    if(/^[A-Za-z0-9.-]{1,120}$/.test(text)) return text.replace(/^www\./i, '').toLowerCase();
    return '';
  }
}
function classifySource(utmSource, referrer){
  const utm = String(utmSource || '').toLowerCase();
  if(utm){
    if(utm.includes('google')) return 'Google';
    if(utm === 'ig' || utm.includes('instagram')) return 'Instagram';
    if(utm.includes('telegram') || utm === 'tg') return 'Telegram';
    if(utm === 'direct' || utm === '(direct)') return 'Direct';
    return 'Other';
  }
  const host = referrerHost(referrer);
  if(!host) return 'Direct';
  if(/(^|\.)google\./.test(host)) return 'Google';
  if(host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
  if(host === 't.me' || host.endsWith('.t.me') || host.includes('telegram')) return 'Telegram';
  return 'Referral';
}
function readCookie(req, name){
  const raw = String(req && req.headers ? req.headers.cookie || '' : '');
  for(const part of raw.split(';')){
    const eq = part.indexOf('=');
    if(eq < 0) continue;
    if(part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}
function validVisitorToken(token){ return /^[a-f0-9]{32}$/.test(String(token || '')); }
function visitorIdFromToken(token){ return 'visitor_' + crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 12); }
function visitorIdFromRequest(req){
  const token = readCookie(req, VISITOR_COOKIE);
  return validVisitorToken(token) ? visitorIdFromToken(token) : null;
}
function legacyVisitorId(ip, userAgent){
  return 'visitor_' + crypto.createHash('sha256').update('legacy:' + String(ip || '') + '|' + String(userAgent || '')).digest('hex').slice(0, 12);
}
function visitorLabel(visitorId){
  const text = String(visitorId || '');
  return text.startsWith('visitor_') ? text.slice(0, 16) + '…' : 'visitor_…';
}
function ensureVisitor(req, res){
  let token = readCookie(req, VISITOR_COOKIE);
  let fresh = false;
  if(!validVisitorToken(token)){
    token = crypto.randomBytes(16).toString('hex');
    fresh = true;
  }
  if(fresh && res && typeof res.setHeader === 'function'){
    const secure = requestSecurity.isHttps(req) ? '; Secure' : '';
    const cookie = `${VISITOR_COOKIE}=${token}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax${secure}`;
    const existing = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : null;
    const cookies = [].concat(existing || [], cookie).filter(Boolean);
    res.setHeader('Set-Cookie', cookies.length === 1 ? cookies[0] : cookies);
  }
  return { token, id: visitorIdFromToken(token), fresh };
}
function queryOf(req){
  try{ return new URL(req && req.url ? req.url : '/', 'http://localhost').searchParams; }
  catch(error){ return new URLSearchParams(); }
}
function attributionFrom(req, explicit){
  const params = explicit && explicit.searchParams ? explicit.searchParams : queryOf(req);
  const utmSource = sanitizeUtm(explicit && explicit.utmSource != null ? explicit.utmSource : params.get('utm_source'));
  const utmMedium = sanitizeUtm(explicit && explicit.utmMedium != null ? explicit.utmMedium : params.get('utm_medium'));
  const utmCampaign = sanitizeUtm(explicit && explicit.utmCampaign != null ? explicit.utmCampaign : params.get('utm_campaign'));
  const referrer = explicit && explicit.referrer != null ? explicit.referrer : (req && req.headers ? (req.headers.referer || req.headers.referrer || '') : '');
  return {
    utmSource, utmMedium, utmCampaign,
    referrerHost: referrerHost(referrer),
    trafficSource: classifySource(utmSource, referrer),
  };
}
function snapshotRequest(req, pathname, visitor){
  const attr = attributionFrom(req);
  return {
    at: new Date().toISOString(),
    path: cleanPath(pathname),
    visitorId: visitor && visitor.id,
    ip: analyticsClientIp(req),
    userAgent: String(req && req.headers ? req.headers['user-agent'] || '' : '').slice(0, 300),
    ...attr,
  };
}
function normalizeStamp(value){
  const text = String(value || '').trim();
  if(!text) return '';
  if(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return text;
  return text.replace(' ', 'T') + 'Z';
}
function stampMs(value){
  const ms = Date.parse(normalizeStamp(value));
  return Number.isFinite(ms) ? ms : NaN;
}
function tehranDateKey(input){
  const date = input instanceof Date ? input : new Date(input);
  return new Date(date.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}
function addDateKey(dateKey, days){
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function tehranMidnightUtc(dateKey){
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - TEHRAN_OFFSET_MS).toISOString();
}
function rangeFromQuery(searchParams){
  const range = String(searchParams.get('range') || '').toLowerCase();
  const days = Number(searchParams.get('days'));
  if(!range && Number.isFinite(days) && days > 0) return { days: Math.min(365, Math.max(1, days)) };
  return { range: range || '7d', from: searchParams.get('from') || '', to: searchParams.get('to') || '' };
}
function resolveWindow(input, nowDate){
  const now = nowDate instanceof Date ? nowDate : new Date(input && input.now ? input.now : Date.now());
  const today = tehranDateKey(now);
  let key = '7d';
  let startKey = addDateKey(today, -6);
  let endKey = addDateKey(today, 1);
  if(typeof input === 'number'){
    const days = Math.min(365, Math.max(1, input));
    key = String(days) + 'd';
    startKey = addDateKey(today, -(days - 1));
  }else if(input && typeof input === 'object'){
    const asked = String(input.range || input.key || '').toLowerCase();
    if(input.days && !asked){
      const days = Math.min(365, Math.max(1, Number(input.days)));
      key = String(days) + 'd';
      startKey = addDateKey(today, -(days - 1));
    }else if(asked === 'today'){
      key = 'today'; startKey = today;
    }else if(asked === 'yesterday'){
      key = 'yesterday'; startKey = addDateKey(today, -1); endKey = today;
    }else if(asked === '30d' || asked === '30'){
      key = '30d'; startKey = addDateKey(today, -29);
    }else if(asked === '90d' || asked === '90'){
      key = '90d'; startKey = addDateKey(today, -89);
    }else if(asked === '7d' || asked === '7'){
      key = '7d'; startKey = addDateKey(today, -6);
    }else if(asked === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(input.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(input.to || '') && input.from <= input.to){
      const span = Math.round((Date.parse(input.to + 'T00:00:00Z') - Date.parse(input.from + 'T00:00:00Z')) / 86400000);
      if(span <= 366){ key = 'custom'; startKey = input.from; endKey = addDateKey(input.to, 1); }
      else { key = '30d'; startKey = addDateKey(today, -29); }
    }else{
      key = '7d'; startKey = addDateKey(today, -6);
    }
  }
  return { key, start: tehranMidnightUtc(startKey), end: tehranMidnightUtc(endKey), startKey, endKey: addDateKey(endKey, -1), today, now: now.toISOString() };
}
function humanizeDuration(ms){
  if(!Number.isFinite(ms) || ms <= 0) return 'نامشخص';
  const minutes = Math.round(ms / 60000);
  if(minutes < 1) return 'کمتر از یک دقیقه';
  if(minutes < 60) return faNum(minutes) + ' دقیقه';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? faNum(hours) + ' ساعت و ' + faNum(rest) + ' دقیقه' : faNum(hours) + ' ساعت';
}
function faDateTime(iso){
  const date = new Date(normalizeStamp(iso));
  if(Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' });
}
function flagOf(code){
  const cc = String(code || '').toUpperCase();
  if(cc === 'LN') return '🏠';
  if(!/^[A-Z]{2}$/.test(cc)) return '🌐';
  return String.fromCodePoint(...[...cc].map(ch => 127397 + ch.charCodeAt(0)));
}
function deviceFa(device){
  return { mobile:'📱 موبایل', tablet:'💻 تبلت', desktop:'🖥 دسکتاپ', unknown:'نامشخص' }[device] || device || 'نامشخص';
}
function assignSession(db, { visitorId, at, path, device, countryCode }){
  const atMs = stampMs(at);
  const open = db.prepare('SELECT id, session_key, last_seen_at FROM analytics_sessions WHERE visitor_id=? ORDER BY last_seen_at DESC, id DESC LIMIT 1').get(visitorId);
  if(open && Number.isFinite(atMs)){
    const last = stampMs(open.last_seen_at);
    if(Number.isFinite(last) && atMs >= last && atMs - last <= SESSION_IDLE_MS){
      db.prepare('UPDATE analytics_sessions SET last_seen_at=?, pageviews=pageviews+1, exit_path=? WHERE id=?').run(at, path, open.id);
      return open.session_key;
    }
  }
  const key = uuid();
  db.prepare('INSERT INTO analytics_sessions(stable_id, session_key, visitor_id, started_at, last_seen_at, pageviews, landing_path, exit_path, device, country_code) VALUES(?,?,?,?,?,1,?,?,?,?)')
    .run(uuid(), key, visitorId, at, at, path, path, device || '', countryCode || null);
  return key;
}
function insertVisit(db, row){
  db.prepare(`INSERT INTO site_visits(
      stable_id, visited_at, ip, country_code, country_name, city, device, browser, os, path, user_agent,
      visitor_id, session_id, event_type, referrer, utm_source, utm_medium, utm_campaign, traffic_source, is_public
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    uuid(), row.at, row.ip || null, row.countryCode || null, row.countryName || null, row.city || null,
    row.device, row.browser, row.os, row.path, row.userAgent || '',
    row.visitorId, row.sessionId, 'page_view', row.referrerHost || null,
    row.utmSource || null, row.utmMedium || null, row.utmCampaign || null, row.trafficSource || null
  );
}
function recordVisit(db, input = {}){
  try{
  const path = cleanPath(input.path);
  if(!isPublicAnalyticsPath(path)) return false;
  if(isBotUserAgent(input.userAgent)) return false;
  const at = input.at || new Date().toISOString();
  const visitorId = input.visitorId || legacyVisitorId(input.ip, input.userAgent);
  const parsed = parseUserAgent(input.userAgent);
  const attr = attributionFrom(null, input);
  const sessionId = assignSession(db, { visitorId, at, path, device: parsed.device, countryCode: input.countryCode || null });
  insertVisit(db, {
    at, ip: input.ip || null, path, userAgent: String(input.userAgent || '').slice(0, 300),
    visitorId, sessionId, device: parsed.device, browser: parsed.browser, os: parsed.os,
    referrerHost: attr.referrerHost,
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    trafficSource: input.trafficSource || attr.trafficSource,
    countryCode: input.countryCode || null,
    countryName: input.countryName || null,
    city: input.city || null,
  });
  return true;
  }catch(error){ return false; }
}
function commitSnapshot(db, snap){
  try{
    if(!snap || !recordVisit(db, snap)) return false;
    if(snap.path === '/') recordEvent(db, { ...snap, eventType: 'landing_view' });
    return true;
  }catch(error){ return false; }
}
function sessionForEvent(db, visitorId, at){
  if(!visitorId) return null;
  const atMs = stampMs(at);
  if(!Number.isFinite(atMs)) return null;
  try{
    const open = db.prepare('SELECT session_key, last_seen_at FROM analytics_sessions WHERE visitor_id=? ORDER BY last_seen_at DESC, id DESC LIMIT 1').get(visitorId);
    if(!open) return null;
    const last = stampMs(open.last_seen_at);
    return Number.isFinite(last) && Math.abs(atMs - last) <= SESSION_IDLE_MS ? open.session_key : null;
  }catch(error){ return null; }
}
function recordEvent(db, input = {}){
  try{
  const eventType = String(input.eventType || '');
  if(!EVENT_TYPES.has(eventType) || eventType === 'page_view') return false;
  if(isBotUserAgent(input.userAgent)) return false;
  const at = input.at || new Date().toISOString();
  const path = cleanPath(input.path || '/');
  const attr = attributionFrom(input.req, input);
  db.prepare('INSERT INTO analytics_events(stable_id, occurred_at, visitor_id, session_id, event_type, path, traffic_source, utm_source, utm_medium, utm_campaign) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), at, input.visitorId || null, (input.sessionId || sessionForEvent(db, input.visitorId, at)) || null, eventType, path, input.trafficSource || attr.trafficSource, attr.utmSource, attr.utmMedium, attr.utmCampaign);
  return true;
  }catch(error){ return false; }
}
function recordRegistration(db, input = {}){
  try{
    const at = input.at || new Date().toISOString();
    const visitorId = input.visitorId || null;
    db.prepare('INSERT INTO registration_events(stable_id, occurred_at, ip, kind, label, student_id, visitor_id) VALUES(?,?,?,?,?,?,?)')
      .run(uuid(), at, input.ip || null, input.kind || 'student', String(input.label || '').slice(0, 120), input.studentId || null, visitorId);
    recordEvent(db, { eventType: 'registration_complete', visitorId, path: '/student/register', at, userAgent: input.userAgent });
    return true;
  }catch(error){ return false; }
}
function publicVisits(db, start, end){
  return db.prepare(`SELECT id, visited_at, ip, country_code, country_name, city, device, browser, os, path,
      visitor_id, session_id, traffic_source, referrer, utm_source, utm_medium, utm_campaign
    FROM site_visits
    WHERE COALESCE(is_public, CASE WHEN path IN ('/','/about','/services','/results','/magazine','/contact') OR path LIKE '/magazine/%' OR (path LIKE '/join/%' AND path NOT LIKE '/join/%/%') THEN 1 ELSE 0 END)=1
      AND visited_at>=? AND visited_at<?
    ORDER BY visited_at ASC, id ASC`).all(start, end);
}
function countEvents(db, type, start, end){
  return db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT visitor_id) AS visitors, COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE event_type=? AND occurred_at>=? AND occurred_at<?').get(type, start, end);
}
function sessionRows(db, start, end){
  return db.prepare('SELECT session_key, visitor_id, started_at, last_seen_at, pageviews, landing_path, exit_path, device, country_code FROM analytics_sessions WHERE last_seen_at>=? AND started_at<?').all(start, end);
}
function average(values){
  const usable = values.filter(value => Number.isFinite(value) && value > 0);
  if(!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}
function stripPrivate(value){
  if(Array.isArray(value)) return value.map(stripPrivate);
  if(!value || typeof value !== 'object') return value;
  const out = {};
  for(const [key, item] of Object.entries(value)){
    if(/^(ip|user_agent|useragent|token|password|passwd|secret|authorization|cookie)$/i.test(key)) continue;
    out[key] = stripPrivate(item);
  }
  return out;
}
function visitSummary(db, input = 30){
  const now = input && input.now ? new Date(input.now) : new Date();
  const window = resolveWindow(input, now);
  const todayStart = tehranMidnightUtc(window.today);
  const todayEnd = tehranMidnightUtc(addDateKey(window.today, 1));
  const day7 = resolveWindow({ range: '7d', now }, now);
  const day30 = resolveWindow({ range: '30d', now }, now);
  const allStart = '1970-01-01T00:00:00.000Z';
  const allEnd = '9999-12-31T00:00:00.000Z';
  const inRange = publicVisits(db, window.start, window.end);
  const todayRows = publicVisits(db, todayStart, todayEnd);
  const day7Rows = publicVisits(db, day7.start, day7.end);
  const day30Rows = publicVisits(db, day30.start, day30.end);
  const allRows = publicVisits(db, allStart, allEnd);
  const sessions = sessionRows(db, window.start, window.end);
  const unique = rows => new Set(rows.map(row => row.visitor_id).filter(Boolean)).size;
  const registrations = db.prepare('SELECT occurred_at, visitor_id, ip, kind, label FROM registration_events WHERE occurred_at>=? AND occurred_at<?').all(window.start, window.end);
  const todayRegistrations = db.prepare('SELECT COUNT(*) AS n FROM registration_events WHERE occurred_at>=? AND occurred_at<?').get(todayStart, todayEnd).n;
  const dailyMap = new Map();
  for(let key = window.startKey; key <= window.endKey; key = addDateKey(key, 1)){
    dailyMap.set(key, { day: key, views: 0, visitors: new Set(), sessions: new Set(), registrations: 0 });
  }
  for(const row of inRange){
    const bucket = dailyMap.get(tehranDateKey(row.visited_at));
    if(!bucket) continue;
    bucket.views += 1;
    if(row.visitor_id) bucket.visitors.add(row.visitor_id);
    if(row.session_id) bucket.sessions.add(row.session_id);
  }
  for(const row of registrations){
    const bucket = dailyMap.get(tehranDateKey(row.occurred_at));
    if(bucket) bucket.registrations += 1;
  }
  const daily = [...dailyMap.values()].map(bucket => ({ day: bucket.day, views: bucket.views, visitors: bucket.visitors.size, sessions: bucket.sessions.size, registrations: bucket.registrations, ips: bucket.visitors.size }));
  const byPath = new Map();
  const bySession = new Map();
  for(const row of inRange){
    if(!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id).push(row);
    if(!byPath.has(row.path)) byPath.set(row.path, { path: row.path, label: pageLabel(row.path), views: 0, visitors: new Set(), durations: [] });
    const page = byPath.get(row.path);
    page.views += 1;
    if(row.visitor_id) page.visitors.add(row.visitor_id);
  }
  for(const hits of bySession.values()){
    hits.sort((a, b) => stampMs(a.visited_at) - stampMs(b.visited_at));
    for(let i = 0; i < hits.length - 1; i++){
      const delta = stampMs(hits[i + 1].visited_at) - stampMs(hits[i].visited_at);
      if(delta > 0 && delta <= SESSION_IDLE_MS) byPath.get(hits[i].path).durations.push(delta);
    }
  }
  const pages = [...byPath.values()].map(page => ({
    path: page.path, label: page.label, views: page.views, visitors: page.visitors.size,
    avg_time_ms: average(page.durations), avg_time_fa: humanizeDuration(average(page.durations)),
  })).sort((a, b) => b.views - a.views);
  const durations = sessions.map(session => {
    const delta = stampMs(session.last_seen_at) - stampMs(session.started_at);
    return Number.isFinite(delta) && delta > 0 ? delta : null;
  });
  const avgSession = average(durations);
  const pageviews = inRange.length;
  const sessionCount = new Set(inRange.map(row => row.session_id).filter(Boolean)).size;
  const visitorCount = unique(inRange);
  const firstEver = new Map();
  for(const row of allRows) if(row.visitor_id && !firstEver.has(row.visitor_id)) firstEver.set(row.visitor_id, row.visited_at);
  const sessionCountEver = new Map();
  for(const session of db.prepare('SELECT visitor_id FROM analytics_sessions').all()){
    sessionCountEver.set(session.visitor_id, (sessionCountEver.get(session.visitor_id) || 0) + 1);
  }
  let returning = 0;
  let fresh = 0;
  for(const visitorId of new Set(inRange.map(row => row.visitor_id).filter(Boolean))){
    const first = firstEver.get(visitorId);
    const prior = first && stampMs(first) < stampMs(window.start);
    const multi = (sessionCountEver.get(visitorId) || 0) > 1;
    if(prior || multi) returning += 1;
    else fresh += 1;
  }
  const regByVisitor = new Map();
  const regByIp = new Map();
  for(const row of db.prepare('SELECT visitor_id, ip FROM registration_events').all()){
    if(row.visitor_id) regByVisitor.set(row.visitor_id, (regByVisitor.get(row.visitor_id) || 0) + 1);
    if(row.ip) regByIp.set(row.ip, (regByIp.get(row.ip) || 0) + 1);
  }
  const visitorMap = new Map();
  for(const row of inRange){
    if(!visitorMap.has(row.visitor_id)) visitorMap.set(row.visitor_id, { ...row, views: 0, first_at: row.visited_at, last_at: row.visited_at, sessions: new Set() });
    const item = visitorMap.get(row.visitor_id);
    item.views += 1;
    if(row.visited_at < item.first_at) item.first_at = row.visited_at;
    if(row.visited_at >= item.last_at){
      item.last_at = row.visited_at;
      item.path = row.path;
      item.device = row.device;
      item.browser = row.browser;
      item.os = row.os;
      item.country_code = row.country_code || item.country_code;
      item.country_name = row.country_name || item.country_name;
      item.city = row.city || item.city;
      item.traffic_source = row.traffic_source || item.traffic_source;
      item.ip = row.ip;
    }
    if(row.session_id) item.sessions.add(row.session_id);
  }
  const nowMs = now.getTime();
  const visitors = [...visitorMap.values()].sort((a, b) => String(b.last_at).localeCompare(String(a.last_at))).slice(0, 50).map(item => {
    const sessionDurations = sessions.filter(session => session.visitor_id === item.visitor_id).map(session => stampMs(session.last_seen_at) - stampMs(session.started_at)).filter(value => value > 0);
    const duration = average(sessionDurations);
    const registrationsForVisitor = (regByVisitor.get(item.visitor_id) || 0) + (!regByVisitor.get(item.visitor_id) ? (regByIp.get(item.ip) || 0) : 0);
    return {
      visitor_id: item.visitor_id,
      visitor_label: visitorLabel(item.visitor_id),
      country_code: item.country_code || null,
      country_name: item.country_name || null,
      city: item.city || null,
      device: item.device,
      browser: item.browser,
      os: item.os,
      views: item.views,
      sessions: item.sessions.size,
      path: item.path,
      traffic_source: item.traffic_source || 'Direct',
      first_at: item.first_at,
      last_at: item.last_at,
      first_fa: faDateTime(item.first_at),
      last_fa: faDateTime(item.last_at),
      duration_ms: duration,
      duration_fa: humanizeDuration(duration),
      registrations: registrationsForVisitor,
      online: nowMs - stampMs(item.last_at) <= ONLINE_MS,
      returning: stampMs(firstEver.get(item.visitor_id)) < stampMs(window.start) || (sessionCountEver.get(item.visitor_id) || 0) > 1,
    };
  });
  const tally = (rows, key) => {
    const map = new Map();
    for(const row of rows){
      const name = row[key] || 'سایر';
      if(!map.has(name)) map.set(name, { [key]: name, views: 0, visitors: new Set() });
      map.get(name).views += 1;
      if(row.visitor_id) map.get(name).visitors.add(row.visitor_id);
    }
    return [...map.values()].map(item => ({ ...item, visitors: item.visitors.size, ips: item.visitors.size })).sort((a, b) => b.views - a.views);
  };
  const sources = tally(inRange, 'traffic_source');
  const browserGroups = tally(inRange.map(row => ({ ...row, browser_group: browserGroup(row.browser) })), 'browser_group');
  const events = ['landing_view', 'coach_page_view', 'register_start', 'registration_complete', 'login', 'telegram_connect'].map(type => {
    const row = countEvents(db, type, window.start, window.end);
    return { event_type: type, count: row.n, visitors: row.visitors, sessions: row.sessions };
  });
  const eventSessions = type => (events.find(item => item.event_type === type) || {}).sessions || 0;
  const registerStart = events.find(item => item.event_type === 'register_start').count;
  const registerComplete = events.find(item => item.event_type === 'registration_complete').count;
  const rate = (num, den) => den > 0 ? Math.round(num / den * 1000) / 10 : 0;
  const onlineCutoff = new Date(nowMs - ONLINE_MS).toISOString();
  const onlineHits = db.prepare(`SELECT visitor_id, path, country_name, city, device, visited_at
    FROM site_visits
    WHERE COALESCE(is_public, CASE WHEN path IN ('/','/about','/services','/results','/magazine','/contact') OR path LIKE '/magazine/%' OR (path LIKE '/join/%' AND path NOT LIKE '/join/%/%') THEN 1 ELSE 0 END)=1
      AND visited_at>=?
    ORDER BY visited_at DESC, id DESC`).all(onlineCutoff);
  const onlineSeen = new Set();
  const online = [];
  for(const row of onlineHits){
    if(!row.visitor_id || onlineSeen.has(row.visitor_id)) continue;
    onlineSeen.add(row.visitor_id);
    online.push({
      visitor_label: visitorLabel(row.visitor_id),
      path: row.path,
      country_name: row.country_name || null,
      city: row.city || null,
      device: row.device,
      last_fa: faDateTime(row.visited_at),
    });
  }
  const faPage = path => ({ '/':'خانه', '/about':'درباره من', '/services':'خدمات', '/results':'نتایج', '/magazine':'مجله', '/contact':'تماس' }[path] || (String(path || '').startsWith('/magazine/') ? 'مقاله' : (String(path || '').startsWith('/join/') ? 'دعوت' : 'صفحه')));
  const registeredVisitors = new Set(registrations.map(row => row.visitor_id).filter(Boolean));
  const journeys = [];
  for(const hits of bySession.values()){
    const labels = [];
    for(const hit of hits){
      const label = faPage(hit.path);
      if(labels[labels.length - 1] !== label) labels.push(label);
    }
    if(hits[0] && registeredVisitors.has(hits[0].visitor_id) && labels[labels.length - 1] !== 'ثبت‌نام') labels.push('ثبت‌نام');
    if(labels.length > 1) journeys.push({ path: labels.join(' → '), steps: labels });
  }
  const campaignMap = new Map();
  for(const row of inRange){
    if(!row.utm_source && !row.utm_medium && !row.utm_campaign) continue;
    const key = `${row.utm_source || ''}|${row.utm_medium || ''}|${row.utm_campaign || ''}`;
    if(!campaignMap.has(key)) campaignMap.set(key, { utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, views: 0, visitors: new Set() });
    const item = campaignMap.get(key);
    item.views += 1;
    if(row.visitor_id) item.visitors.add(row.visitor_id);
  }
  const campaigns = [...campaignMap.values()].map(item => ({
    utm_source: item.utm_source, utm_medium: item.utm_medium, utm_campaign: item.utm_campaign,
    views: item.views, visitors: item.visitors.size,
  })).sort((a, b) => b.views - a.views);
  const summary = {
    today_views: todayRows.length,
    today_ips: unique(todayRows),
    today_visitors: unique(todayRows),
    today_sessions: new Set(todayRows.map(row => row.session_id).filter(Boolean)).size,
    today_registrations: todayRegistrations,
    day7_views: day7Rows.length,
    day7_ips: unique(day7Rows),
    day30_views: day30Rows.length,
    day30_ips: unique(day30Rows),
    total_views: allRows.length,
    total_ips: unique(allRows),
    visitors: visitorCount,
    pageviews: pageviews,
    sessions: sessionCount,
    registrations: registrations.length,
    pages_per_session: sessionCount ? Math.round(pageviews / sessionCount * 10) / 10 : 0,
    average_session_ms: avgSession,
    average_session_fa: humanizeDuration(avgSession),
    returning_visitors: returning,
    new_visitors: fresh,
  };
  return stripPrivate({
    summary,
    today: { visitors: summary.today_visitors, pageviews: summary.today_views, sessions: summary.today_sessions, registrations: summary.today_registrations },
    range: { preset: window.key, start: window.start, end: window.end, timezone: 'Asia/Tehran', ...summary, visitors: visitorCount, first_fa: inRange[0] ? faDateTime(inRange[0].visited_at) : '—', last_fa: inRange.length ? faDateTime(inRange[inRange.length - 1].visited_at) : '—' },
    daily,
    pages,
    countries: tally(inRange, 'country_code').map(item => ({ code: item.country_code, name: (inRange.find(row => row.country_code === item.country_code) || {}).country_name || item.country_code || 'نامشخص', views: item.views, visitors: item.visitors, ips: item.visitors })),
    devices: tally(inRange, 'device'),
    browsers: tally(inRange, 'browser'),
    browser_groups: browserGroups,
    os: tally(inRange.map(row => ({ ...row, os: ['Android','iOS','Windows','macOS','Linux'].includes(row.os) ? row.os : 'Other' })), 'os'),
    sources,
    campaigns,
    cities: tally(inRange.filter(row => row.city), 'city'),
    journey: [
      { step: 'Home', sessions: new Set(inRange.filter(row => row.path === '/').map(row => row.session_id)).size },
      { step: 'About', sessions: new Set(inRange.filter(row => row.path === '/about').map(row => row.session_id)).size },
      { step: 'Coach', sessions: eventSessions('coach_page_view') },
      { step: 'Register', sessions: eventSessions('register_start') },
    ],
    journeys,
    funnel: {
      visitors: visitorCount,
      register_start: registerStart,
      registration_complete: registerComplete,
      register_rate: rate(registerStart, visitorCount),
      complete_rate: rate(registerComplete, registerStart),
      visitor_to_complete_rate: rate(registerComplete, visitorCount),
      conversion_rate: rate(registerComplete, visitorCount),
    },
    events,
    online_now: online,
    recent: [...inRange].reverse().slice(0, 40).map(row => ({
      visited_at: row.visited_at, visitor_label: visitorLabel(row.visitor_id), path: row.path,
      country_code: row.country_code, country_name: row.country_name, city: row.city,
      device: row.device, browser: row.browser, os: row.os, traffic_source: row.traffic_source,
      utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign,
    })),
    visitors,
    pending_geo: unresolvedIps(db).length,
  });
}
function visitorOverview(db, limit = 50){
  const data = visitSummary(db, 180);
  return data.visitors.slice(0, limit);
}
function unresolvedIps(db){
  return db.prepare(`SELECT DISTINCT ip FROM site_visits WHERE ip IS NOT NULL AND country_code IS NULL AND geo_attempts < ? LIMIT 20`).all(GEO_MAX_ATTEMPTS).map(row => row.ip);
}
function applyGeo(db, ip, countryCode, countryName, city){
  db.prepare('INSERT INTO ip_geo_cache(ip, country_code, country_name, city, resolved_at, attempts) VALUES(?,?,?,?,?,1) ON CONFLICT(ip) DO UPDATE SET country_code=excluded.country_code, country_name=excluded.country_name, city=excluded.city, resolved_at=excluded.resolved_at, attempts=ip_geo_cache.attempts+1')
    .run(ip, countryCode, countryName, city || null, new Date().toISOString());
  db.prepare('UPDATE site_visits SET country_code=?, country_name=?, city=COALESCE(?, city) WHERE ip=? AND country_code IS NULL').run(countryCode, countryName, city || null, ip);
}
function resolveIps(db, ips, fetcher){
  const local = [];
  const remote = [];
  for(const ip of ips || []){
    if(isPrivateIp(ip)){
      applyGeo(db, ip, 'LN', 'شبکه محلی', null);
      local.push(ip);
    }else remote.push(ip);
  }
  // fetcher فقط برای تستِ «IP خصوصی تماس شبکه نزند» پذیرفته می‌شود و صدا زده نمی‌شود.
  // حل IP عمومی در resolvePending و فقط روی HTTPS انجام می‌شود.
  void fetcher;
  return { local, remote, pending: remote };
}
async function defaultGeoFetch(ips){
  const out = [];
  for(const ip of ips.slice(0, 15)){
    const response = await fetch(GEO_HTTPS + encodeURIComponent(ip), { headers: { accept: 'application/json' } });
    const row = await response.json();
    if(row && row.success !== false && (row.country_code || row.countryCode)){
      out.push({ query: ip, country: row.country || row.country_name, countryCode: row.country_code || row.countryCode, city: row.city || '' });
    }
  }
  return out;
}
async function resolvePending(db){
  const ips = unresolvedIps(db);
  if(!ips.length) return;
  const localFirst = resolveIps(db, ips);
  const remote = localFirst.remote || [];
  if(!remote.length) return;
  try{
    const rows = await defaultGeoFetch(remote);
    const seen = new Set();
    for(const row of rows){
      if(!row.query) continue;
      seen.add(row.query);
      applyGeo(db, row.query, row.countryCode || null, row.country || null, row.city || null);
    }
    for(const ip of remote) if(!seen.has(ip)) db.prepare('UPDATE site_visits SET geo_attempts=geo_attempts+1 WHERE ip=? AND country_code IS NULL').run(ip);
  }catch(error){
    for(const ip of remote) db.prepare('UPDATE site_visits SET geo_attempts=geo_attempts+1 WHERE ip=? AND country_code IS NULL').run(ip);
  }
}
function backfillGeo(db){
  const cached = db.prepare('SELECT ip, country_code, country_name, city FROM ip_geo_cache WHERE country_code IS NOT NULL').all();
  const update = db.prepare('UPDATE site_visits SET country_code=?, country_name=?, city=COALESCE(?, city) WHERE ip=? AND country_code IS NULL');
  for(const row of cached) update.run(row.country_code, row.country_name, row.city || null, row.ip);
  resolveIps(db, unresolvedIps(db));
}
function cleanup(db){
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  db.prepare('DELETE FROM site_visits WHERE visited_at < ?').run(cutoff);
  try{ db.prepare('DELETE FROM analytics_events WHERE occurred_at < ?').run(cutoff); }catch(error){}
  try{ db.prepare('DELETE FROM analytics_sessions WHERE last_seen_at < ?').run(cutoff); }catch(error){}
  lastCleanupAt = Date.now();
  return true;
}
function maybeCleanup(db){
  if(Date.now() - lastCleanupAt < CLEANUP_EVERY_MS) return false;
  return cleanup(db);
}
function startGeoResolver(db){
  if(geoTimer) return geoTimer;
  const tick = () => {
    try{ maybeCleanup(db); }catch(error){}
    resolvePending(db).catch(() => {});
  };
  geoTimer = setInterval(tick, 45 * 1000);
  if(typeof geoTimer.unref === 'function') geoTimer.unref();
  const kick = setTimeout(tick, 2500);
  if(typeof kick.unref === 'function') kick.unref();
  return geoTimer;
}
function exportAnalytics(db, input){
  return stripPrivate({ exported_at: new Date().toISOString(), timezone: 'Asia/Tehran', ...visitSummary(db, input) });
}

// ── داشبورد «آمار و تحلیل سایت» — فقط خواندنی، بدون IP/User-Agent خام ──
const DASH_KEY_PAGES = new Set(['/about', '/services', '/contact']);
function pageFa(path){
  const labels = { '/': 'صفحه اصلی', '/about': 'درباره من', '/services': 'خدمات', '/magazine': 'مجله', '/results': 'نتایج', '/contact': 'تماس' };
  if(labels[path]) return labels[path];
  if(String(path || '').startsWith('/magazine/')) return 'مقاله';
  if(String(path || '').startsWith('/join/')) return 'دعوت';
  return 'صفحه';
}
function dashNow(input){ return input && input.now ? new Date(input.now) : new Date(); }
function dashRegistrations(db, win){
  return db.prepare('SELECT id, occurred_at, visitor_id, kind FROM registration_events WHERE occurred_at>=? AND occurred_at<?').all(win.start, win.end);
}
function dashEventRows(db, type, win){
  return db.prepare('SELECT visitor_id, session_id, occurred_at FROM analytics_events WHERE event_type=? AND occurred_at>=? AND occurred_at<?').all(type, win.start, win.end);
}
function dashDistinct(rows, key){ return new Set(rows.map(row => row[key]).filter(Boolean)).size; }
function dashPercent(value, total){ return total > 0 ? Math.round(value / total * 1000) / 10 : 0; }
function dashOnlineRows(db, now){
  const cutoff = new Date(now.getTime() - ONLINE_MS).toISOString();
  const hits = publicVisits(db, cutoff, '9999-12-31T00:00:00.000Z');
  const seen = new Set();
  const out = [];
  for(let i = hits.length - 1; i >= 0; i--){
    const row = hits[i];
    if(!row.visitor_id || seen.has(row.visitor_id)) continue;
    seen.add(row.visitor_id);
    out.push({
      visitor_id: row.visitor_id,
      visitor_label: visitorLabel(row.visitor_id),
      path: row.path,
      country_code: row.country_code || null,
      country_name: row.country_name || null,
      city: row.city || null,
      device: row.device,
      browser: row.browser,
      last_at: row.visited_at,
      last_fa: faDateTime(row.visited_at),
    });
    if(out.length >= 30) break;
  }
  return out;
}
function dashReturningMaps(db){
  const firstEver = new Map();
  for(const row of db.prepare('SELECT visitor_id, MIN(visited_at) AS first_at FROM site_visits WHERE visitor_id IS NOT NULL GROUP BY visitor_id').all()){
    firstEver.set(row.visitor_id, row.first_at);
  }
  const sessionsEver = new Map();
  for(const row of db.prepare('SELECT visitor_id, COUNT(*) AS n FROM analytics_sessions GROUP BY visitor_id').all()){
    sessionsEver.set(row.visitor_id, row.n);
  }
  return { firstEver, sessionsEver };
}
function dashVisitorStats(db, win, rows, sessions){
  const { firstEver, sessionsEver } = dashReturningMaps(db);
  const map = new Map();
  for(const row of rows){
    if(!row.visitor_id) continue;
    if(!map.has(row.visitor_id)) map.set(row.visitor_id, { ...row, views: 0, first_at: row.visited_at, last_at: row.visited_at, sessions: new Set() });
    const item = map.get(row.visitor_id);
    item.views += 1;
    if(row.visited_at < item.first_at) item.first_at = row.visited_at;
    if(row.visited_at >= item.last_at){
      item.last_at = row.visited_at;
      item.path = row.path;
      item.device = row.device;
      item.browser = row.browser;
      item.os = row.os;
      item.country_code = row.country_code || item.country_code;
      item.country_name = row.country_name || item.country_name;
      item.city = row.city || item.city;
      item.traffic_source = row.traffic_source || item.traffic_source;
    }
    if(row.session_id) item.sessions.add(row.session_id);
  }
  const regByVisitor = new Map();
  for(const row of db.prepare('SELECT visitor_id, kind, occurred_at FROM registration_events').all()){
    if(!row.visitor_id) continue;
    if(!regByVisitor.has(row.visitor_id)) regByVisitor.set(row.visitor_id, []);
    regByVisitor.get(row.visitor_id).push(row);
  }
  return [...map.values()].map(item => {
    const sessionDurations = sessions.filter(session => session.visitor_id === item.visitor_id)
      .map(session => stampMs(session.last_seen_at) - stampMs(session.started_at)).filter(value => value > 0);
    const duration = average(sessionDurations);
    const regs = regByVisitor.get(item.visitor_id) || [];
    const first = firstEver.get(item.visitor_id);
    return {
      visitor_id: item.visitor_id,
      visitor_label: visitorLabel(item.visitor_id),
      country_code: item.country_code || null,
      country_name: item.country_name || null,
      city: item.city || null,
      device: item.device,
      browser: item.browser,
      os: item.os,
      views: item.views,
      sessions: item.sessions.size,
      path: item.path,
      traffic_source: item.traffic_source || 'Direct',
      first_at: item.first_at,
      last_at: item.last_at,
      first_fa: faDateTime(item.first_at),
      last_fa: faDateTime(item.last_at),
      duration_ms: duration,
      duration_fa: humanizeDuration(duration),
      registrations: regs.length,
      registered: regs.length > 0,
      online: stampMs(win.now) - stampMs(item.last_at) <= ONLINE_MS,
      returning: Boolean(first && stampMs(first) < stampMs(win.start)) || (sessionsEver.get(item.visitor_id) || 0) > 1,
    };
  }).sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
}
function nowWithin(lastAt){ return Date.now() - stampMs(lastAt) <= ONLINE_MS; }
function dashSummary(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const sessions = sessionRows(db, win.start, win.end);
  const registrations = dashRegistrations(db, win);
  const visitorCount = dashDistinct(rows, 'visitor_id');
  const sessionCount = dashDistinct(rows, 'session_id');
  const durations = sessions.map(session => stampMs(session.last_seen_at) - stampMs(session.started_at)).filter(value => Number.isFinite(value) && value > 0);
  const avgSession = average(durations);
  const { firstEver, sessionsEver } = dashReturningMaps(db);
  let returning = 0;
  let fresh = 0;
  for(const visitorId of new Set(rows.map(row => row.visitor_id).filter(Boolean))){
    const prior = firstEver.get(visitorId) && stampMs(firstEver.get(visitorId)) < stampMs(win.start);
    if(prior || (sessionsEver.get(visitorId) || 0) > 1) returning += 1;
    else fresh += 1;
  }
  const todayStart = tehranMidnightUtc(win.today);
  const todayEnd = tehranMidnightUtc(addDateKey(win.today, 1));
  const todayRows = publicVisits(db, todayStart, todayEnd);
  const todayRegs = db.prepare('SELECT COUNT(*) AS n FROM registration_events WHERE occurred_at>=? AND occurred_at<?').get(todayStart, todayEnd).n;
  const online = dashOnlineRows(db, now);
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, start_key: win.startKey, end_key: win.endKey, today: win.today, timezone: 'Asia/Tehran' },
    cards: {
      pageviews: rows.length,
      visitors: visitorCount,
      sessions: sessionCount,
      average_session_ms: avgSession,
      average_session_fa: humanizeDuration(avgSession),
      online: online.length,
      registrations: registrations.length,
      returning_visitors: returning,
      new_visitors: fresh,
      pages_per_session: sessionCount ? Math.round(rows.length / sessionCount * 10) / 10 : 0,
    },
    today: {
      pageviews: todayRows.length,
      visitors: dashDistinct(todayRows, 'visitor_id'),
      sessions: dashDistinct(todayRows, 'session_id'),
      registrations: todayRegs,
    },
    online_now: online,
  });
}
function dashTimeseries(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const registrations = dashRegistrations(db, win);
  const dailyMap = new Map();
  for(let key = win.startKey; key <= win.endKey; key = addDateKey(key, 1)){
    dailyMap.set(key, { day: key, views: 0, visitors: new Set(), sessions: new Set(), registrations: 0 });
  }
  for(const row of rows){
    const bucket = dailyMap.get(tehranDateKey(row.visited_at));
    if(!bucket) continue;
    bucket.views += 1;
    if(row.visitor_id) bucket.visitors.add(row.visitor_id);
    if(row.session_id) bucket.sessions.add(row.session_id);
  }
  for(const row of registrations){
    const bucket = dailyMap.get(tehranDateKey(row.occurred_at));
    if(bucket) bucket.registrations += 1;
  }
  const daily = [...dailyMap.values()].map(bucket => ({
    day: bucket.day, views: bucket.views, visitors: bucket.visitors.size, sessions: bucket.sessions.size, registrations: bucket.registrations,
  }));
  return stripPrivate({ range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' }, daily });
}
function dashPages(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const byPath = new Map();
  const bySession = new Map();
  for(const row of rows){
    if(!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id).push(row);
    if(!byPath.has(row.path)) byPath.set(row.path, { path: row.path, label: pageLabel(row.path), views: 0, visitors: new Set(), durations: [] });
    const page = byPath.get(row.path);
    page.views += 1;
    if(row.visitor_id) page.visitors.add(row.visitor_id);
  }
  for(const hits of bySession.values()){
    hits.sort((a, b) => stampMs(a.visited_at) - stampMs(b.visited_at));
    for(let i = 0; i < hits.length - 1; i++){
      const delta = stampMs(hits[i + 1].visited_at) - stampMs(hits[i].visited_at);
      if(delta > 0 && delta <= SESSION_IDLE_MS) byPath.get(hits[i].path).durations.push(delta);
    }
  }
  const total = rows.length;
  const pages = [...byPath.values()].map(page => ({
    path: page.path,
    label: page.label,
    views: page.views,
    visitors: page.visitors.size,
    percent: dashPercent(page.views, total),
    avg_time_ms: average(page.durations),
    avg_time_fa: humanizeDuration(average(page.durations)),
  })).sort((a, b) => b.views - a.views);
  return stripPrivate({ range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' }, total_views: total, pages });
}
function dashVisitors(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const sessions = sessionRows(db, win.start, win.end);
  let items = dashVisitorStats(db, win, rows, sessions);
  const q = String(input.q || '').trim().toLowerCase();
  if(q) items = items.filter(item => [item.visitor_label, item.visitor_id, item.country_name, item.city, item.path, item.device, item.browser, item.os, item.traffic_source]
    .some(value => String(value || '').toLowerCase().includes(q)));
  if(input.device) items = items.filter(item => item.device === input.device);
  if(input.source) items = items.filter(item => item.traffic_source === input.source);
  if(input.country) items = items.filter(item => String(item.country_code || '') === String(input.country) || String(item.country_name || '') === String(input.country));
  const pageSize = Math.min(100, Math.max(1, Number(input.page_size) || 10));
  const pagesCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pagesCount, Math.max(1, Number(input.page) || 1));
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  const recent = [...rows].reverse().slice(0, 20).map(row => ({
    visited_at: row.visited_at,
    visited_fa: faDateTime(row.visited_at),
    visitor_label: visitorLabel(row.visitor_id),
    path: row.path,
    country_code: row.country_code,
    country_name: row.country_name,
    city: row.city,
    device: row.device,
    browser: row.browser,
    os: row.os,
    traffic_source: row.traffic_source,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
  }));
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    total: items.length, page, page_size: pageSize, pages_count: pagesCount,
    items: slice, recent,
  });
}
function dashVisitorDetail(db, visitorId){
  const id = String(visitorId || '');
  if(!/^visitor_[A-Za-z0-9]{1,32}$/.test(id)) return null;
  const seen = db.prepare('SELECT COUNT(*) AS n FROM site_visits WHERE visitor_id=?').get(id).n;
  if(!seen) return null;
  const rows = db.prepare(`SELECT visited_at, path, device, browser, os, country_code, country_name, city,
      traffic_source, utm_source, utm_medium, utm_campaign
    FROM site_visits WHERE visitor_id=? ORDER BY visited_at ASC, id ASC`).all(id);
  const sessions = db.prepare('SELECT session_key, started_at, last_seen_at, pageviews FROM analytics_sessions WHERE visitor_id=? ORDER BY started_at ASC').all(id);
  const regs = db.prepare('SELECT kind, occurred_at FROM registration_events WHERE visitor_id=? ORDER BY occurred_at ASC').all(id);
  const durations = sessions.map(session => stampMs(session.last_seen_at) - stampMs(session.started_at)).filter(value => value > 0);
  const byPath = new Map();
  const bySource = new Map();
  const byUtm = new Map();
  for(const row of rows){
    if(!byPath.has(row.path)) byPath.set(row.path, { path: row.path, label: pageLabel(row.path), views: 0 });
    byPath.get(row.path).views += 1;
    const source = row.traffic_source || 'Direct';
    if(!bySource.has(source)) bySource.set(source, { source, views: 0 });
    bySource.get(source).views += 1;
    if(row.utm_source || row.utm_medium || row.utm_campaign){
      const key = `${row.utm_source || ''}|${row.utm_medium || ''}|${row.utm_campaign || ''}`;
      if(!byUtm.has(key)) byUtm.set(key, { utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, views: 0 });
      byUtm.get(key).views += 1;
    }
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  return stripPrivate({
    visitor_id: id,
    visitor_label: visitorLabel(id),
    kind: sessions.length > 1 ? 'returning' : 'new',
    country_code: last.country_code || null,
    country_name: last.country_name || null,
    city: last.city || null,
    device: last.device,
    browser: last.browser,
    os: last.os,
    sessions: sessions.length,
    pageviews: rows.length,
    first_at: first.visited_at,
    first_fa: faDateTime(first.visited_at),
    last_at: last.visited_at,
    last_fa: faDateTime(last.visited_at),
    average_session_ms: average(durations),
    average_session_fa: humanizeDuration(average(durations)),
    pages: [...byPath.values()].sort((a, b) => b.views - a.views),
    sources: [...bySource.values()].sort((a, b) => b.views - a.views),
    utms: [...byUtm.values()].sort((a, b) => b.views - a.views),
    registrations: regs.length,
    registered: regs.length > 0,
    registration_kinds: [...new Set(regs.map(row => row.kind))],
    registration_at: regs.length ? regs[0].occurred_at : null,
    registration_fa: regs.length ? faDateTime(regs[0].occurred_at) : null,
    online: nowWithin(last.visited_at),
  });
}
function dashSources(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const total = rows.length;
  const tally = key => {
    const map = new Map();
    for(const row of rows){
      const name = row[key] || (key === 'traffic_source' ? 'Other' : '');
      if(key !== 'traffic_source' && !name) continue;
      if(!map.has(name)) map.set(name, { name, views: 0, visitors: new Set() });
      map.get(name).views += 1;
      if(row.visitor_id) map.get(name).visitors.add(row.visitor_id);
    }
    return [...map.values()].map(item => ({
      name: item.name, views: item.views, visitors: item.visitors.size, percent: dashPercent(item.views, total),
    })).sort((a, b) => b.views - a.views);
  };
  const campaignMap = new Map();
  for(const row of rows){
    if(!row.utm_source && !row.utm_medium && !row.utm_campaign) continue;
    const key = `${row.utm_source || ''}|${row.utm_medium || ''}|${row.utm_campaign || ''}`;
    if(!campaignMap.has(key)) campaignMap.set(key, { utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, views: 0, visitors: new Set() });
    const item = campaignMap.get(key);
    item.views += 1;
    if(row.visitor_id) item.visitors.add(row.visitor_id);
  }
  const campaigns = [...campaignMap.values()].map(item => ({
    utm_source: item.utm_source, utm_medium: item.utm_medium, utm_campaign: item.utm_campaign,
    views: item.views, visitors: item.visitors.size, percent: dashPercent(item.views, total),
  })).sort((a, b) => b.views - a.views);
  const refByDomain = new Map();
  for(const row of rows){
    const name = referrerHost(row.referrer);
    if(!name) continue;
    if(!refByDomain.has(name)) refByDomain.set(name, { name, views: 0, visitors: new Set() });
    const ref = refByDomain.get(name);
    ref.views += 1;
    if(row.visitor_id) ref.visitors.add(row.visitor_id);
  }
  const referrers = [...refByDomain.values()].map(item => ({
    name: item.name, views: item.views, visitors: item.visitors.size, percent: dashPercent(item.views, total),
  })).sort((a, b) => b.views - a.views).slice(0, 12);
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    total_views: total,
    sources: tally('traffic_source'),
    referrers,
    campaigns,
  });
}
function dashDevices(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const total = rows.length;
  const tally = values => {
    const map = new Map();
    for(const { name, row } of values){
      if(!map.has(name)) map.set(name, { name, views: 0, visitors: new Set() });
      map.get(name).views += 1;
      if(row.visitor_id) map.get(name).visitors.add(row.visitor_id);
    }
    return [...map.values()].map(item => ({
      name: item.name, views: item.views, visitors: item.visitors.size, percent: dashPercent(item.views, total),
    })).sort((a, b) => b.views - a.views);
  };
  const devices = tally(rows.map(row => ({ name: ['mobile', 'tablet', 'desktop'].includes(row.device) ? row.device : 'desktop', row })));
  const browsers = tally(rows.map(row => ({ name: browserGroup(row.browser), row })));
  const os = tally(rows.map(row => ({ name: ['Android', 'iOS', 'Windows', 'macOS', 'Linux'].includes(row.os) ? row.os : 'Other', row })));
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    total_views: total, devices, browsers, os,
  });
}
function dashGeo(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const map = new Map();
  for(const row of rows){
    const key = `${row.country_code || ''}|${row.city || ''}`;
    if(!map.has(key)) map.set(key, {
      country_code: row.country_code || null,
      country_name: row.country_name || null,
      city: row.city || null,
      views: 0, visitors: new Set(),
    });
    const item = map.get(key);
    item.views += 1;
    item.country_name = item.country_name || row.country_name || null;
    if(row.visitor_id) item.visitors.add(row.visitor_id);
  }
  const places = [...map.values()].map(item => ({
    country_code: item.country_code, country_name: item.country_name, city: item.city,
    views: item.views, visitors: item.visitors.size,
  })).sort((a, b) => b.views - a.views);
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    places,
    pending_geo: unresolvedIps(db).length,
  });
}
function dashJourney(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const bySession = new Map();
  for(const row of rows){
    if(!row.session_id) continue;
    if(!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id).push(row);
  }
  const stepDefs = [
    { label: 'صفحه اصلی', test: path => path === '/' },
    { label: 'درباره من', test: path => path === '/about' },
    { label: 'خدمات', test: path => path === '/services' },
    { label: 'نتایج', test: path => path === '/results' },
    { label: 'مجله', test: path => path === '/magazine' },
    { label: 'مقاله', test: path => String(path).startsWith('/magazine/') },
    { label: 'تماس', test: path => path === '/contact' },
    { label: 'دعوت', test: path => String(path).startsWith('/join/') },
    { label: 'ثبت‌نام', test: null },
  ];
  const stepVisitors = stepDefs.map(step => new Set());
  const registerDoneVisitors = new Set(dashRegistrations(db, win).map(row => row.visitor_id).filter(Boolean));
  const chainCounts = new Map();
  for(const hits of bySession.values()){
    hits.sort((a, b) => stampMs(a.visited_at) - stampMs(b.visited_at));
    const visitorId = hits[0].visitor_id;
    for(const hit of hits){
      for(let i = 0; i < stepDefs.length - 1; i++){
        if(stepDefs[i].test(hit.path) && visitorId) stepVisitors[i].add(visitorId);
      }
    }
    if(visitorId && registerDoneVisitors.has(visitorId)) stepVisitors[stepDefs.length - 1].add(visitorId);
    const labels = [];
    const source = hits[0].traffic_source || 'Direct';
    labels.push(source);
    for(const hit of hits){
      const label = pageFa(hit.path);
      if(labels[labels.length - 1] !== label) labels.push(label);
    }
    if(visitorId && registerDoneVisitors.has(visitorId) && labels[labels.length - 1] !== 'ثبت‌نام') labels.push('ثبت‌نام');
    if(labels.length > 2){
      const chain = labels.join(' → ');
      if(!chainCounts.has(chain)) chainCounts.set(chain, new Set());
      if(visitorId) chainCounts.get(chain).add(visitorId);
    }
  }
  const steps = stepDefs.map((step, i) => ({ label: step.label, users: stepVisitors[i].size })).filter(step => step.users > 0);
  const paths = [...chainCounts.entries()].map(([path, users]) => ({ path, users: users.size }))
    .sort((a, b) => b.users - a.users).slice(0, 10);
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    steps, paths,
  });
}
function dashFunnel(db, input = {}){
  const now = dashNow(input);
  const win = resolveWindow(input, now);
  const rows = publicVisits(db, win.start, win.end);
  const visitVisitors = new Set(rows.map(row => row.visitor_id).filter(Boolean));
  const keyVisitors = new Set(rows.filter(row => DASH_KEY_PAGES.has(row.path)).map(row => row.visitor_id).filter(Boolean));
  const registerStart = dashEventRows(db, 'register_start', win);
  const registerDone = dashEventRows(db, 'registration_complete', win);
  const telegram = dashEventRows(db, 'telegram_connect', win);
  const stages = [
    { key: 'visit', label: 'بازدید سایت', count: visitVisitors.size, basis: 'visitors' },
    { key: 'key_page', label: 'مشاهده صفحه مهم', count: keyVisitors.size, basis: 'visitors' },
    { key: 'register_start', label: 'شروع ثبت‌نام', count: dashDistinct(registerStart, 'visitor_id') || registerStart.length, basis: 'visitors' },
    { key: 'registration_complete', label: 'ثبت‌نام موفق', count: dashDistinct(registerDone, 'visitor_id') || registerDone.length, basis: 'visitors' },
    { key: 'telegram_connect', label: 'اتصال تلگرام (در صورت وجود)', count: telegram.length, basis: 'events' },
  ];
  let prev = null;
  for(const stage of stages){
    stage.rate_prev = prev && prev > 0 ? dashPercent(stage.count, prev) : (stage.key === 'visit' ? 100 : 0);
    stage.rate_first = visitVisitors.size > 0 ? dashPercent(stage.count, visitVisitors.size) : 0;
    prev = stage.count;
  }
  const events = ['landing_view', 'coach_page_view', 'register_start', 'registration_complete', 'login', 'telegram_connect'].map(type => {
    const row = countEvents(db, type, win.start, win.end);
    return { event_type: type, count: row.n, visitors: row.visitors, sessions: row.sessions };
  });
  return stripPrivate({
    range: { preset: win.key, start: win.start, end: win.end, timezone: 'Asia/Tehran' },
    stages,
    key_pages: [...DASH_KEY_PAGES].sort(),
    conversion_rate: visitVisitors.size > 0 ? dashPercent(stages[3].count, visitVisitors.size) : 0,
    events,
  });
}

module.exports = {
  parseUserAgent, isBotUserAgent, isPrivateIp, isCloudflareAddress, analyticsClientIp, visitorIdFromRequest, visitorIdFromToken, legacyVisitorId,
  ensureVisitor, snapshotRequest, commitSnapshot, recordVisit, recordEvent, recordRegistration, visitorOverview,
  unresolvedIps, resolveIps, backfillGeo, startGeoResolver, cleanup, maybeCleanup, visitSummary, exportAnalytics,
  dashSummary, dashTimeseries, dashPages, dashVisitors, dashVisitorDetail, dashSources, dashDevices, dashGeo, dashJourney, dashFunnel,
  deviceFa, flagOf, humanizeDuration, faDateTime, faNum, tehranDateKey, tehranMidnightUtc, resolveWindow, rangeFromQuery,
  classifySource, isPublicAnalyticsPath, cleanPath, GEO_MAX_ATTEMPTS, GEO_HTTPS, SESSION_IDLE_MS, ONLINE_MS,
};
