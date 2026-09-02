#!/usr/bin/env node
'use strict';
// Deployment hardening guard. It answers two questions before the app is put on a
// public server: (1) does every response carry the hardening headers and is the
// proxy-trust / information-disclosure behaviour intact, and (2) did the deleted
// dead files stay deleted with no dangling references.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const requestSecurity=require('../src/request-security');

const root=path.resolve(__dirname,'..');
const read=relative=>{try{return fs.readFileSync(path.join(root,relative),'utf8');}catch(error){return null;}};
const exists=relative=>fs.existsSync(path.join(root,relative));

const serverSource=read('server.js');
const indexHtml=read('public/index.html');
const deploymentDoc=read('DEPLOYMENT.md');
assert.ok(serverSource,'server.js is missing');
assert.ok(indexHtml,'public/index.html is missing');
assert.ok(deploymentDoc,'DEPLOYMENT.md must document how the app is exposed on a server');

// --- 1. dead files stay deleted -----------------------------------------------------
const deleted=[
  'login-hero.png',                       // duplicate of public/login-hero.png
  'public/assets/hero-login.jpg',         // duplicate of public/images/auth-hero.jpg
  'public/yasnafit-students-dashboard-mockup.png',
  'public/student-portal.js',             // superseded by public/student-app.js
  'public/student-portal.css',
  'tool/test-movement-modal-interactive.js',
  'راهنمای_اجرا.md'                       // replaced by README.md + DEPLOYMENT.md
];
for(const file of deleted)assert.ok(!exists(file),`${file} came back but nothing uses it`);

const scanned=[];
const self=path.join(__dirname,path.basename(__filename));
(function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','data','backups','logs','docs','.venv'].includes(entry.name))continue;
    if(path.join(dir,entry.name)===self)continue;                    // this guard lists the dead paths
    if(entry.name==='mahdi hellp.md')continue;   // the session memory file documents what was deleted
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(/\.(js|json|css|html|md|bat|yml|yaml)$/.test(entry.name))scanned.push(full);
  }
})(root);
for(const file of scanned){
  const text=fs.readFileSync(file,'utf8');
  for(const dead of deleted){
    const name=path.basename(dead);
    if(name==='login-hero.png')continue;                    // the live copy keeps this name
    const referenced=new RegExp(`[\"'/( ]${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`);
    assert.ok(!referenced.test(text),`${path.relative(root,file)} still references deleted ${dead}`);
  }
}

// The login hero artwork must stay wired, otherwise the deleted duplicate breaks the page.
assert.ok(exists('public/login-hero.png'),'public/login-hero.png (the live hero image) is missing');
assert.match(read('public/student-app.js'),/\/login-hero\.png/,'the student login screen no longer loads the hero image');
assert.match(read('public/luxury-login.css'),/login-hero\.png/,'the login stylesheet lost the hero image');

// --- 2. no inline scripts anywhere in the client shell ------------------------------
for(const file of fs.readdirSync(path.join(root,'public')).filter(name=>name.endsWith('.html'))){
  const html=read(`public/${file}`)||'';
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html),`public/${file} still ships an inline script (breaks script-src 'self')`);
  assert.doesNotMatch(html,/\son(click|change|input|submit|load|error)\s*=\s*"/i,`public/${file} uses an inline event handler`);
}
assert.match(indexHtml,/src="\/boot\.js"/,'the post-load deep-link redispatch must live in /boot.js');
// every asset the coach shell asks for must exist, otherwise a CSP that forbids CDNs
// turns a deleted file into a blank page
const ASSET_PATTERN=/(?:src|href)="\/([^"?]+\.(?:js|css|png|jpe?g|svg|ico|webp|gif|woff2?|json))"/g;
for(const [,asset] of indexHtml.matchAll(ASSET_PATTERN)){
  assert.ok(exists(path.join('public',asset)),`public/index.html loads /${asset}, which is not on disk`);
}
assert.doesNotMatch(indexHtml,/student-portal\.css/,'the deleted stylesheet is still linked');

// --- 3. hardening headers -----------------------------------------------------------
const headers=requestSecurity.securityHeaders();
assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/,'CSP must refuse framing');
assert.match(headers['Content-Security-Policy'],/script-src 'self'/,'CSP must not allow inline scripts');
assert.doesNotMatch(headers['Content-Security-Policy'],/script-src[^;]*unsafe/,'CSP must not allow inline or eval scripts');
assert.match(headers['Content-Security-Policy'],/object-src 'none'/,'CSP must disable plugins');
assert.equal(headers['X-Content-Type-Options'],'nosniff');
assert.equal(headers['X-Frame-Options'],'DENY');
assert.equal(headers['Referrer-Policy'],'no-referrer');
assert.match(serverSource,/requestSecurity\.applySecurityHeaders\(res\)/,'responses are not carrying the shared security headers');
assert.match(serverSource,/requestSecurity\.securityHeaders\(\)/,'JSON responses are not carrying the shared security headers');

