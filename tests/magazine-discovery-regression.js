'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),net=require('net'),http=require('http');
const {spawn}=require('child_process');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('/home/user/yasnafit/src/migrations');
const auth=require('/home/user/yasnafit/src/coach-auth-service');
const totp=require('/home/user/yasnafit/src/totp');
const discovery=require('/home/user/yasnafit/src/magazine-discovery-service');

// Build a news.google.com/rss/articles/<id> redirect whose base64 id carries
// the real publisher URL (new Google News link format).
const gnewsId=(url,junk='hello')=>{const b=Buffer.concat([Buffer.from([0x0a,junk.length]),Buffer.from(junk),Buffer.from([0x12,Buffer.byteLength(url)]),Buffer.from(url)]);return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const GNEWS_REAL='https://redirect-story.example.com/rs-1';

const RSS_A=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed A</title>
<item><title>پژوهش جدید دربارهٔ تمرینات مقاومتی</title><link>https://news.example.com/story-1?utm_source=rss</link><pubDate>Mon, 18 Sep 2026 09:00:00 GMT</pubDate><description>یک مطالعهٔ جدید نشان می‌دهد تمرینات مقاومتی اثر مثبت بر سلامت است.</description><author>editor@example.com</author></item>
<item><title>تغذیه قبل از تمرین</title><link>__STORY2_URL__</link><pubDate>Mon, 18 Sep 2026 10:00:00 GMT</pubDate><description>بررسی زمان‌بندی مصرف پروتئین.</description></item>
<item><title>مقاله قدیمی از سال 2017</title><link>https://old.example.com/article-2017</link><pubDate>Wed, 15 Mar 2017 12:00:00 GMT</pubDate><description>یک مقالهٔ خیلی قدیمی که نباید به‌عنوان مطلب جدید بیاید.</description></item>
<item><title>مقاله قدیمی از سال 2020</title><link>https://old.example.com/article-2020</link><pubDate>Sun, 10 May 2020 09:00:00 GMT</pubDate><description>یک مقالهٔ قدیمی دیگر.</description></item>
<item><title>مطلب دو ماه پیش بدون مرجعیت</title><link>https://news.example.com/aged-60</link><pubDate>Fri, 24 Jul 2026 08:00:00 GMT</pubDate><description>مطلبی قدیمی‌تر از ۳۰ روز.</description></item>
<item><title>مرجع پایدار دربارهٔ انرژی در دسترس EVERGREEN_OK</title><link>https://news.example.com/aged-60-evergreen</link><pubDate>Fri, 24 Jul 2026 09:00:00 GMT</pubDate><description>مطلب مرجعی قدیمی ولی مهم.</description></item>
<item><title>مطلب جدید از Science Daily</title><link>https://sci-daily.example.com/women-resistance-training</link><pubDate>Mon, 21 Sep 2026 07:00:00 GMT</pubDate><description>تحقیق جدید دربارهٔ تمرین مقاومتی زنان.</description><source url="https://sci-daily.example.com">Science Daily</source></item>
<item><title>بررسی جدید خواب و ریکاوری</title><link>http://127.0.0.1:__IMGPORT__/page-a.html</link><pubDate>Mon, 21 Sep 2026 08:00:00 GMT</pubDate><description>تست یکتایی تصویر.</description></item>
<item><title>رشد عضلانی با پروتئین کافی</title><link>http://127.0.0.1:__IMGPORT__/page-b.html</link><pubDate>Mon, 21 Sep 2026 08:30:00 GMT</pubDate><description>تست یکتایی تصویر.</description></item>
<item><title>خبر سلبریتی جدید</title><link>https://www.tmz.com/story-celebrity</link><pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate><description>اخبار سلبریتی.</description></item>
<item><title>مطلب ریدایرکت گوگل یک</title><link>https://news.google.com/rss/articles/__GNEWS_ID1__</link><pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate><description>تست ریدایرکت جدید.</description><source url="https://redirect-story.example.com">Redirect Story</source></item>
<item><title>مطلب ریدایرکت گوگل یک کپی</title><link>https://news.google.com/rss/articles/__GNEWS_ID2__</link><pubDate>Mon, 21 Sep 2026 10:05:00 GMT</pubDate><description>همان مطلب با ریدایرکت متفاوت.</description><source url="https://redirect-story.example.com">Redirect Story</source></item>
</channel></rss>`;

const RSS_B=`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed B</title>
<entry><title>پژوهش جدید درباره تمرینات مقاومتی</title><link href="https://www.other-news.example/story-1?gclid=abc&amp;utm_source=feed"/><updated>2026-09-18T09:30:00Z</updated><summary>همان خبر با عنوان کمی متفاوت از منبع دیگر.</summary></entry>
<entry><title>خبر سوم دربارهٔ سلامتی</title><link href="https://www.other-news.example/story-3"/><updated>2026-09-18T11:00:00Z</updated><summary>سلامتی.<media:content url="https://img.example.com/b3.jpg" medium="image"/><media:thumbnail url="https://img.example.com/b3t.jpg"/></entry></entry>
</feed>`;


// 25-item feed: items 1-5 carry their own feed image (priority test)
const wordsC=['پروتئین','کراتین','خواب','ریکاوری','کربوهیدرات','چربیسوزی','آبرسانی','ویتامین','امگا','فیتوستروئول','کلسیم','منیزیم','آهن','فولات','کافئین','بیتاآلانین','سیترولین','گلوتامین','کولاجن','الکرنیتین','ترکیب غذا','شدت تمرین','استقامت','تثبیت وزن','سلامت استخوان'];
const entriesC=Array.from({length:25},(_,i)=>{
  const n=String(i+1).padStart(2,'0');
  const img=(i<4)?'<media:content url="https://img-c.example.com/c'+n+'.jpg" medium="image"/>':(i===4?'<media:content url="http://img-c.example.com/c05.jpg" medium="image"/>':'');
  return '<entry><title>مطلب دربارهٔ '+wordsC[i]+'</title><link href="https://c.example.com/story-'+n+'"/><updated>2026-09-18T08:'+n+':00Z</updated><summary>خلاصهٔ '+wordsC[i]+'.</summary>'+img+'</entry>';
}).join('');
const RSS_C='<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed C</title>'+entriesC+'</feed>';

// rev10 feed D: redirect-to-canonical story / twitter:image-only story / AI-failure story
const RSS_D='<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed D</title>'
  +'<entry><title>مورد حوالهٔ اصلی</title><link href="http://127.0.0.1:__IMGPORT__/redirector/x"/><updated>2026-09-21T08:00:00Z</updated><summary>موردی که باید به انتشارکنندۀ اصلی و canonical حل شود.</summary></entry>'
  +'<entry><title>مورد تصویر توییتر</title><link href="http://127.0.0.1:__IMGPORT__/img-twitter.html"/><updated>2026-09-21T08:10:00Z</updated><summary>موردی که صفحهٔ آن فقط twitter:image دارد.</summary></entry>'
  +'<entry><title>مطلب تستی با عنوان ترکیبی</title><link href="http://127.0.0.1:__IMGPORT__/fail-ai.html"/><updated>2026-09-21T08:20:00Z</updated><summary>مطلبی که بدون هیچ مرحلهٔ هوش مصنوعی باید پیش‌نویس معمولی شود.</summary></entry>'
  +'<entry><title>Can You Mix Creatine With Electrolytes? Experts Explain</title><link href="http://127.0.0.1:__IMGPORT__/en-first.html"/><updated>2026-09-21T08:30:00Z</updated><summary>Electrolytes and creatine in English only — must never become main content in the Persian pipeline.</summary></entry>'
  +'</feed>';

let failures=0;
function check(label, ok, extra='') {
  console.log((ok?'PASS':'FAIL')+' — '+label+(extra?' ('+extra+')':''));
  if(!ok) failures++;
}

function freePort(){return new Promise((res,rej)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});s.on('error',rej);});}

(async()=>{
  // ---- unit checks (no server) ----
  const itemsA=discovery.parseFeed(RSS_A.replace('__STORY2_URL__','http://127.0.0.1:1/story-2.html'));
  check('parseFeed RSS 2.0: 12 items', itemsA.length===12, 'got '+itemsA.length);
  check('parseFeed strips utm from nothing (link kept raw)', /story-1/.test(itemsA[0].url));
  check('parseFeed normalizes url (utm stripped)', discovery.normalizeUrl('https://news.example.com/story-1?utm_source=rss')==='https://news.example.com/story-1');
  const itemsB=discovery.parseFeed(RSS_B);
  const b3=itemsB.find(x=>x.url&&x.url.includes('story-3'));
  check('feed-provided image parsed (media:content)', b3 && b3.imageUrl==='https://img.example.com/b3.jpg', b3?JSON.stringify(b3.imageUrl):'missing item');
  check('parseFeed Atom: 2 entries (malformed summary tolerated)', itemsB.length===2, 'got '+itemsB.length);
  const itemsC=discovery.parseFeed(RSS_C);
  check('parseFeed C: 25 items, 5 feed images (item 5 intentionally http for upgrade test)', itemsC.length===25 && itemsC.slice(0,4).every((x,i)=>x.imageUrl==='https://img-c.example.com/c'+String(i+1).padStart(2,'0')+'.jpg') && itemsC[4].imageUrl==='http://img-c.example.com/c05.jpg' && !itemsC[5].imageUrl, 'got '+itemsC.length);
  check('titleSimilarity same', discovery.titleSimilarity('پژوهش جدید دربارهٔ تمرینات مقاومتی','پژوهش جدید درباره تمرینات مقاومتی')>0.86);
  check('titleSimilarity different', discovery.titleSimilarity('تغذیه قبل از تمرین','سلامت قلب و عروق')<0.86);
  check('sha1 stable', discovery.sha1('x')===discovery.sha1('x'));
  check('normalizeUrl invalid', discovery.normalizeUrl('javascript:alert(1)')==='');
  const GOOGLE_NEWS_FIXTURE = '<rss><channel><item><title>New study on womens strength — The Guardian</title><link>https://news.google.com/rss/articles/CBMiabc123?hl=en</link><pubDate>Mon, 21 Sep 2026 06:00:00 GMT</pubDate><description>&lt;a href=&quot;https://www.theguardian.com/sport/2026/sep/21/study-women-strength&quot;&gt;New study on womens strength&lt;/a&gt; — &lt;div&gt;&lt;span&gt;The Guardian&lt;/span&gt;&lt;/div&gt;</description><source url="https://www.theguardian.com/">The Guardian</source></item></channel></rss>';
  const itemsG=discovery.parseFeed(GOOGLE_NEWS_FIXTURE);
  check('parseFeed Google News: real URL resolved from redirect', itemsG.length===1 && itemsG[0].url==='https://www.theguardian.com/sport/2026/sep/21/study-women-strength', JSON.stringify(itemsG.map(i=>i.url)));
  check('parseFeed Google News: outlet name captured', itemsG[0] && itemsG[0].outlet==='The Guardian', itemsG[0]?itemsG[0].outlet:'none');
  // rev 9: google-news encoded redirect (new format), freshness gates, publisher
  check('resolveGoogleNewsUrl: encoded redirect id -> original publisher URL', discovery.resolveGoogleNewsUrl('https://news.google.com/rss/articles/'+gnewsId('https://real.example.com/decoded-article'), '')==='https://real.example.com/decoded-article');
  check('resolveGoogleNewsUrl: non-google URL passes through', discovery.resolveGoogleNewsUrl('https://plain.example.com/x','')==='https://plain.example.com/x');
  check('freshnessGate: 10d general -> fresh', discovery.freshnessGate({ageDays:10,scientific:false}).accept==='fresh');
  check('freshnessGate: 60d scientific -> fresh (90d limit)', discovery.freshnessGate({ageDays:60,scientific:true}).accept==='fresh');
  check('freshnessGate: 60d general -> needs AI evergreen mark', discovery.freshnessGate({ageDays:60,scientific:false}).accept==='evergreen');
  check('freshnessGate: 400d -> rejected (never "new")', discovery.freshnessGate({ageDays:400,scientific:true}).accept===false);
  check('freshnessGate: missing date -> rejected (cannot verify freshness)', discovery.freshnessGate({ageDays:null,scientific:false}).accept===false);
  check('publisherOf: <source> outlet wins', discovery.publisherOf({url:'https://redirect-story.example.com/rs-1',outlet:'Science Daily'},{name:'X'})==='Science Daily');
  check('publisherOf: domain fallback (never "Google News")', discovery.publisherOf({url:'https://sci-daily.example.com/a',outlet:''},{name:'روز دنیا: علم ورزش'})==='Sci Daily');
  check('LOW_QUALITY hosts: celebrity domain blocked, science domain allowed', discovery.LOW_QUALITY_HOSTS.test(discovery.hostOf('https://www.tmz.com/x'))===true && discovery.LOW_QUALITY_HOSTS.test(discovery.hostOf('https://pubmed.ncbi.nlm.nih.gov/x'))===false);

  // ---- server + fake feeds ----
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-t37-'));
  const dataDir=path.join(dir,'data');fs.mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'yasnafit.db'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  const schemaVersion=db.prepare("SELECT id FROM schema_migrations WHERE id='033_magazine_discovery_pipeline'").get();
  check('migration 033 applied', Boolean(schemaVersion));
  check('migration 037 (source quality tiers) applied', Boolean(db.prepare("SELECT id FROM schema_migrations WHERE id='037_magazine_source_quality_tiers'").get()));
  check('migration 038 (Persian-only sources) applied', Boolean(db.prepare("SELECT id FROM schema_migrations WHERE id='038_magazine_persian_sources'").get()));
  auth.setupCoach(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',displayName:'m'});
  const totpSecret=auth.provisionCoachTotp(db).secret;
  db.close();

  const feedPort=await freePort();
  const STORY2_URL='http://127.0.0.1:'+feedPort+'/story2.html';
  const RSS_A2=RSS_A.split('__STORY2_URL__').join(STORY2_URL).split('__IMGPORT__').join(String(feedPort)).split('__GNEWS_ID1__').join(gnewsId(GNEWS_REAL)).split('__GNEWS_ID2__').join(gnewsId(GNEWS_REAL,'other'));
  const RSS_D2=RSS_D.split('__IMGPORT__').join(String(feedPort));
  const ARTICLE_PAGE='<html><head><title>Pre-workout nutrition</title><meta property=\"og:site_name\" content=\"مجلهٔ تغذیه\"><meta property="og:image:secure_url" content="http://127.0.0.1:'+feedPort+'/img-2.jpg"></head><body><article>Pre-workout nutrition study.</article></body></html>';
  const STORY4_PAGE='<html><head><title>Canonical story</title><link rel="canonical" href="https://publisher4.example.com/canon-1"><meta property="og:site_name" content="Site Four"><meta property="og:image" content="https://img4.example.com/main.jpg"></head><body><article>متن اصلی مقالهٔ چهارم: این صفحه برای تست حل‌شوندگی canonical، نام انتشارکننده (og:site_name) و تصویر og استفاده می‌شود و باید متن کافی برای ویراستار هوش مصنوعی داشته باشد تا خروجی معتبر شود و به صف بررسی برود.</article></body></html>';
  const TWITTER_PAGE='<html><head><title>TW story</title><meta name="twitter:image" content="https://img-tw.example.com/tw.jpg"></head><body><article>متن مورد تصویر توییتر: این صفحه فقط تصویر twitter:image دارد (بدون og:image) و زنجیرهٔ تصویر باید به twitter برسد؛ متن کافی برای ویراستار دارد.</article></body></html>';
  const SHARED_OG_PAGE=ogUrl=>'<html><head><meta property="og:site_name" content="رسانهٔ علمی"><meta property="og:image" content="'+ogUrl+'"></head><body>article</body></html>';
  const AI_CONTENT='<p>این متن آزمایشی برای بررسی خط لولهٔ ویراستاری است. طبق گزارش منبع، تمرینات مقاومتی منظم می‌تواند بر سلامت استخوان‌ها و عضلات زنان اثر مثبت بگذارد و باید با تغذیهٔ کافی همراه باشد. این پاراگراف طول کافی برای اعتبارسنجی دارد.</p><p>بخش دوم: نتایج منبع نشان می‌دهد افزایش تدریجی بار تمرین همراه با ریکاوری مناسب، بهترین نتیجه را دارد.</p>';
  const aiReply=(prompt)=>{
    const m=prompt.match(/عنوان اصلی: (.*)/);
    const orig=m?m[1].trim():'مطلب آزمایشی';
    return {
      title:'ترجمهٔ فارسی: '+orig,
      summary:'خلاصهٔ فارسی: طبق گزارش منبع، '+orig+' برای مخاطب YASNAFIT مهم است.',
      content_html:AI_CONTENT,
      key_points:['نکتهٔ اول: تمرین مقاومتی منظم اثر مثبت دارد','نکتهٔ دوم: تغذیهٔ کافی ضروری است','نکتهٔ سوم: افزایش تدریجی بار','نکتهٔ چهارم: ریکاوری مناسب'],
      references:[{name:'منبع اصلی',url:'https://news.example.com/story-1'}],
      related_keywords:['تمرین مقاومتی','تغذیه'],
      sensitive_flags:[],
      confidence:0.9,
      relevance:8,
      evergreen_reference:/EVERGREEN_OK/.test(prompt),
      category:'sports-science',
      why_it_matters:'برای زنان ورزشکار که دنبال تمرین مقاومتی هستند مفید است.',
      useful:true
    };
  };
  let aiCalls=0;
  const feedServer=http.createServer((req,res)=>{
    if(req.url.startsWith('/redirector/x')){res.statusCode=302;res.setHeader('Location','http://127.0.0.1:'+feedPort+'/story4.html');res.end('');return;}
    if(req.url.startsWith('/story4.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(STORY4_PAGE);return;}
    if(req.url.startsWith('/img-twitter.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(TWITTER_PAGE);return;}
    if(req.url.startsWith('/fail-ai.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><title>Fail</title></head><body><article>مطلب تستی که در جریان ساده‌شدهٔ فارسی (بدون هیچ مرحلهٔ هوش مصنوعی) مثل هر مطلب دیگری باید به‌عنوان پیش‌نویس معمولی ساخته شود.</article></body></html>');return;}
    if(req.url.startsWith('/legacy2.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><title>منبع میراث</title><meta property="og:site_name" content="رسانهٔ میراث"></head><body><article>مطلب قدیمی که باید به منبع اصلی حل شود.</article></body></html>');return;}
    if(req.url.startsWith('/legacy3.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><title>منبع میراث سه</title><meta property="og:site_name" content="رسانهٔ میراث"></head><body><article>مطلب بازپردازش دستی با منبع حل‌شدنی محلی.</article></body></html>');return;}
    if(req.url.startsWith('/en-first.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><title>EN first</title></head><body><article>Can you mix creatine with electrolytes? Experts explain the interaction between creatine monohydrate and electrolyte supplements, and whether combining them in a single drink is safe for most adults.</article></body></html>');return;}
    if(req.url.startsWith('/story2.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(ARTICLE_PAGE);return;}
    if(req.url.startsWith('/page-a.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(SHARED_OG_PAGE('https://shared-img.example.com/shared.jpg'));return;}
    if(req.url.startsWith('/page-b.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(SHARED_OG_PAGE('https://shared-img.example.com/shared.jpg'));return;}
    if(req.url.startsWith('/img-2.jpg')){res.setHeader('Content-Type','image/jpeg');res.end('fake');return;}
    if(req.url.startsWith('/ai/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:['mock-model'],default_combo:'mock-model'}));return;}
    if(req.url.startsWith('/ai/chat/completions')){aiCalls+=1;let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{const p=JSON.parse(body);const prompt=(p.messages||[]).map(m=>m.content).join('\n');if(prompt.includes('FAILAI مورد ناموفق')){res.setHeader('Content-Type','text/plain');res.end('not-json: the mock AI exploded for this story');return;}
      if(prompt.includes('Creatine With Electrolytes') && !prompt.includes('خروجی قبلی شما پذیرفته نشد')){const bad={title:'Can You Mix Creatine With Electrolytes? Experts Explain',summary:'Creatine and electrolytes in English only.',content_html:'<p>english only content that must not reach the inbox as a prepared Persian article.</p>'.repeat(10),key_points:['a','b','c'],references:[],related_keywords:[],sensitive_flags:[],confidence:0.9,relevance:8,evergreen_reference:false,category:'sports-science',why_it_matters:'no',useful:true};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'```json\n'+JSON.stringify(bad)+'\n```'}}]}));return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'```json\n'+JSON.stringify(aiReply(prompt))+'\n```'}}]}));}catch(e){res.statusCode=500;res.end('bad');}});return;}
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    if(req.url.startsWith('/a.xml'))res.end(RSS_A2);
    else if(req.url.startsWith('/d.xml'))res.end(RSS_D2);
    else if(req.url.startsWith('/b.xml'))res.end(RSS_B);
    else if(req.url.startsWith('/c.xml')){res.end(RSS_C);return;}
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
  check('built-in PERSIAN sources active (6) + English world sources deactivated (19, kept)', r.data.sources.length===25 && r.data.sources.filter(x=>x.is_active).length===6 && r.data.sources.filter(x=>x.is_active).every(x=>String(x.name).includes('منبع فارسی')), 'count='+(r.data.sources&&r.data.sources.length)+' active='+(r.data.sources||[]).filter(x=>x.is_active).length);
  const t1=r.data.sources.find(x=>/PubMed/.test(x.name)); const t1b=r.data.sources.find(x=>/British Journal/.test(x.name)); const t3=r.data.sources.find(x=>/اخبار ورزشی/.test(x.name));
  check('source quality tiers: scientific=1, professional=1, general media=3', t1 && t1b && t3 && t1.source_tier===1 && t1b.source_tier===1 && t3.source_tier===3, JSON.stringify({pubmed:t1&&t1.source_tier,bjsm:t1b&&t1b.source_tier,news:t3&&t3.source_tier}));
  for(const b of r.data.sources){ await j(`/api/magazine/admin/sources/${b.id}`,{method:'PUT',body:JSON.stringify({is_active:false})}); }
  r=await j('/api/magazine/admin/sources');
  check('built-ins can be toggled off (advanced)', r.data.sources.length===25 && r.data.sources.every(x=>!x.is_active));

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
  check('source A test ok with 12 items', r.data.ok===true && r.data.item_count===12, JSON.stringify(r.data));

  // point the AI at the local mock editor (so every candidate is AI-prepared)
  r=await j('/api/ai/settings',{method:'PUT',body:JSON.stringify({api_key:'test-mock-key',base_url:'http://127.0.0.1:'+feedPort+'/ai',default_combo:'mock-model'})});
  check('AI settings pointed at local mock editor', r.status===200 && r.data.has_api_key===true, JSON.stringify(r.data));
  // rev10: article page inspection (canonical / publisher name / image chain / text)
  {
    const page4=await discovery.fetchArticlePage('http://127.0.0.1:'+feedPort+'/story4.html');
    check('rev10 fetchArticlePage: canonical URL extracted', page4.ok && page4.canonical==='https://publisher4.example.com/canon-1', JSON.stringify({ok:page4.ok,c:page4.canonical}));
    check('rev10 fetchArticlePage: og:site_name = original publisher', page4.siteName==='Site Four', page4.siteName);
    check('rev10 fetchArticlePage: og:image found', page4.ogImage==='https://img4.example.com/main.jpg', page4.ogImage);
    check('rev10 fetchArticlePage: article main text extracted (feeds AI draft)', page4.text.length>60, 'len='+(page4.text||'').length);
    const pageTw=await discovery.fetchArticlePage('http://127.0.0.1:'+feedPort+'/img-twitter.html');
    check('rev10 image chain: twitter:image used when og missing', discovery.pageImageChain(pageTw)==='https://img-tw.example.com/tw.jpg', discovery.pageImageChain(pageTw));
    check('rev10 validImageUrl: http image upgraded to https', discovery.validImageUrl('http://img.example.com/a.jpg')==='https://img.example.com/a.jpg');
    check('rev10 validImageUrl: generic google-hosted assets blocked', discovery.validImageUrl('https://encrypted-tbn0.gstatic.com/images?q=abc')==='');
    check('rev10 validImageUrl: logo/icon paths blocked', discovery.validImageUrl('https://site.example.com/static/logo-2026.png')==='');
    check('rev10 fetchArticlePage: google pages never scraped', (await discovery.fetchArticlePage('https://news.google.com/rss/articles/abc')).ok===false);
  }

  // discover #1: 14 items = 8 drafted + 1 rejected (aged, not evergreen) +
  // 2 duplicates (cross-source story + two google-redirects of one story) +
  // 3 filtered (2017 + 2020 too old, 1 celebrity host)
  r=await j('/api/magazine/admin/discover',{method:'POST',body:'{}'});
  const d1=r.data;
  check('discover#1 fetched 14 candidates', d1.fetched===14, JSON.stringify(d1));
  check('discover#1 drafted 7 (original Persian titles, NO AI used)', d1.drafted===7, 'drafted='+d1.drafted+' np='+d1.not_prepared);
  check('discover#1 duplicates 2 (cross-source + google-redirect same story)', d1.duplicates===2, 'dups='+d1.duplicates);
  check('discover#1 filtered 5 (4 not-fresh [2017/2020/2×60d] + 1 low-quality host)', d1.filtered===5 && d1.filtered_breakdown && d1.filtered_breakdown['freshness']===4 && d1.filtered_breakdown['low-quality']===1, JSON.stringify(d1.filtered_breakdown));
  check('discover#1 rejected 0 (aged items filtered, not rejected)', d1.rejected===0, 'rejected='+d1.rejected);
  check('discover#1 not_prepared 0 (no AI step exists in the simplified flow)', d1.not_prepared===0, 'np='+d1.not_prepared);
  check('rev11: pipeline NEVER calls the AI (0 AI calls for 14 candidates)', aiCalls===0, 'aiCalls='+aiCalls);
  check('discover#1 failed 0', d1.failed===0, JSON.stringify(d1.errors||[]));


  // og:image retrieval: the local article page image must be attached
  r=await j('/api/magazine/admin/queue');
  const qImg=r.data.queue.find(q=>q.source_url===STORY2_URL);
  check('og:image attached from original article page (secure_url key + http->https upgrade)', qImg && qImg.cover_image==='https://127.0.0.1:'+feedPort+'/img-2.jpg', qImg?JSON.stringify(qImg.cover_image):'missing item urls='+JSON.stringify(r.data.queue.map(q=>q.source_url)));
  // rev 9: freshness / quality / publisher / image-uniqueness verification
  r=await j('/api/magazine/admin/queue');
  const qAll=r.data.queue;
  const arabic=/\p{Script=Arabic}/u;
  check('inbox: every draft = original Persian title + real publisher (no AI fields)', qAll.length===7 && qAll.every(q=>arabic.test(q.title) && q.source_name && String(q.source_name).length>0 && !/google\.com/i.test(String(q.source_url))), JSON.stringify(qAll.map(q=>({t:String(q.title).slice(0,25),s:q.source_name}))));
  check('inbox: summary kept wherever the feed provided one (6 of 7 — one fixture feed has none)', qAll.filter(q=>String(q.summary||'').length>0).length===6, 'with-summary='+qAll.filter(q=>String(q.summary||'').length>0).length);
  check('rev11: draft title is the ORIGINAL Persian title (no «ترجمهٔ فارسی:» prefix)', qAll.every(q=>!String(q.title).startsWith('ترجمهٔ فارسی:')), JSON.stringify(qAll.map(q=>String(q.title).slice(0,20))));
  check('inbox: source is the original publisher (never feed name / Google News)', qAll.every(q=>q.source_name && q.source_name.length>0 && !/google|روز دنیا|فید آزمایشی/i.test(q.source_name)), JSON.stringify(qAll.map(q=>q.source_name)));
  const sciPub=qAll.find(q=>String(q.title).includes('Science Daily'));
  check('source shown = original publisher (Science Daily) + original URL', sciPub && sciPub.source_name==='Science Daily' && sciPub.source_url==='https://sci-daily.example.com/women-resistance-training', sciPub?JSON.stringify({s:sciPub.source_name,u:sciPub.source_url}):'missing');
  const gArt=qAll.find(q=>q.source_url===GNEWS_REAL);
  check('google-news redirect resolved: source_url = original publisher URL', gArt && gArt.source_url===GNEWS_REAL && gArt.source_name==='Redirect Story', gArt?JSON.stringify({u:gArt.source_url,s:gArt.source_name}):'missing');
  check('aged (60d) items NOT in the inbox (evergreen/AI path removed from simplified flow)', !qAll.some(q=>String(q.title).includes('EVERGREEN_OK')), 'aged item leaked into inbox');
  check('inbox: no 2017/2020 article presented as new', !qAll.some(q=>/2017|2020/.test(String(q.title))));
  const imgOnes=qAll.filter(q=>q.cover_image==='https://shared-img.example.com/shared.jpg');
  check('image uniqueness: shared og image assigned to exactly one article', imgOnes.length===1, 'count='+imgOnes.length);
  {
    const dbQ=new DatabaseSync(path.join(dataDir,'yasnafit.db'));
    const oldRows=dbQ.prepare("SELECT ai_meta FROM magazine_discoveries WHERE title_original LIKE '%2017%' OR title_original LIKE '%2020%'").all();
    check('2017/2020 items rejected with freshness reason (logged, not in inbox)', oldRows.length===2 && oldRows.every(x=>{try{return JSON.parse(x.ai_meta||'{}').filtered==='too-old';}catch(e){return false;}}), JSON.stringify(oldRows.map(x=>x.ai_meta)));
    const lowRow=dbQ.prepare("SELECT ai_meta FROM magazine_discoveries WHERE title_original LIKE '%سلبریتی%'").get();
    check('celebrity/low-quality host filtered out', lowRow && JSON.parse(lowRow.ai_meta||'{}').filtered==='low-quality', lowRow?lowRow.ai_meta:'none');
    const dupResolved=dbQ.prepare('SELECT COUNT(*) c FROM magazine_discoveries WHERE url_hash=?').get(discovery.sha1(discovery.normalizeUrl(GNEWS_REAL)));
    check('near-duplicate via two google-redirects deduped (drafted + duplicate rows)', dupResolved.c===2, 'rows='+dupResolved.c);
    check('AI never auto-publishes: zero PUBLISHED articles after discovery', dbQ.prepare("SELECT COUNT(*) c FROM magazine_articles WHERE status='PUBLISHED'").get().c===0);
    dbQ.close();
  }
  r=await j('/api/magazine/admin/queue/stats');
  check('stats: last_run reports 7 new items found (run count ≠ queue count)', r.data.last_run && r.data.last_run.drafted===7 && r.data.drafts===7, JSON.stringify({lr:r.data.last_run,d:r.data.drafts}));
  // backfill: a pre-existing draft without a cover must get the source image on the next run
  {
    const body='بررسی شواهد مربوط به تغذیه قبل از تمرین و تأثیر آن بر عملکرد ورزشی؛ این متن صرفاً برای آزمایش بازسازی تصویر کاور نوشته شده و طول کافی برای اعتبارسنجی ایجاد مقاله دارد.';
    r=await j('/api/magazine/admin/articles',{method:'POST',body:JSON.stringify({title:'مطلب آزمایشی تصویر',summary:'test backfill',content:body,category:'nutrition',source_url:STORY2_URL,source_name:'news.example.com'})});
    const backfillId=r.data&&r.data.id;
    check('test draft created without cover image', r.status===201 && backfillId && !r.data.cover_image, 'status='+r.status);
    r=await j('/api/magazine/admin/discover',{method:'POST',body:'{}'});
    const af=await j('/api/magazine/admin/articles/'+backfillId);
    check('image backfill: old draft now has source og:image (https)', af.data && af.data.cover_image==='https://127.0.0.1:'+feedPort+'/img-2.jpg', af.data?JSON.stringify(af.data.cover_image):'missing');
  r=await j('/api/magazine/admin/articles');
  const listStory2=r.data.items.filter(a=>a.source_url===STORY2_URL);
  check('admin LIST API returns cover_image + source_name + source_url (news card image)', listStory2.length>=2 && listStory2.every(a=>a.cover_image==='https://127.0.0.1:'+feedPort+'/img-2.jpg' && typeof a.source_name==='string' && a.source_name.length>0), JSON.stringify(listStory2.map(a=>({c:a.cover_image,s:a.source_name}))));
  }
  {
    const h=await fetch(BASE+'/coach/magazine',{headers:{Cookie:ck}});
    const csp=h.headers.get('content-security-policy');
    check('app page CSP allows https og images (img-src includes https:)', csp && csp.includes("img-src 'self' data: blob: https:"), csp||'no csp header, status='+h.status);
  }
  // rev10: coach UI wording — separate, clearly explained counts + card labels
  {
    const ui=(await (await fetch(BASE+'/magazine-admin.js')).text());
    check('rev10 UI: «آماده است» vs «نیازمند پردازش مجدد» explained separately', ui.includes('مطلب برای بررسی آماده است') && ui.includes('نیازمند پردازش مجدد') && ui.includes('در شمارش «آماده بررسی» نیست'), 'missing wording');
    check('rev11 UI: scan toast = «مطلب جدید فارسی پیدا شد» (new finds) + ready count', ui.includes('در این بررسی') && ui.includes('مطلب جدید فارسی پیدا شد') && ui.includes('مطلب برای بررسی آماده است'), 'missing toast wording');
    check('rev11 UI: simple card — [مشاهده][ویرایش][✓ انتشار][رد] + تصویر پیدا نشد، بدون فیلدهای AI', ui.includes('mag-action--view') && ui.includes('data-news-action="edit"') && ui.includes('data-news-action="publish"') && ui.includes('data-news-action="reject"') && ui.includes('تصویر برای این مطلب پیدا نشد') && !ui.includes('چرا این مطلب مهم است؟') && !ui.includes('نکات کلیدی:'), 'label mismatch');
    check('rev10 UI: no misleading «این بار N مورد آماده شد» claim', !ui.includes('مورد آماده شد — برای ادامه'), 'still present');
    check('rev10.1 UI: parked items offer «🔄 پردازش مجدد» (manual retry) + attempts shown', ui.includes('🔄 پردازش مجدد') && ui.includes('تلاش خودکار'), 'missing button');
  }
  // batch cap + image priority (isolated in-memory db + local feed C)
  {
    const { runMigrations } = require('../src/migrations');
    const { DatabaseSync } = require('node:sqlite');
    const mem = new DatabaseSync(':memory:');
    runMigrations(mem);
    mem.prepare('UPDATE magazine_sources SET is_active=0').run();
    mem.prepare('INSERT INTO magazine_sources (stable_id, name, feed_url, source_type, category_slug, is_active, fetch_interval_h) VALUES (?,?,?,?,?,1,12)').run('test-feed-c','Test C','http://127.0.0.1:'+feedPort+'/c.xml','rss','nutrition');
    require('/home/user/yasnafit/src/ai-service').saveSettings(mem,{api_key:'mock',base_url:'http://127.0.0.1:'+feedPort+'/ai',default_combo:'mock-model'});
    const r1 = await discovery.runDiscovery(mem, { notifyAudience: 'none' });
    check('batch: first run drafts exactly 20 new items (cap)', r1.drafted === 20, 'drafted='+r1.drafted+' new='+r1.newItems);
    check('batch: stopped_at_cap=true when 25 candidates > cap', r1.stopped_at_cap === true && r1.newItems === 25, 'stopped='+r1.stopped_at_cap);
    let allImgs = true;
    for (let n=1;n<=5;n++){
      const u='https://c.example.com/story-0'+n;
      if(!mem.prepare('SELECT id FROM magazine_articles WHERE source_url=?').get(u)) allImgs=false;
    }
    check('priority: all 5 feed-image items drafted in the first batch', allImgs);
    const c5=mem.prepare('SELECT a.cover_image FROM magazine_articles a WHERE a.source_url=?').get('https://c.example.com/story-05');
    check('upgrade: feed http image stored as https (CSP-safe cover)', c5 && c5.cover_image==='https://img-c.example.com/c05.jpg', c5?JSON.stringify(c5.cover_image):'missing');
    const r2 = await discovery.runDiscovery(mem, { notifyAudience: 'none' });
    check('batch: second run (جستجو بیشتر) drafts the remaining 5', r2.drafted === 5, 'drafted='+r2.drafted);
    check('batch: second run not stopped at cap', r2.stopped_at_cap === false, 'new='+r2.newItems);
    mem.close();
  }
  // AI unavailable -> NOTHING reaches the inbox (no raw English drafts)
  {
    const mem2=new DatabaseSync(':memory:'); runMigrations(mem2);
    mem2.prepare('UPDATE magazine_sources SET is_active=0').run();
    mem2.prepare('INSERT INTO magazine_sources (stable_id, name, feed_url, source_type, category_slug, is_active, fetch_interval_h) VALUES (?,?,?,?,?,1,12)').run('test-feed-c2','Test C2','http://127.0.0.1:'+feedPort+'/c.xml','rss','nutrition');
    require('/home/user/yasnafit/src/ai-service').saveSettings(mem2,{api_key:'dead-key',base_url:'http://127.0.0.1:1/ai',default_combo:'mock'});
    const rA=await discovery.runDiscovery(mem2,{notifyAudience:'none'});
    check('rev11: AI NOT required — all 20 drafted even with AI completely unavailable', rA.drafted===20 && rA.not_prepared===0, JSON.stringify({d:rA.drafted,np:rA.not_prepared}));
    const firstC=mem2.prepare('SELECT content, title FROM magazine_articles ORDER BY id LIMIT 1').get();
    check('rev11: article content = original Persian title + summary + original link (no AI text)', firstC && /مطالعهٔ کامل مطلب در منبع اصلی/.test(firstC.content) && /\p{Script=Arabic}/u.test(firstC.title), JSON.stringify({t:firstC&&firstC.title.slice(0,20)}));
    mem2.close();
  }
  // rev10: original URL resolution (redirect → canonical), publisher name, image
  // chain, and AI failure = «نیازمند پردازش مجدد» (never enters the ready queue)
  {
    const mem3=new DatabaseSync(':memory:'); runMigrations(mem3);
    mem3.prepare('UPDATE magazine_sources SET is_active=0').run();
    mem3.prepare('INSERT INTO magazine_sources (stable_id, name, feed_url, source_type, category_slug, is_active, fetch_interval_h) VALUES (?,?,?,?,?,1,12)').run('test-feed-d','Test D','http://127.0.0.1:'+feedPort+'/d.xml','rss','sports-science');
    require('/home/user/yasnafit/src/ai-service').saveSettings(mem3,{api_key:'mock',base_url:'http://127.0.0.1:'+feedPort+'/ai',default_combo:'mock-model'});
    const rD=await discovery.runDiscovery(mem3,{notifyAudience:'none'});
    check('rev11: 4 candidates → 3 drafted (original Persian), 1 filtered non-Persian, no AI involved', rD.drafted===3 && rD.filtered===1 && rD.filtered_breakdown['non-persian']===1 && rD.not_prepared===0, JSON.stringify(rD));
    const redir=mem3.prepare('SELECT a.* FROM magazine_articles a JOIN magazine_discoveries d ON d.article_id=a.id WHERE d.title_original LIKE ?').get('%حوالهٔ اصلی%');
    check('rev10: redirect resolved → canonical publisher URL (final source, never discovery link)', redir && redir.source_url==='https://publisher4.example.com/canon-1', redir?JSON.stringify(redir.source_url):'missing');
    check('rev10: coach-facing source = og:site_name of the original page', redir && redir.source_name==='Site Four', redir?redir.source_name:'missing');
    check('rev10: article image = its own og:image', redir && redir.cover_image==='https://img4.example.com/main.jpg', redir?redir.cover_image:'missing');
    const twItem=mem3.prepare('SELECT a.cover_image FROM magazine_articles a JOIN magazine_discoveries d ON d.article_id=a.id WHERE d.title_original LIKE ?').get('%تصویر توییتر%');
    check('rev10: twitter:image used when og missing', twItem && twItem.cover_image==='https://img-tw.example.com/tw.jpg', twItem?twItem.cover_image:'missing');
    const enRow=mem3.prepare("SELECT * FROM magazine_discoveries WHERE title_original LIKE '%Creatine With Electrolytes%'").get();
    check('rev11: English result is FILTERED — never becomes main content', enRow && enRow.status==='FAILED' && JSON.parse(enRow.ai_meta||'{}').filtered==='non-persian' && mem3.prepare("SELECT COUNT(*) c FROM magazine_discoveries WHERE title_original LIKE '%Creatine With Electrolytes%' AND article_id IS NOT NULL").get().c===0, JSON.stringify({s:enRow&&enRow.status}));
    check('rev11: no AI → the story (kept Persian title) is a normal draft like any other', Boolean(mem3.prepare("SELECT article_id FROM magazine_discoveries WHERE title_original LIKE '%عنوان ترکیبی%'").get().article_id), 'no article');
    const stD=discovery.queueStats(mem3);
    check('rev10: queue stats split — 3 ready, 0 parked (ready count never includes failed)', stD.drafts===3 && stD.needs_reprocess===0, JSON.stringify(stD));
    const qD=discovery.queueView(mem3);
    check('rev10: queue rows carry audit_reasons (empty for clean drafts)', qD.length===3 && qD.every(q=>Array.isArray(q.audit_reasons) && qD.length===3 && q.audit_reasons.length===0), JSON.stringify(qD.map(q=>q.audit_reasons)));
    // Legacy (pre-rev10) drafts must be cleaned on the next run:
    // (1) a 2020 English-titled draft with a Google News source → rejected (stale)
    // (2) a FA-titled fresh draft still pointing at a Google News link → re-resolved
    const legOldId=mem3.prepare("INSERT INTO magazine_articles (stable_id, slug, title, summary, content, status, content_origin, source_name, source_url, created_at, updated_at) VALUES (?,?,?,?,?,?, 'generated', 'Google News', 'https://news.google.com/rss/articles/OLDLEGACY1', '2020-03-01 09:00:00', '2020-03-01 09:00:00')").run('legacy-stable-old','legacy-2020','Legacy English Title from 2020','legacy summary','<p>legacy content that must not survive the freshness audit and should be rejected with a clear internal reason.</p>'.repeat(3),'DRAFT').lastInsertRowid;
    const leg2Id=mem3.prepare("INSERT INTO magazine_articles (stable_id, slug, title, summary, content, status, content_origin, source_name, source_url, created_at, updated_at) VALUES (?,?,?,?,?,?, 'generated', 'Google News', 'https://news.google.com/rss/articles/OLDLEGACY2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run('legacy-stable-gnews','legacy-gnews','مطلب فارسی با منبع گوگل‌نیوز','خلاصهٔ فارسی','<p>متن فارسی قدیمی با منبع گوگل‌نیوز که باید در بازرسی بعدی به انتشارکنندۀ اصلی حل شود و در صف آماده‌بررسی نماند.</p>'.repeat(3),'DRAFT').lastInsertRowid;
    mem3.prepare("INSERT INTO magazine_discoveries (stable_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, publisher, status, article_id, ai_meta) VALUES (?,?,?,?,?,?,?,?,?, 'DRAFTED', ?, ?)").run('leg-old','https://news.google.com/rss/articles/OLDLEGACY1','h-leg-old','fp-leg-old','Legacy English Title from 2020','2020-03-01 09:00:00','sports-science','legacy','Google News',legOldId,null);
    mem3.prepare("INSERT INTO magazine_discoveries (stable_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, publisher, status, article_id, ai_meta) VALUES (?,?,?,?,?,?,?,?,?, 'DRAFTED', ?, ?)").run('leg-gnews','https://news.google.com/rss/articles/'+gnewsId('http://127.0.0.1:'+feedPort+'/legacy2.html'),'h-leg-gnews','fp-leg-gnews','مطلب فارسی با منبع گوگل‌نیوز','2026-09-21 08:00:00','sports-science','legacy','Google News',leg2Id,null);
    let stBefore=discovery.queueStats(mem3);
    check('rev11 audit: legacy drafts flagged (ready 3, 2 parked)', stBefore.drafts===3 && stBefore.needs_reprocess===2, JSON.stringify(stBefore));
    const rp=await discovery.reprocessStaleDrafts(mem3);
    check('rev10 reprocess: stale legacy rejected + gnews legacy re-resolved', rp.rejected===1 && rp.reprocessed===1, JSON.stringify(rp));
    const oldRow=mem3.prepare('SELECT * FROM magazine_articles WHERE id=?').get(legOldId);
    check('rev11 reprocess: 2020 English draft REJECTED (stale + not Persian — no AI can fix it)', String(oldRow.status)==='REJECTED' && (String(oldRow.rejection_reason||'').includes('تازگی') || String(oldRow.rejection_reason||'').includes('فارسی')), JSON.stringify({s:oldRow.status,r:oldRow.rejection_reason}));
    const leg2=mem3.prepare('SELECT * FROM magazine_articles WHERE id=?').get(leg2Id);
    check('rev10 reprocess: gnews source resolved to original publisher (article updated in place)', String(leg2.source_url).startsWith('http://127.0.0.1:'+feedPort+'/legacy2.html') && String(leg2.source_name).includes('میراث') && /\p{Script=Arabic}/u.test(leg2.title), JSON.stringify({u:leg2.source_url,t:leg2.title.slice(0,30),n:leg2.source_name}));
    const stAfter=discovery.queueStats(mem3);
    check('rev10 reprocess: ready queue clean again (4 ready incl. re-resolved one, 0 parked)', stAfter.drafts===4 && stAfter.needs_reprocess===0, JSON.stringify(stAfter));
    // Rev11: only unresolved sources park now; reprocess keeps retrying them (≤3).
    mem3.prepare("INSERT INTO magazine_articles (stable_id, slug, title, summary, content, status, content_origin, source_name, source_url, created_at, updated_at) VALUES (?,?,?,?,?,?, 'imported', 'Google News', 'https://news.google.com/rss/articles/UNRESOLVED1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run('mem3-park','mem3-park','مورد پارک‌شده با منبع حل‌نشده','خلاصه','<p>متن تست پارک و ریترائی منبع حل‌نشده که باید تا سقف ۳ بار دوباره امتحان شود و حلقهٔ بی‌پایان نشود.</p>'.repeat(3),'DRAFT');
    const parkId=mem3.prepare("SELECT id FROM magazine_articles WHERE slug='mem3-park'").get().id;
    mem3.prepare("INSERT INTO magazine_discoveries (stable_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, publisher, status, article_id, ai_meta) VALUES (?,?,?,?,?,?,?,?,?, 'FAILED', ?, ?)").run('mem3-park-d','https://news.google.com/rss/articles/UNRESOLVED1','h-mem3-park','fp-mem3-park','مورد پارک‌شده با منبع حل‌نشده','2026-09-21 09:00:00','sports-science','legacy','Google News',parkId,JSON.stringify({needs_reprocess:true,reprocess_count:0}));
    // The parked ARTICLE row (status DRAFT but discovery FAILED) — reprocessOne is the manual path;
    // the auto path handles FAILED discovery rows with article_id via the same retry loop.
    for(let i=0;i<3;i++){ await discovery.reprocessStaleDrafts(mem3); }
    const parkMeta=mem3.prepare("SELECT ai_meta FROM magazine_discoveries WHERE stable_id='mem3-park-d'").get().ai_meta;
    let parkJ={}; try{parkJ=JSON.parse(parkMeta);}catch(e){}
    check('rev11: reprocess attempts capped at 3 (no infinite retry loop)', parkJ.reprocess_count===3, JSON.stringify(parkJ));
    mem3.close();
  }
  r=await j('/api/magazine/admin/queue');
  check('queue has 8 pending drafts (7 discovered + 1 backfill test)', r.data.queue.length===8, 'got '+r.data.queue.length);
  const q1=r.data.queue.find(q=>q.title.includes('پژوهش جدید'));
  check('queue item has publisher source + flags + discovered_at', q1 && q1.source_name==='News' && Array.isArray(q1.quality_flags) && q1.discovered_at, q1?JSON.stringify({s:q1.source_name,f:q1.quality_flags,d:q1.discovered_at}):'missing');
  r=await j('/api/magazine/admin/queue/stats');
  check('stats: 0 published, 8 drafts (incl. backfill test)', r.data.published===0 && r.data.drafts===8, JSON.stringify(r.data));
  r=await j('/api/magazine/admin/queue/stats');
  check('stats: last_run_at recorded after discovery', Boolean(r.data.last_run_at), JSON.stringify(r.data.last_run_at));
  // rev10.1: manual «🔄 پردازش مجدد» (coach) on a parked legacy draft
  {
    const ddb3=new DatabaseSync(path.join(dataDir,'yasnafit.db'));
    const leg3GnewsUrl='https://news.google.com/rss/articles/'+gnewsId('http://127.0.0.1:'+feedPort+'/legacy3.html');
    const legacyId=ddb3.prepare("INSERT INTO magazine_articles (stable_id, slug, title, summary, content, status, content_origin, source_name, source_url, created_at, updated_at) VALUES (?,?,?,?,?,?, 'generated', 'Google News', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run('legacy-stable-rp','legacy-rp','مطلب تست بازپردازش دستی با منبع گوگل‌نیوز','خلاصه','<p>متن فارسی برای تست بازپردازش دستی از دکمهٔ «پردازش مجدد»؛ طول کافی برای اعتبارسنجی دارد.</p>'.repeat(3),'DRAFT',leg3GnewsUrl).lastInsertRowid;
    ddb3.prepare("INSERT INTO magazine_discoveries (stable_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, publisher, status, article_id, ai_meta) VALUES (?,?,?,?,?,?,?,?,?, 'DRAFTED', ?, ?)").run('leg-rp',leg3GnewsUrl,'h-leg-rp','fp-leg-rp','مطلب تست بازپردازش دستی با منبع گوگل‌نیوز','2026-09-21 09:00:00','sports-science','legacy','Google News',legacyId,JSON.stringify({needs_reprocess:true}));
    ddb3.close();
    const anRp=await fetch(BASE+'/api/magazine/admin/queue/'+legacyId+'/reprocess',{method:'POST',body:'{}'});
    check('rev10.1: reprocess endpoint anonymous → 401', anRp.status===401, 'got '+anRp.status);
    r=await j(`/api/magazine/admin/queue/${legacyId}/reprocess`,{method:'POST',body:'{}'});
    check('rev10.1: coach «پردازش مجدد» succeeds (source resolved + AI rerun)', r.status===200 && r.data.reprocessed===true, JSON.stringify(r.data));
    const rpArt=await j('/api/magazine/admin/articles/'+legacyId);
    check('rev10.1: reprocessed article keeps FA + original publisher source (never Google News)', String(rpArt.data.source_url).startsWith('http://127.0.0.1:'+feedPort+'/legacy3.html') && String(rpArt.data.source_name).includes('میراث') && /\p{Script=Arabic}/u.test(rpArt.data.title) && rpArt.data.status==='DRAFT', JSON.stringify({u:rpArt.data.source_url,t:String(rpArt.data.title).slice(0,40),n:rpArt.data.source_name}));
    const rpQ=await j('/api/magazine/admin/queue');
    const rpRow=rpQ.data.queue.find(q=>q.id===legacyId);
    check('rev10.1: reprocessed row back in ready queue (no audit flags)', rpRow && rpRow.audit_reasons.length===0, JSON.stringify(rpRow&&rpRow.audit_reasons));
  }

  // review detail
  r=await j(`/api/magazine/admin/queue/${q1.id}`);
  check('review detail: discovery + references + history', r.data.discovery && r.data.discovery.original_title && r.data.references.length>=1 && Array.isArray(r.data.history), JSON.stringify({d:!!r.data.discovery,refs:r.data.references.length}));

  // drafts are DRAFT + generated + source set; not public
  const art1=(await j(`/api/magazine/admin/articles/${q1.id}`)).data;
  check('draft article DRAFT + imported (no AI) + source_url', art1 && art1.status==='DRAFT' && art1.content_origin==='imported' && !!art1.source_url, art1?art1.status+'/'+art1.content_origin:'missing');
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
  check('rev11: published body = feed summary + «مطالعهٔ کامل مطلب در منبع اصلی» (no AI text)', artText.includes('یک مطالعهٔ جدید نشان می‌دهد تمرینات مقاومتی اثر مثبت بر سلامت است') && artText.includes('مطالعهٔ کامل مطلب در منبع اصلی'), 'summary/link missing from public page');
  // rev11: the extracted article image is the published hero image
  {
    const qNow=await j('/api/magazine/admin/queue');
    const imgDraft=qNow.data.queue.find(q=>q.source_url===STORY2_URL);
    if (imgDraft) {
      await j(`/api/magazine/admin/articles/${imgDraft.id}/publish`,{method:'POST',body:'{}'});
      const hp=await fetch(BASE+'/magazine/'+imgDraft.slug);
      const htext=await hp.text();
      check('rev11: published article hero = extracted og image + original source link', hp.status===200 && htext.includes('/img-2.jpg') && htext.includes('story2.html'), 'status='+hp.status+' hero='+(htext.includes('/img-2.jpg')?'ok':'NO')+' src='+(htext.includes('story2.html')?'ok':'NO'));
    } else { check('rev11: published article hero = extracted og image (draft found)', false, 'story2 draft missing'); }
  }
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
  check('discover#2: 0 new drafts, 9 duplicates (+5 re-filtered: 4 freshness + 1 low-quality)', r.data.drafted===0 && r.data.duplicates===9 && r.data.filtered===5, JSON.stringify(r.data));

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
  check('UI: search-more button + in-place progress (no full re-render per tick) + batch cap flag', ui.includes('magSearchMore') && ui.includes('جستجو بیشتر') && ui.includes('mag-progress-host') && ui.includes('stopped_at_cap'));
  check('UI: old «در انتظار پیاده‌سازی» note removed', !ui.includes('در انتظار پیاده‌سازی موتور دریافت منابع'));
  check('UI: card empty-image says «تصویر برای این مطلب پیدا نشد» + «انتخاب تصویر»', ui.includes('تصویر برای این مطلب پیدا نشد') && ui.includes('انتخاب تصویر'));
  check('UI: run toasts distinguish found-this-scan vs ready queue + «نیازمند پردازش مجدد»', ui.includes('در این بررسی') && ui.includes('مطلب جدید پیدا شد') && ui.includes('مطلب برای بررسی آماده است') && ui.includes('نیازمند پردازش مجدد'));
  check('UI: internal AI confidence/provider errors removed from review detail', !ui.includes('اعتماد پردازش') && !ui.includes('ai.ai_failed'));
  check('UI: queue count wording (ready for review, not «AI found N»)', ui.includes('مطلب برای بررسی آماده است') && !ui.includes('مطلب جدید پیدا کرده است'));
  check('rev11 UI: evergreen badge removed (aged items are filtered, not badged)', !ui.includes('mag-news-cat--evergreen'));

  // ---- scheduler (in-process, same db as the server's data dir) ----
  const dbS=new DatabaseSync(path.join(dataDir,'yasnafit.db'));
  const offResult=await discovery.tickScheduledDiscovery(dbS,{'magazine.auto_fetch':'0','magazine.fetch_interval':'12'});
  check('scheduler: auto_fetch off → no run', offResult===null);
  // enable auto fetch + very short effective interval via lastAutoRunAt=0
  discovery.stopDiscoveryScheduler();
  dbS.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.auto_fetch','1')").run();
  dbS.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.fetch_interval','6')").run();
  const onResult=await discovery.tickScheduledDiscovery(dbS,{'magazine.auto_fetch':'1','magazine.fetch_interval':'6'});
  check('scheduler: auto_fetch on → discovery ran (all dups now)', onResult && onResult.drafted===0 && onResult.duplicates===9 && onResult.filtered===5, JSON.stringify(onResult||null));
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
