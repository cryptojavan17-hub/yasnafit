#!/usr/bin/env node
'use strict';
// Static lock for the Windows deploy kit. PowerShell is not executed here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kit = path.join(root, 'deploy', 'windows');
const ps1Path = path.join(kit, 'Deploy-Yasnafit.ps1');
const cmdPath = path.join(kit, 'deploy.cmd');
const examplePath = path.join(kit, 'yasnafit.env.example');
const readmePath = path.join(kit, 'README-WINDOWS.md');

const ps1Bytes = fs.readFileSync(ps1Path);
const cmdBytes = fs.readFileSync(cmdPath);
assert.equal(ps1Bytes[0], 0xef);
assert.equal(ps1Bytes[1], 0xbb);
assert.equal(ps1Bytes[2], 0xbf, 'Deploy-Yasnafit.ps1 must be UTF-8 with BOM for Windows PowerShell 5.1');
assert.ok(!ps1Bytes.includes(Buffer.from('\n')) || ps1Bytes.includes(Buffer.from('\r\n')), 'ps1 must use CRLF');
assert.ok(!ps1Bytes.toString('latin1').replace(/\r\n/g, '').includes('\n'), 'ps1 must not contain bare LF');
assert.ok(cmdBytes.includes(Buffer.from('\r\n')), 'deploy.cmd must be CRLF');
assert.ok(!cmdBytes.toString('latin1').replace(/\r\n/g, '').includes('\n'), 'deploy.cmd must not contain bare LF');
assert.ok(!cmdBytes.includes(0), 'deploy.cmd must stay ASCII');

const cmd = cmdBytes.toString('ascii');
const powershellLine = 'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-Yasnafit.ps1" %*';
assert.ok(cmd.includes(powershellLine), 'deploy.cmd must keep the fixed powershell line');
assert.ok(cmd.includes('pause'), 'deploy.cmd must pause');
assert.ok(cmd.includes('if not "%RC%"=="0" goto hold'), 'deploy.cmd must pause on error');
assert.ok(cmd.includes('if "%~1"=="" goto hold'), 'deploy.cmd must pause when launched with no arguments');

const ps1 = ps1Bytes.toString('utf8').replace(/^\uFEFF/, '');
const required = [
  "[ValidateSet('deploy', 'update', 'start', 'stop', 'restart', 'status', 'logs', 'backup')]",
  "[string]$Action = 'deploy'",
  "[string]$Repo = 'https://github.com/cryptojavan17-hub/yasnafit.git'",
  "[string]$Branch = 'main'",
  '[int]$Port = 3020',
  '[switch]$NoBrowser',
  '[switch]$Force',
  'Get-NetTCPConnection -LocalPort $ListenPort -State Listen',
  'netstat.exe -ano',
  'yasnafit.env',
  'yasnafit.env.example',
  "Contains('TOKEN')",
  "Contains('SECRET')",
  "Contains('PASS')",
  'yyyyMMdd-HHmmss',
  "'deploy-{0}.db'",
  "'^deploy-\\d{8}-\\d{6}\\.db$'",
  "'fetch', '--prune', 'origin'",
  "'pull', '--ff-only', 'origin'",
  "'reset', '--hard'",
  "'log', '--oneline'",
  '/c node server.js >> logs\\server.log 2>&1',
  '-WindowStyle Hidden',
  '/api/health',
  'AddSeconds(120)',
  '-Count 40',
  'Yasnafit is running',
  '[Migrations]',
  '-cmatch',
  'Database schema version:',
  'Build stamp:',
  '[Telegram]',
  'data\\yasnafit.db',
  "$ErrorActionPreference = 'Continue'",
  '$LASTEXITCODE',
  'function Get-LastNonEmpty',
  "Join-Path $Script:KitDir '..\\..'",
  'server.js',
  '.git',
  'git clean اجرا نمی‌شود',
  'winget install --id Git.Git -e --source winget',
  'winget install --id OpenJS.NodeJS -e --source winget',
  'Node.js 22.5'
];
for (const needle of required) {
  assert.ok(ps1.includes(needle), 'kit script missing: ' + needle);
}
assert.ok(!/(?:^|[^A-Za-z0-9_])\$pid\b/i.test(ps1), 'the automatic process-id variable must not be used as a name');
assert.ok(!ps1.includes('&&'), 'PowerShell 7 pipeline chain is not allowed');
assert.ok(!ps1.includes('??'), 'PowerShell 7 null-coalescing is not allowed');
assert.ok(!/\?[ \t]+\S[\s\S]{0,80}[ \t]:[ \t]/.test(ps1), 'PowerShell 7 ternary is not allowed');
assert.ok(!/ArgumentList\s+@\([^)]*'clean'/.test(ps1), 'git clean must not be invoked');
assert.ok(!ps1.includes("git' , 'clean") && !ps1.includes("'clean',"), 'git clean must not be an argument');
assert.equal((ps1.match(/2>&1/g) || []).length >= 2, true, 'native stderr must be merged inside the Continue helper and the netstat fallback');