// --- 4. proxy headers are only trusted when the operator says so -------------------
for(const file of ['server.js','src/database.js','src/coach-auth-service.js','src/student-session-service.js']){
  const text=read(file)||'';
  assert.doesNotMatch(text,/x-forwarded-(?:for|host|proto)/i,`${file} reads forwarding headers directly`);
}
const unit=`
const rs=require('./src/request-security');
const forged={headers:{host:'app.example','x-forwarded-host':'evil.example','x-forwarded-for':'8.8.8.8','x-forwarded-proto':'https',origin:'https://evil.example'},socket:{remoteAddress:'10.0.0.5'}};
const honest={headers:{host:'app.example',origin:'https://app.example'},socket:{remoteAddress:'10.0.0.5'}};
console.log(JSON.stringify({
  host:rs.requestHost(forged),
  ip:rs.clientIp(forged),
  https:rs.isHttps(forged),
  origin:rs.sameOrigin(forged),
  honestOrigin:rs.sameOrigin(honest),
  malformedOrigin:rs.sameOrigin({headers:{host:'app.example',origin:'not a url'},socket:{}})
}));`;
const untrusted=JSON.parse(execFileSync(process.execPath,['-e',unit],{cwd:root,encoding:'utf8'}));
assert.equal(untrusted.host,'app.example','an untrusted proxy must not be able to rewrite the host');
assert.equal(untrusted.ip,'10.0.0.5','rate limiting must key on the socket address without a proxy');
assert.equal(untrusted.https,false,'X-Forwarded-Proto must not mark cookies Secure without a declared proxy');
assert.equal(untrusted.origin,false,'a forged X-Forwarded-Host must not make a cross-site Origin look same-origin');
assert.equal(untrusted.honestOrigin,true,'a normal same-origin request must stay allowed (no cookie means no Origin header either)');
assert.equal(untrusted.malformedOrigin,false,'an unparseable Origin must be rejected');
const trusted=JSON.parse(execFileSync(process.execPath,['-e',unit],{cwd:root,encoding:'utf8',env:{...process.env,YASNAFIT_TRUST_PROXY:'1'}}));
assert.equal(trusted.host,'evil.example','behind a declared proxy the forwarded host must be used');
assert.equal(trusted.ip,'8.8.8.8','behind a declared proxy the real client IP must be used for rate limits');
assert.equal(trusted.https,true,'behind a declared proxy HTTPS must be recognised');
assert.equal(JSON.parse(execFileSync(process.execPath,['-e',unit],{cwd:root,encoding:'utf8',env:{...process.env,YASNAFIT_COOKIE_SECURE:'1'}})).https,true,'YASNAFIT_COOKIE_SECURE=1 must force Secure cookies');

