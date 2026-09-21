'use strict';
// Small, non-executing HTML reader for publisher article lists. No browser,
// scripts, pagination or third-party scraping service. Dates use our existing
// Jalali converter; unknown dates stay unknown, never replaced with today.
const jalali = require('../public/jalali');
const FA = /\p{Script=Arabic}/u;
function decode(s) {
  return String(s || '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const cp = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  }).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([^\s=<>/'"]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return out;
}
function tree(html) {
  const root = { tag: 'root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const stripped = String(html).slice(0, 2000000).replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const m of stripped.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    const token = m[0];
    if (token.startsWith('<!--') || /^<!/.test(token)) continue;
    const close = token.match(/^<\/([\w:-]+)/);
    if (close) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === close[1].toLowerCase()) { stack.length = i; break; }
    } else if (token.startsWith('<')) {
      const open = token.match(/^<([\w:-]+)/); if (!open) continue;
      const node = { tag: open[1].toLowerCase(), attrs: attrs(token), children: [], parent: stack[stack.length - 1] };
      node.parent.children.push(node);
      if (!/^(img|br|hr|input|meta|link|source|wbr|area|base|embed|param|col)$/.test(node.tag) && !/\/>$/.test(token)) stack.push(node);
    } else stack[stack.length - 1].children.push({ text: decode(token) });
  }
  return root;
}
function descendants(node, predicate) {
  const result = [];
  const visit = n => { if (predicate(n)) result.push(n); for (const c of n.children || []) visit(c); };
  visit(node); return result;
}
function text(node) { return node ? (node.text ?? (node.children || []).map(text).join(' ')).replace(/\s+/g, ' ').trim() : ''; }
function httpUrl(raw, base) {
  try { const u = new URL(decode(raw), base); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
}
function sourceDate(raw) {
  const s = decode(raw).replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - 0x6f0)).replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x660));
  let m = s.match(/\b(1[34]\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return jalali.jalaliStrToIso(`${m[1]}/${m[2]}/${m[3]}`);
  for (let i = 0; i < jalali.monthNames.length; i++) {
    m = s.match(new RegExp('(\\d{1,2})\\s+' + jalali.monthNames[i] + '\\s+(1[34]\\d{2})'));
    if (m) return jalali.jalaliStrToIso(`${m[2]}/${i+1}/${m[1]}`);
  }
  m = s.match(/\b(20\d{2}-\d{2}-\d{2})(?:T[\d:.]+(?:Z|[+-][\d:]+)?)?/);
  if (m && Number.isFinite(Date.parse(m[0]))) return new Date(m[0]).toISOString();
  return null;
}
function imageIn(node, base) {
  for (const img of descendants(node, n => n.tag === 'img')) {
    const a = img.attrs;
    for (const raw of [a['data-src'], a['data-lazy-src'], a.src, (a['data-srcset'] || a.srcset || '').split(',')[0].trim().split(/\s+/)[0]]) {
      if (!raw || /^(data:|javascript:)/i.test(raw)) continue;
      const url = httpUrl(raw, base); if (url) return url;
    }
  }
  return '';
}
function parseHtmlListing(html, baseUrl) {
  const root = tree(html), base = new URL(baseUrl), items = new Map();
  const host = u => u.hostname.replace(/^www\./, '');
  function articleUrl(raw) {
    const url = httpUrl(raw, baseUrl); if (!url) return '';
    const u = new URL(url);
    if (host(u) !== host(base) || u.hash || u.pathname === base.pathname) return '';
    if (/\/(category|tag|author|page|feed|wp-content|wp-json|landings|search)\//i.test(u.pathname)) return '';
    if (host(base) === 'badanfit.ir' && !/^\/blog\/[^/]+\.html$/.test(u.pathname)) return '';
    if (host(base) === 'fitamin.ir' && !/^\/mag\/[^/]+\/$/.test(u.pathname)) return '';
    if (!/\p{L}/u.test(decodeURIComponent(u.pathname))) return '';
    u.search = ''; return u.href;
  }
  for (const a of descendants(root, n => n.tag === 'a' && n.attrs.href)) {
    let url; try { url = articleUrl(a.attrs.href); } catch (_) { continue; } if (!url) continue;
    // Nearest ancestor containing this article only: prevents borrowing another
    // card's date/image, while joining separate thumbnail and heading anchors.
    let scope = a;
    while (scope.parent && scope.parent !== root) {
      const parent = scope.parent;
      const links = descendants(parent, n => n.tag === 'a' && n.attrs.href).map(n => {
        try { return articleUrl(n.attrs.href); } catch (_) { return ''; }
      }).filter(Boolean);
      if (new Set(links).size > 1) break;
      scope = parent;
      if (scope.tag === 'article') break;
    }
    const heading = descendants(scope, n => /^h[234]$/.test(n.tag) || n.tag === 'strong')[0];
    const img = descendants(a, n => n.tag === 'img')[0];
    const title = (text(heading) || text(a) || (img && img.attrs.alt) || '').trim();
    if (!FA.test(title) || title.length < 8 || /^(ادامه|مطالعه|خواندن|مشاهده)/.test(title)) continue;
    const time = descendants(scope, n => n.tag === 'time')[0];
    const dated = descendants(scope, n => n.attrs && (n.attrs['data-date'] || n.attrs.datetime))[0];
    const publishedAt = sourceDate(time && (time.attrs.datetime || text(time))) || sourceDate(dated && (dated.attrs['data-date'] || dated.attrs.datetime)) || sourceDate(text(scope));
    const prev = items.get(url);
    items.set(url, {
      title: (heading || !prev ? title : prev.title).slice(0, 300), url,
      publishedAt: publishedAt || prev?.publishedAt || null,
      imageUrl: imageIn(scope, baseUrl) || prev?.imageUrl || '',
      summary: text(descendants(scope, n => n.tag === 'p')[0]).slice(0, 500), outlet: '', author: ''
    });
  }
  return [...items.values()].slice(0, 50);
}
function articleDate(html) {
  // Prefer publication date, never silently treat dateModified as published.
  for (const m of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (/^(article:published_time|datepublished|date|pubdate)$/i.test(a.property || a.name || a.itemprop || '')) {
      const date = sourceDate(a.content); if (date) return date;
    }
  }
  for (const m of String(html).matchAll(/"datePublished"\s*:\s*"([^"]+)"/g)) { const date = sourceDate(m[1]); if (date) return date; }
  const root = tree(html);
  const article = descendants(root, n => n.tag === 'article')[0] || root;
  const time = descendants(article, n => n.tag === 'time')[0];
  return sourceDate(time && (time.attrs.datetime || text(time)));
}
module.exports = { parseHtmlListing, articleDate, sourceDate, decode, httpUrl };