// Brace balance outside strings and comments, so a truncated script fails here.
let depth = 0;
let quote = '';
let i = 0;
while (i < ps1.length) {
  const ch = ps1[i];
  const next = ps1[i + 1];
  if (quote) {
    if (ch === '`' && quote === '"') { i += 2; continue; }
    if (ch === quote) quote = '';
    i += 1;
    continue;
  }
  if (ch === '#' ) {
    const nl = ps1.indexOf('\n', i);
    i = nl < 0 ? ps1.length : nl + 1;
    continue;
  }
  if (ch === "'" || ch === '"') { quote = ch; i += 1; continue; }
  if (ch === '{') depth += 1;
  else if (ch === '}') {
    depth -= 1;
    assert.ok(depth >= 0, 'unbalanced closing brace in Deploy-Yasnafit.ps1');
  }
  i += 1;
}
assert.equal(depth, 0, 'unbalanced braces in Deploy-Yasnafit.ps1');

const example = fs.readFileSync(examplePath, 'utf8');
assert.match(example, /^TELEGRAM_BOT_TOKEN=\s*$/m, 'example must not contain a bot token value');
assert.match(example, /^TELEGRAM_WEBHOOK_SECRET=\s*$/m, 'example must not contain a webhook secret');
assert.match(example, /^PORT=3020\s*$/m, 'example may publish the non-secret default port');
assert.ok(!/TOKEN=.+\S/.test(example), 'no token value in the example');
assert.ok(!/SECRET=.+\S/.test(example), 'no secret value in the example');
assert.ok(!/PASS=.+\S/.test(example), 'no password value in the example');

const readme = fs.readFileSync(readmePath, 'utf8');
assert.ok(readme.includes(powershellLine), 'README must show the same powershell line');
assert.ok(readme.includes('دابل‌کلیک'), 'README must document double-click');
assert.ok(readme.includes('خط فرمان'), 'README must document cmd');
assert.ok(readme.includes('خودِ PowerShell'), 'README must document direct PowerShell');
assert.ok(readme.includes('اجرا نشده'), 'README must not claim the script was executed in the sandbox');

const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.ok(ignore.includes('deploy/windows/yasnafit.env'), 'local env file must be gitignored');
assert.ok(ignore.includes('deploy/windows/app/'), 'cloned app next to the kit must be gitignored');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.scripts['test:windows-kit'], 'node tests/windows-deploy-kit-regression.js');
assert.ok(pkg.scripts.test.includes('npm run test:windows-kit'), 'the kit guard must be in npm test');

console.log(JSON.stringify({
  ok: true,
  powershell_executed: false,
  bom: true,
  crlf: true,
  actions: ['deploy', 'update', 'start', 'stop', 'restart', 'status', 'logs', 'backup']
}));