// --- 5. nothing administrative stays public ----------------------------------------
assert.match(serverSource,/if\(requestSecurity\.PRODUCTION\) return sendError\(res,404,'مسیر پیدا نشد'\)/,'/api/test/reset-rate-limit is exposed in production');
assert.match(serverSource,/if\(p==='\/api\/test\/reset-rate-limit' && req\.method==='POST'\)/,'the test rate-limit reset must be gated, not removed');
assert.match(serverSource,/if\(detailed&&!isCoachAuthorized\(req\)\) return sendError\(res,401/,'detailed health statistics are public');
assert.match(serverSource,/\/api\/health'\)\{\s*\n\s*const detailed=/,'GET /api/health must split public liveness from private statistics');
assert.match(serverSource,/\/\/ The build stamp names branches and local file mtimes, so it is coach-only\./,'/api/build leaks the working copy to anonymous callers');
assert.match(serverSource,/if\(requireCoach\(req,res\)\) return true;\s*\n\s*return send\(res,200,buildInfo\.getBuildInfo\(\)\);/,'/api/build must require a coach session');
// The very first run must not be claimable by whoever scans the host first.
assert.match(serverSource,/requestSecurity\.isLoopbackSocket\(req\) && !requestSecurity\.ALLOW_REMOTE_SETUP/,'the one-time coach setup route is reachable from anywhere');
assert.match(read('src/request-security.js'),/YASNAFIT_ALLOW_REMOTE_SETUP/,'the remote setup opt-in must be an explicit environment variable');
assert.ok(!/sendError\(res,\s*(?:400|409|500)\s*,\s*(?:error|e)\.message\s*\)/.test(serverSource),'a raw internal error message is returned to the client');
assert.match(serverSource,/function sendCaughtError\(/,'the error sanitizer is missing');

// --- 6. secret files and bind address ----------------------------------------------
const databaseSource=read('src/database.js')||'';
assert.match(databaseSource,/mkdirSync\(dataDir, \{ recursive: true, mode: 0o700 \}\)/,'the data directory is created world-readable');
assert.match(databaseSource,/mkdirSync\(backupDir, \{ recursive: true, mode: 0o700 \}\)/,'the backup directory is created world-readable');
const coachAuth=read('src/coach-auth-service.js')||'';
assert.match(coachAuth,/fs\.writeFileSync\(smtpFile,[\s\S]{0,240}\{mode:0o600\}\)/,'smtp.json is written with default permissions');
assert.match(coachAuth,/restrictPermissions\(smtpFile,'600'\)/,'an existing smtp.json keeps its open permissions');
assert.match(serverSource,/server\.listen\(port,listenHost/, 'the server must honour YASNAFIT_HOST');
assert.match(serverSource,/const listenHost = String\(process\.env\.YASNAFIT_HOST \|\| process\.env\.HOST \|\| '0\.0\.0\.0'\)/,'the bind address default must stay explicit');
assert.match(databaseSource,/fs\.chmodSync\(dbPath \+ suffix, 0o600\)/,'the SQLite file keeps its inherited permissions');

// A deleted page must not be silently answered by the SPA shell to anonymous visitors.
assert.match(serverSource,/if\(ext === '\.html' && !isCoachAuthorized\(req\)\)\{/,
  'a missing .html URL still hands the coach shell to anonymous callers');

// --- 7. the deployment runbook covers the sharp edges ------------------------------
for(const token of ['YASNAFIT_TRUST_PROXY','YASNAFIT_HOST','YASNAFIT_COOKIE_SECURE','proxy_set_header X-Forwarded-For','systemd','22.5','chmod 700','/api/backup','provision-coach-totp']){
  assert.ok(deploymentDoc.includes(token),`DEPLOYMENT.md does not mention ${token}`);
}
assert.doesNotMatch(deploymentDoc,/YASNAFIT_COACH_TOKEN/,'the removed shared bearer token must not be documented');

// --- 8. Railway deployment config ---------------------------------------------------
const railwayConfig=JSON.parse(read('railway.json')||'{}');
assert.equal(railwayConfig.build&&railwayConfig.build.builder,'NIXPACKS','Railway must build with Nixpacks (no Dockerfile in this repo)');
assert.match(railwayConfig.build.buildCommand,/node --check server\.js/,'the build does not fail fast on a broken server.js');
assert.equal(railwayConfig.deploy.startCommand,'node server.js','Railway must run the plain node server (there is nothing to install)');
assert.equal(railwayConfig.deploy.healthcheckPath,'/api/health','Railway needs an unauthenticated liveness path');
assert.equal(railwayConfig.deploy.numReplicas,1,'a Railway volume is per-service, so replicas would fork the database');
assert.equal(railwayConfig.deploy.restartPolicyType,'ON_FAILURE');
assert.ok(railwayConfig.deploy.restartPolicyMaxRetries<=10,'unbounded restarts hide a crash loop');
assert.ok(Array.isArray(railwayConfig.deploy.watchPatterns)&&railwayConfig.deploy.watchPatterns.includes('server.js'),'every unrelated push must not thrash the build');
// the health endpoint must answer before the coach gate, otherwise every deploy is marked unhealthy
assert.match(serverSource,/if\(p==='\/api\/health'\)\{[\s\S]{0,240}detailed/,
  'GET /api/health must stay routable without a session');
// a container only contains what git contains: the movement seed must be tracked
assert.ok(exists('data-source/exercises_data.json'),'a fresh deploy could not seed the 2707 movements');
// backups must be relocatable into the single mounted volume
assert.match(databaseSource,/process\.env\.YASNAFIT_BACKUP_DIR/,'backups would stay outside the Railway volume');
assert.match(databaseSource,/module\.exports = \{ db, dbPath, dataDir, backupDir,/,'the resolved backup dir is not exported for rotation');
assert.ok(!/path\.join\(__dirname, 'backups'\)/.test(serverSource),'backup rotation still points at the repo folder');
assert.match(serverSource,/const \{ db, dbPath, backup, backupDir, log \} = require\('\.\/src\/database'\);/,'rotation does not use the shared backupDir');
for(const token of ['/app/data','YASNAFIT_BACKUP_DIR','Attach Volume','YASNAFIT_ALLOW_REMOTE_SETUP','Generate Domain','numReplicas']){
  assert.ok(deploymentDoc.includes(token),'DEPLOYMENT.md does not cover the Railway step '+token);
}

console.log(JSON.stringify({
  ok:true,
  dead_files_removed:deleted.length,
  html_files_scanned:fs.readdirSync(path.join(root,'public')).filter(name=>name.endsWith('.html')).length,
  proxy_trust_gated:true,
  admin_endpoints_gated:true,
  secret_file_modes:true,
  runbook:true,
  railway_config:true
}));
