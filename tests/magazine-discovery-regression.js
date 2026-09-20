'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),net=require('net'),http=require('http');
const {spawn}=require('child_process');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('/home/user/yasnafit/src/migrations');
const auth=require('/home/user/yasnafit/src/coach-auth-service');
const totp=require('/home/user/yasnafit/src/totp');
const discovery=require('/home/user/yasnafit/src/magazine-discovery-service');

const RSS_A=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed A</title>
<item><title>پژوهش جدید دربارهٔ تمرینات مقاومتی</title><link>https://news.example.com/story-1?utm_source=rss</link><pubDate>Mon, 18 Sep 2026 09:00:00 GMT</pubDate><description>یک مطالعهٔ جدید نشان می‌دهد تمرینات مقاومتی اثر مثبت بر سلامت است.</description><author>editor@example.com</author></item>
<item><title>تغذیه قبل از تمرین</title><link>__STORY2_URL__</link><pubDate>Mon, 18 Sep 2026 10:00:00 GMT</description>بررسی زمان‌بندی مصرف پروتئین.</description></item>
</channel></rss>`;
const RSS_B=`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed B</title>
<entry><title>پژوهش جدید درباره تمرینات مقاومتی</title><link href="https://www.other-news.example/story-1?gclid=abc&amp;utm_source=feed"/><updated>2026-09-18T09:30:00Z</updated><summary>همان خبر با عنوان کمی متفاوت از منبع دیگر.</summary></entry>
<entry><title>خبر سوم دربارهٔ سلامتی</title><link href="https://www.other-news.example/story-3"/><updated>2026-09-18T11:00:00Z</summary>سلامتی.<media:content url="https://img.example.com/b3.jpg" medium="image"/><media:thumbnail url="https://img.example.com/b3t.jpg"/></entry></entry>
</feed>`;

let failures=0;
function check(label, ok, extra='') {
  console.log((ok?'PASS':'FAIL')+' — '+label+(extra?' ('+extra+')':''));
  if(!ok) failures++;
}

function freePort(){return new Promise((res,rej)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});s.on('error',rej);});}

(async()=>{
  // ---- unit checks (no server) ----
  const itemsA=discovery.parseFeed(RSS_A.replace('__STORY2_URL__','http://127.0.0.1:1/story-2.html'));
  check('parseFeed RSS 2.0: 2 items', itemsA.length===2, 'got '+itemsA.length);
  check('parseFeed strips utm from nothing (link kept raw)', /story-1/.test(itemsA[0].url));
  check('parseFeed normalizes url (utm stripped)', discovery.normalizeUrl('https://news.example.com/story-1?utm_source=rss')==='https://news.example.com/story-1');
  const itemsB=discovery.parseFeed(RSS_B);
  const b3=itemsB.find(x=>x.url&&x.url.includes('story-3'));
  check('feed-provided image parsed (media:content)', b3 && b3.imageUrl==='https://img.example.com/b3.jpg', b3?JSON.stringify(b3.imageUrl):'missing item');
  check('parseFeed Atom: 2 entries (malformed summary tolerated)', itemsB.length===2, 'got '+itemsB.length);
  check('titleSimilarity same', discovery.titleSimilarity('پژوهش جدید دربارهٔ تمرینات مقاومتی','پژوهش جدید درباره تمرینات مقاومتی')>0.86);
  check('titleSimilarity different', discovery.titleSimilarity('تغذیه قبل از تمرین','سلامت قلب و عروق')<0.86);
  check('sha1 stable', discovery.sha1('x')===discovery.sha1('x'));
  check('normalizeUrl invalid', discovery.normalizeUrl('javascript:alert(1)')==='');
  const GOOGLE_NEWS_FIXTURE = '<rss><channel><item><title>New study on womens strength — The Guardian</title><link>https://news.google.com/rss/articles/CBMiabc123?hl=en</link><pubDate>Mon, 21 Sep 2026 06:00:00 GMT</pubDate><description>&lt;a href=&quot;https://www.theguardian.com/sport/2026/sep/21/study-women-strength&quot;&gt;New study on womens strength&lt;/a&gt; — &lt;div&gt;&lt;span&gt;The Guardian&lt;/span&gt;&lt;/div&gt;</description><source url="https://www.theguardian.com/">The Guardian</source></item></channel></rss>';
  const itemsG=discovery.parseFeed(GOOGLE_NEWS_FIXTURE);
  check('parseFeed Google News: real URL resolved from redirect', itemsG.length===1 && itemsG[0].url==='https://www.theguardian.com/sport/2026/sep/21/study-women-strength', JSON.stringify(itemsG.map(i=>i.url)));
  check('parseFeed Google News: outlet name captured', itemsG[0] && itemsG[0].outlet==='The Guardian', itemsG[0]?itemsG[0].outlet:'none');

  // ---- server + fake feeds ----
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-t37-'));
  const dataDir=path.join(dir,'data');fs.mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'yasnafit.db'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  const schemaVersion=db.prepare("SELECT id FROM schema_migrations WHERE id='033_magazine_discovery_pipeline'").get();
  check('migration 033 applied', Boolean(schemaVersion));
  auth.setupCoach(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',displayName:'m'});
  const totpSecret=auth.provisionCoachTotp(db).secret;
  db.close();

  const feedPort=await freePort();
  const STORY2_URL='http://127.0.0.1:'+feedPort+'/story2.html';
  const RSS_A2=RSS_A.replace('__STORY2_URL__',STORY2_URL);
  const ARTICLE_PAGE='<html><head><title>Pre-workout nutrition</title><meta property="og:image:secure_url" content="http://127.0.0.1:'+feedPort+'/img-2.jpg"></head><body><article>Pre-workout nutrition study.</article></body></html>';
  const feedServer=http.createServer((req,res)=>{
    if(req.url.startsWith('/story2.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(ARTICLE_PAGE);return;}
    if(req.url.startsWith('/img-2.jpg')){res.setHeader('Content-Type','image/jpeg');res.end('fake');return;}
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    if(req.url.startsWith('/a.xml'))res.end(RSS_A2);
    else if(req.url.startsWith('/b.xml'))res.end(RSS_B);
    else {res.statusCode=404;res.end('not found');}
  });
  await new Promise(r=>feedServer.listen(feedPort,'127.0.0.1',r));
  const FEED_A=`http://127.0.0.1:${feedPort}/a.xml`;
  const FEED_B=`http://127.0.0.1:${feedPort}/b.xml`;

  const port=await freePort();const BASE='http://127.0.0.1:'+port;
  const server=spawn(process.execPath,['/home/user/yasnafit/server.js'],{env:{...process.env,PORT:String(port),YASNAFIT_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>{const t=d.toString();if(t.includes('Error')||t.includes('error'))console.log('[server]',t.slice(0,200));});
  server.stderr.on('data',d=>console.log('[server:err]',String(d).slice(0,300)));
  let up=false;
  for(let i=0;i<60;i++){try{if((await fetch(BASE+'/api/health')).ok){up=true;break;}}catch(e){}await new Promise(r=>setTimeout(r,250));}
  check('server boots with migration 033', up);
  if(!up){server.kill('SIGKILL');feedServer.close();process.exit(1);}

  const login=await fetch(BASE+'/api/coach/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'crypto.javan17@gmail.com',password:'YasnafitCoach1'})});
  const challengeCookie=(login.headers.get('set-cookie')||'').split(';')[0];
  let verify=await fetch(BASE+'/api/coach/auth/verify',{method:'POST',headers:{'Content-Type':'application/json',Cookie:challengeCookie},body:JSON.stringify({code:totp.generate(totpSecret)})});
  if(verify.status!==200)verify=await fetch(BASE+'/api/coach/auth/verify',{method:'POST',headers:{'Content-Type':'application/json',Cookie:challengeCookie},body:JSON.stringify({code:totp.generate(totpSecret,{now:Date.now()+30000})})});
  const ck=(verify.headers.get('set-cookie')||'').split(';')[0];
  const H={'Content-Type':'application/json',Cookie:ck};
  const j=async(p,o={})=>{const r=await fetch(BASE+p,{...o,headers:{...H,...(o.headers||{})}});return {status:r.status,data:await r.json().catch(()=>({}))};};

  // security: queue anonymous
  let r=await fetch(BASE+'/api/magazine/admin/queue');
  check('queue anonymous → 401', r.status===401, 'got '+r.status);
  r=await fetch(BASE+'/api/magazine/admin/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  check('sources create anonymous → 401', r.status===401, 'got '+r.status);
  r=await fetch(BASE+'/api/magazine/admin/discover/progress');
  check('progress endpoint anonymous → 401', r.status===401, 'got '+r.status);
  r=await j('/api/magazine/admin/discover/progress');
  check('progress endpoint (coach): idle state with phase/counts', r.status===200 && r.data.phase==='idle' && r.data.running===false && typeof r.data.sources_total==='number' && Array.isArray(r.data.error_sources), JSON.stringify(r.data));

  // built-in world sources (migration 034): seeded & active by default; zero-setup flow
  r=await j('/api/magazine/admin/sources');
  check('built-in world sources seeded (19, all active)', r.data.sources.length===19 && r.data.sources.every(x=>x.is_active), 'count='+(r.data.sources&&r.data.sources.length));
  for(const b of r.data.sources){ await j(`/api/magazine/admin/sources/${b.id}`,{method:'PUT',body:JSON.stringify({is_active:false})}); }
  r=await j('/api/magazine/admin/sources');
  check('built-ins can be toggled off (advanced)', r.data.sources.length===19 && r.data.sources.every(x=>!x.is_active));

  // sources CRUD
  r=await j('/api/magazine/admin/sources',{method:'POST',body:JSON.stringify({name:'منبع نامعتبر',feed_url:'ftp://bad.example/x'})});
  check('source invalid url → 400', r.status===400, 'got '+r.status);
  r=await j('/api/magazine/admin/sources',{method:'POST',body:JSON.stringify({name:'فید آزمایشی A',feed_url:FEED_A,source_type:'rss',category_slug:'sports-science'})});
  check('source A created', r.status===201, 'got '+r.status+' '+JSON.stringify(r.data));
  const srcA=r.data;
  r=await j('/api/magazine/admin/sources',{method:'POST',body:JSON.stringify({name:'تکراری',feed_url:FEED_A})});
  check('duplicate source url → 409', r.status===409, 'got '+r.status);
  r=await j('/api/magazine/admin/sources',{method:'POST',body:JSON.stringify({name:'فید آزمایشی B',feed_url:FEED_B,source_type:'atom',category_slug:'health'})});
  check('source B created', r.status===201, 'got '+r.status);
  const srcB=r.data;

  // source test endpoint
  r=await j(`/api/magazine/admin/sources/${srcA.id}/test`,{method:'POST',body:'{}'});
  check('source A test ok with 2 items', r.data.ok===true && r.data.item_count===2, JSON.stringify(r.data));

  // discover #1: 3 unique stories (story-1 from A, story-2 from A, story-3 from B) ; B's story-1 dup of A's
  r=await j('/api/magazine/admin/discover',{method:'POST',body:'{}'});
  const d1=r.data;
  check('discover#1 fetched 4 items', d1.fetched===4, JSON.stringify(d1));
  check('discover#1 drafted 3', d1.drafted===3, 'drafted='+d1.drafted);
  check('discover#1 duplicate 1 (cross-source same story)', d1.duplicates===1, 'dups='+d1.duplicates);
  check('discover#1 failed 0', d1.failed===0, JSON.stringify(d1.errors||[]));

  // og:image retrieval: the local article page image must be attached
  r=await j('/api/magazine/admin/queue');
  const qImg=r.data.queue.find(q=>q.source_url===STORY2_URL);
  check('og:image attached from original article page (secure_url key + http->https upgrade)', qImg && qImg.cover_image==='https://127.0.0.1:'+feedPort+'/img-2.jpg', qImg?JSON.stringify(qImg.cover_image):'missing item');
  // backfill: a pre-existing draft without a cover must get the source image on the next run
  {
    const body='بررسی شواهد مربوط به تغذیه قبل از تمرین و تأثیر آن بر عملکرد ورزشی؛ این متن صرفاً برای آزمایش بازسازی تصویر کاور نوشته شده و طول کافی برای اعتبارسنجی ایجاد مقاله دارد.';
    r=await j('/api/magazine/admin/articles',{method:'POST',body:JSON.stringify({title:'مطلب آزمایشی تصویر',summary:'test backfill',content:body,category:'nutrition',source_url:STORY2_URL,source_name:'news.example.com'})});
    const backfillId=r.data&&r.data.id;
    check('test draft created without cover image', r.status===201 && backfillId && !r.data.cover_image, 'status='+r.status);
    r=await j('/api/magazine/admin/discover',{method:'POST',body:'{}'});
    const af=await j('/api/magazine/admin/articles/'+backfillId);
    check('image backfill: old draft now has source og:image (https)', af.data && af.data.cover_image==='https://127.0.0.1:'+feedPort+'/img-2.jpg', af.data?JSON.stringify(af.data.cover_image):'missing');
  }
  r=await j('/api/magazine/admin/queue');
  check('queue has 4 pending drafts (3 discovered + 1 backfill test)', r.data.queue.length===4, 'got '+r.data.queue.length);
  const q1=r.data.queue.find(q=>q.title.includes('پژوهش جدید'));
  check('queue item has source + flags + discovered_at', q1 && q1.source_name==='فید آزمایشی A' && Array.isArray(q1.quality_flags) && q1.discovered_at, q1?JSON.stringify({s:q1.source_name,f:q1.quality_flags,d:q1.discovered_at}):'missing');
  r=await j('/api/magazine/admin/queue/stats');
  check('stats: 0 published, 4 drafts (incl. backfill test)', r.data.published===0 && r.data.drafts===4, JSON.stringify(r.data));
  r=await j('/api/magazine/admin/queue/stats');
  check('stats: last_run_at recorded after discovery', Boolean(r.data.last_run_at), JSON.stringify(r.data.last_run_at));

  // review detail
  r=await j(`/api/magazine/admin/queue/${q1.id}`);
  check('review detail: discovery + references + history', r.data.discovery && r.data.discovery.original_title && r.data.references.length>=1 && Array.isArray(r.data.history), JSON.stringify({d:!!r.data.discovery,refs:r.data.references.length}));

  // drafts are DRAFT + generated + source set; not public
  const art1=(await j(`/api/magazine/admin/articles/${q1.id}`)).data;
  check('draft article DRAFT + generated + source_url', art1 && art1.status==='DRAFT' && art1.content_origin==='generated' && !!art1.source_url, art1?art1.status+'/'+art1.content_origin:'missing');
  let pub=await fetch(BASE+'/magazine');
  check('public /magazine shows empty state (no PUBLISHED)', (await pub.text()).includes('هنوز مقاله‌ای منتشر نشده است'));
  pub=await fetch(BASE+'/magazine/'+art1.slug);
  check('public draft article → 404', pub.status===404, 'got '+pub.status);

  // coach edit via PUT (title + references)
  r=await j(`/api/magazine/admin/articles/${art1.id}`,{method:'PUT',body:JSON.stringify({title:'پژوهش جدید دربارهٔ تمرینات مقاومتی (ویرایش مربی)',summary:'خلاصه ویرایش‌شده',content:art1.content+'\n<p>بخش افزوده‌شده توسط مربی</p>',category:'sports-science',sources:[{name:'فید آزمایشی A',url:art1.source_url},{name:'منبع علمی',url:'https://sci.example.com/study-1'}]} )});
  check('coach edit saved', r.status===200 && r.data.title.includes('ویرایش مربی'), 'got '+r.status);

  // publish (from queue)
  r=await j(`/api/magazine/admin/articles/${art1.id}/publish`,{method:'POST',body:'{}'});
  check('approve+publish → 200 PUBLISHED', r.status===200 && r.data.status==='PUBLISHED', 'got '+r.status+' '+JSON.stringify(r.data.error||''));
  pub=await fetch(BASE+'/magazine/'+art1.slug);
  const artText=await pub.text();
  check('published article public 200', pub.status===200 && artText.includes('پژوهش جدید دربارهٔ تمرینات مقاومتی (ویرایش مربی)'), 'got '+pub.status);
  pub=await fetch(BASE+'/magazine');
  check('/magazine lists published article', (await pub.text()).includes(art1.slug));
  pub=await fetch(BASE+'/');
  check('homepage shows published article', (await pub.text()).includes(art1.slug));

  // duplicate publish blocked: craft a second generated article w/ same source_url
  r=await j('/api/magazine/admin/articles',{method:'POST',body:JSON.stringify({title:'کاپی تکراری',summary:'تکراری',content:'<p>متن برای تست بلاک تکراری</p>',content_origin:'generated',source_url:art1.source_url,source_name:'فید آزمایشی A'})});
  const dupArt=r.data;
  r=await j(`/api/magazine/admin/articles/${dupArt.id}/publish`,{method:'POST',body:'{}'});
  check('duplicate source publish → 409', r.status===409 && r.data.code==='DUPLICATE_SOURCE', 'got '+r.status+' '+JSON.stringify(r.data));
  await j(`/api/magazine/admin/articles/${dupArt.id}`,{method:'DELETE'});

  // source required for generated articles
  r=await j('/api/magazine/admin/articles',{method:'POST',body:JSON.stringify({title:'مقاله بدون منبع',summary:'x',content:'<p>متن آزمایشی برای بررسی اعتبارسنجی منبع</p>',content_origin:'generated'})});
  const noSrc=r.data;
  r=await j(`/api/magazine/admin/articles/${noSrc.id}/publish`,{method:'POST',body:'{}'});
  check('publish generated w/o source → 400 SOURCE_REQUIRED', r.status===400 && r.data.code==='SOURCE_REQUIRED', 'got '+r.status+' '+JSON.stringify(r.data));
  await j(`/api/magazine/admin/articles/${noSrc.id}`,{method:'DELETE'});

  // reject with reason
  const rejectList=await j('/api/magazine/admin/articles?status=DRAFT');
  const art3=rejectList.data.items[0];
  r=await j(`/api/magazine/admin/articles/${art3.id}/reject`,{method:'POST',body:JSON.stringify({reason:'محتوای ضعیف — توضیح مربی'})});
  check('reject with reason → REJECTED', r.status===200 && r.data.status==='REJECTED', 'got '+r.status+' '+JSON.stringify(r.data));
  r=await j(`/api/magazine/admin/articles/${art3.id}`);
  const rejectedRow=await fetch(BASE+'/api/magazine/admin/articles/'+art3.id,{headers:H}).then(x=>x.json());
  const db2=new DatabaseSync(path.join(dataDir,'yasnafit.db'));
  const reasonRow=db2.prepare('SELECT rejection_reason FROM magazine_articles WHERE id=?').get(art3.id);
  check('rejection_reason persisted', reasonRow && reasonRow.rejection_reason.includes('محتوای ضعیف'), JSON.stringify(reasonRow));
  const auditRows=db2.prepare("SELECT action FROM audit_events WHERE entity_type='magazine_article' AND entity_id=? ORDER BY id").all(art3.id);
  check('audit trail: created? updated? rejected', auditRows.some(x=>x.action==='article_reject')||auditRows.some(x=>String(x.action).includes('reject')), JSON.stringify(auditRows.map(x=>x.action)));
  const discoveryEvents=db2.prepare("SELECT action FROM audit_events WHERE entity_type='magazine_discovery'").all();
  check('audit: discovery.completed recorded', discoveryEvents.some(x=>x.action==='discovery.completed'), JSON.stringify(discoveryEvents.map(x=>x.action)));
  // reject never public
  pub=await fetch(BASE+'/magazine/'+rejectedRow.slug);
  check('rejected article not public', pub.status===404, 'got '+pub.status);
  db2.close();

  // discover #2: everything duplicate now
  r=await j('/api/magazine/admin/discover',{method:'POST',body:'{}'});
  check('discover#2: 0 new drafts, 4 duplicates', r.data.drafted===0 && r.data.duplicates===4, JSON.stringify(r.data));

  // notification
  r=await j('/api/coach/notifications');
  const note=(r.data.notifications||[]).find(n=>n.type==='magazine_review_ready');
  check('coach in-app notification after discovery (📰)', Boolean(note) && note.body.includes('📰') && note.body.includes('مطلب جدید برای بررسی آماده است'), note?note.body:'none');

  // settings: fetch_interval validation
  r=await j('/api/magazine/admin/settings',{method:'PUT',body:JSON.stringify({'magazine.fetch_interval':'13'})});
  check('invalid fetch_interval coerced to 12', r.data.settings['magazine.fetch_interval']==='12', JSON.stringify(r.data.settings['magazine.fetch_interval']));
  r=await j('/api/magazine/admin/settings',{method:'PUT',body:JSON.stringify({'magazine.fetch_interval':'6','magazine.auto_fetch':'1'})});
  check('fetch_interval 6 + auto_fetch 1 saved', r.data.settings['magazine.fetch_interval']==='6' && r.data.settings['magazine.auto_fetch']==='1');
  r=await j('/api/magazine/admin/settings',{method:'PUT',body:JSON.stringify({'magazine.auto_fetch':'0'})});

  // cross-origin mutation blocked on new endpoints
  const cross=await fetch(BASE+'/api/magazine/admin/discover',{method:'POST',headers:{'Content-Type':'application/json',Cookie:ck,Origin:'http://evil.example'},body:'{}'});
  check('cross-origin discover → 403', cross.status===403, 'got '+cross.status);
  const cross2=await fetch(BASE+'/api/magazine/admin/sources',{method:'POST',headers:{'Content-Type':'application/json',Cookie:ck,Origin:'http://evil.example'},body:JSON.stringify({name:'x',feed_url:'https://x.example/f'})});
  check('cross-origin source create → 403', cross2.status===403, 'got '+cross2.status);

  // admin UI assets reference the new tabs
  const ui=fs.readFileSync('/home/user/yasnafit/public/magazine-admin.js','utf8');
  check('UI: news inbox tab present', ui.includes("['news', 'اخبار و مطالب جدید']"));
  check('UI: technical sources tab hidden from coach tabs', !ui.match(/const tabs = \[\s*\n(?:\s*\['[a-z]+',[^\n]*\n)*?\s*\['sources'[^\n]*\n/));
  check('UI: editorial inbox card + image modal present', ui.includes('function newsCard') && ui.includes('function imageModal') && ui.includes('mag-news-grid'));
  check('UI: live progress bar + progress endpoint + image referrer fix', ui.includes('mag-progress__fill') && ui.includes('/api/magazine/admin/discover/progress') && ui.includes('referrerpolicy="no-referrer"') && ui.includes("referrerPolicy = 'no-referrer'"));
  check('UI: old «در انتظار پیاده‌سازی» note removed', !ui.includes('در انتظار پیاده‌سازی موتور دریافت منابع'));

  // ---- scheduler (in-process, same db as the server's data dir) ----
  const dbS=new DatabaseSync(path.join(dataDir,'yasnafit.db'));
  const offResult=await discovery.tickScheduledDiscovery(dbS,{'magazine.auto_fetch':'0','magazine.fetch_interval':'12'});
  check('scheduler: auto_fetch off → no run', offResult===null);
  // enable auto fetch + very short effective interval via lastAutoRunAt=0
  discovery.stopDiscoveryScheduler();
  dbS.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.auto_fetch','1')").run();
  dbS.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.fetch_interval','6')").run();
  const onResult=await discovery.tickScheduledDiscovery(dbS,{'magazine.auto_fetch':'1','magazine.fetch_interval':'6'});
  check('scheduler: auto_fetch on → discovery ran (all dups now)', onResult && onResult.drafted===0 && onResult.duplicates===4, JSON.stringify(onResult||null));
  const immediate=await discovery.tickScheduledDiscovery(dbS,{'magazine.auto_fetch':'1','magazine.fetch_interval':'6'});
  check('scheduler: interval gate blocks immediate second run', immediate===null);
  const schedEvents=dbS.prepare("SELECT action FROM audit_events WHERE action LIKE 'discovery.scheduled%'").all();
  check('scheduler: scheduled run audited', schedEvents.some(x=>x.action==='discovery.scheduled'), JSON.stringify(schedEvents.map(x=>x.action)));
  dbS.close();

  console.log('\n'+(failures? `${failures} FAILURES` : 'ALL SMOKE CHECKS PASSED'));
  server.kill('SIGKILL');feedServer.close();
  fs.rmSync(dir,{recursive:true,force:true});
  process.exit(failures?1:0);
})().catch(e=>{console.error('SMOKE CRASH',e);process.exit(1);});
