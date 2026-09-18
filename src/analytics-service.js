'use strict';
// یسنا فیت — تحلیل بازدید سایت: ثبت بازدید صفحه‌های HTML، تشخیص دستگاه/مرورگر،
// جغرافیای IP (با کش و حل‌کنندهٔ پس‌زمینهٔ ip-api) و خلاصهٔ آماری برای پنل مربی و ربات.
const crypto = require('crypto');

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }

// ── تشخیص دستگاه/مرورگر/سیستم‌عامل از User-Agent ──
function parseUserAgent(raw){
  const ua = String(raw || '');
  const isTablet = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = !isTablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile/i.test(ua);
  const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  let browser = 'سایر';
  if(/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if(/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if(/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if(/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if(/CriOS/.test(ua)) browser = 'Chrome';
  else if(/Chrome\//.test(ua)) browser = 'Chrome';
  else if(/Safari\//.test(ua)) browser = 'Safari';
  let os = 'سایر';
  if(/Windows NT|Windows Phone/.test(ua)) os = 'Windows';
  else if(/Android/.test(ua)) os = 'Android';
  else if(/iPhone|iPad|iPod|iOS/.test(ua)) os = 'iOS';
  else if(/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if(/Linux/.test(ua)) os = 'Linux';
  return { device, browser, os };
}
function isBotUserAgent(raw){
  return /bot|crawler|spider|curl|wget|headless|monitor|uptime|healthcheck|preview|facebookexternalhit|telegrambot/i.test(String(raw || ''));
}
function isPrivateIp(ip){
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|::ffff:127\.|f[cd][0-9a-f]{2}:|unknown)/i.test(String(ip || ''));
}

// ── ثبت بازدید (هرگز نباید پاسخ را بشکند) ──
function recordVisit(db, { ip, path, userAgent }){
  try{
    if(!db || isBotUserAgent(userAgent)) return false;
    const { device, browser, os } = parseUserAgent(userAgent);
    db.prepare(`INSERT INTO site_visits(stable_id,visited_at,ip,device,browser,os,path,user_agent)
                VALUES(?,?,?,?,?,?,?,?)`)
      .run(uuid(), new Date().toISOString(), String(ip || 'unknown'), device, browser, os, String(path || '/').slice(0, 300), String(userAgent || '').slice(0, 400));
    return true;
  }catch(error){ return false; }
}

// ── جغرافیا: کش → حل‌کنندهٔ دسته‌ای ip-api (رایگان، بدون کلید) ──
const GEO_MAX_ATTEMPTS = 3;
function unresolvedIps(db, limit = 100){
  return db.prepare(`
    SELECT DISTINCT v.ip FROM site_visits v
    LEFT JOIN ip_geo_cache c ON c.ip = v.ip
    WHERE v.ip IS NOT NULL AND v.ip != 'unknown'
      AND (c.ip IS NULL OR (c.country_code IS NULL AND c.attempts < ?))
    LIMIT ?`).all(GEO_MAX_ATTEMPTS, limit).map(r => r.ip);
}
async function resolveIps(db, ips, fetcher = null){
  const list = (ips || []).filter(Boolean).slice(0, 100);
  if(!list.length) return 0;
  const doFetch = fetcher || globalThis.fetch;
  const local = list.filter(isPrivateIp);
  const remote = list.filter(ip => !isPrivateIp(ip));
  const now = new Date().toISOString();
  for(const ip of local){
    db.prepare(`INSERT INTO ip_geo_cache(ip,country_code,country_name,resolved_at,attempts) VALUES(?,?,?,?,1)
                ON CONFLICT(ip) DO UPDATE SET country_code='LN', country_name='شبکهٔ محلی', resolved_at=?, attempts=attempts+1`)
      .run(ip, 'LN', 'شبکهٔ محلی', now, now);
  }
  if(remote.length){
    try{
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await doFetch('http://ip-api.com/batch?fields=status,country,countryCode,query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remote), signal: controller.signal,
      });
      clearTimeout(timer);
      const rows = await response.json();
      if(Array.isArray(rows)){
        for(const row of rows){
          const ip = String(row.query || '');
          if(!ip) continue;
          const ok = row.status === 'success' && row.countryCode;
          db.prepare(`INSERT INTO ip_geo_cache(ip,country_code,country_name,resolved_at,attempts) VALUES(?,?,?,?,1)
                      ON CONFLICT(ip) DO UPDATE SET
                        country_code=CASE WHEN ? OR ip_geo_cache.attempts < ${GEO_MAX_ATTEMPTS} THEN excluded.country_code ELSE ip_geo_cache.country_code END,
                        country_name=CASE WHEN ? OR ip_geo_cache.attempts < ${GEO_MAX_ATTEMPTS} THEN excluded.country_name ELSE ip_geo_cache.country_name END,
                        resolved_at=excluded.resolved_at, attempts=ip_geo_cache.attempts+1`)
            .run(ip, ok ? row.countryCode : null, ok ? row.country : null, now, ok ? 1 : 0, ok ? 1 : 0);
        }
      }
    }catch(error){ /* شبکه در دسترس نیست — دفعهٔ بعد دوباره تلاش می‌شود */ }
  }
  // بازگرداندن جغرافیا به ردیف‌های بازدید
  db.prepare(`UPDATE site_visits SET country_code=(SELECT c.country_code FROM ip_geo_cache c WHERE c.ip=site_visits.ip),
              country_name=(SELECT c.country_name FROM ip_geo_cache c WHERE c.ip=site_visits.ip)
              WHERE country_code IS NULL AND ip IN (SELECT ip FROM ip_geo_cache WHERE country_code IS NOT NULL)`).run();
  return list.length;
}
function backfillGeo(db){
  try{
    db.prepare(`UPDATE site_visits SET country_code=(SELECT c.country_code FROM ip_geo_cache c WHERE c.ip=site_visits.ip),
                country_name=(SELECT c.country_name FROM ip_geo_cache c WHERE c.ip=site_visits.ip)
                WHERE country_code IS NULL AND ip IN (SELECT ip FROM ip_geo_cache WHERE country_code IS NOT NULL)`).run();
  }catch(error){}
}
function startGeoResolver(db){
  let busy = false;
  const tick = async () => {
    if(busy) return; busy = true;
    try{
      const ips = unresolvedIps(db, 100);
      if(ips.length) await resolveIps(db, ips);
      else backfillGeo(db);
    }catch(error){}finally{ busy = false; }
  };
  const timer = setInterval(tick, 45 * 1000);
  if(timer.unref) timer.unref();
  setTimeout(tick, 2500).unref ? setTimeout(tick, 2500) : null;
  return timer;
}
function cleanup(db, keepDays = 180){
  try{ db.prepare(`DELETE FROM site_visits WHERE visited_at < datetime('now', ?)`).run(`-${keepDays} days`); }catch(error){}
}

// ── خلاصهٔ آماری ──
const DEVICE_FA = { mobile: '📱 موبایل', tablet: '💻 تبلت', desktop: '🖥 دسکتاپ', unknown: 'نامشخص' };
function deviceFa(d){ return DEVICE_FA[d] || d; }
function flagOf(code){
  const cc = String(code || '').toUpperCase();
  if(cc === 'LN') return '🏠';
  if(!/^[A-Z]{2}$/.test(cc)) return '🌐';
  return String.fromCodePoint(...[...cc].map(ch => 127397 + ch.charCodeAt(0)));
}
function visitSummary(db, days = 30){
  const now = Date.now();
  const iso = ms => new Date(now - ms).toISOString();
  const D = 86400000;
  const ranges = { today: iso(0 - 0), day1: iso(D), day7: iso(7 * D), day30: iso(30 * D) };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const count = (sinceIso, distinct) => db.prepare(
    `SELECT COUNT(*) views, COUNT(DISTINCT ip) ips FROM site_visits WHERE visited_at >= ?`
  ).get(sinceIso);
  const since = (ms) => new Date(now - ms).toISOString();
  const views = ms => count(since(ms)).views;
  const ips = ms => count(since(ms)).ips;
  const todayRow = db.prepare('SELECT COUNT(*) views, COUNT(DISTINCT ip) ips FROM site_visits WHERE visited_at >= ?').get(todayStart.toISOString());
  const total = db.prepare('SELECT COUNT(*) views, COUNT(DISTINCT ip) ips FROM site_visits').get();
  const daily = db.prepare(`SELECT date(visited_at,'localtime') day, COUNT(*) views, COUNT(DISTINCT ip) ips
                            FROM site_visits WHERE visited_at >= ? GROUP BY day ORDER BY day ASC LIMIT 90`).all(since(days * D));
  const byCountries = db.prepare(`SELECT COALESCE(NULLIF(country_code,''),'??') code, COALESCE(country_name,'نامشخص') name,
                                  COUNT(DISTINCT ip) ips, COUNT(*) views
                                  FROM site_visits WHERE visited_at >= ? GROUP BY code ORDER BY ips DESC, views DESC LIMIT 12`).all(since(days * D));
  const byDevices = db.prepare(`SELECT device, COUNT(DISTINCT ip) ips, COUNT(*) views FROM site_visits
                                WHERE visited_at >= ? GROUP BY device ORDER BY views DESC`).all(since(days * D));
  const byBrowsers = db.prepare(`SELECT browser, COUNT(*) views FROM site_visits WHERE visited_at >= ? GROUP BY browser ORDER BY views DESC LIMIT 8`).all(since(days * D));
  const byOs = db.prepare(`SELECT os, COUNT(*) views FROM site_visits WHERE visited_at >= ? GROUP BY os ORDER BY views DESC LIMIT 8`).all(since(days * D));
  const recent = db.prepare(`SELECT visited_at, ip, country_code, country_name, device, browser, path
                             FROM site_visits ORDER BY id DESC LIMIT 15`).all();
  const pendingGeo = db.prepare(`SELECT COUNT(DISTINCT v.ip) n FROM site_visits v
                                 LEFT JOIN ip_geo_cache c ON c.ip=v.ip
                                 WHERE v.ip!='unknown' AND (c.ip IS NULL OR c.country_code IS NULL)`).get().n;
  return {
    days,
    summary: {
      today_views: todayRow.views, today_ips: todayRow.ips,
      day1_views: views(D), day1_ips: ips(D),
      day7_views: views(7 * D), day7_ips: ips(7 * D),
      day30_views: views(30 * D), day30_ips: ips(30 * D),
      total_views: total.views, total_ips: total.ips,
    },
    daily, countries: byCountries, devices: byDevices, browsers: byBrowsers, os: byOs,
    recent, pending_geo: pendingGeo,
  };
}

module.exports = { parseUserAgent, isBotUserAgent, isPrivateIp, recordVisit, unresolvedIps, resolveIps, backfillGeo, startGeoResolver, cleanup, visitSummary, deviceFa, flagOf, GEO_MAX_ATTEMPTS };
