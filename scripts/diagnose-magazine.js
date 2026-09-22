#!/usr/bin/env node
'use strict';
// Real configured feeds only: no fixtures, no source substitutions, no AI.
// Without --run-unfiltered this only exports existing local evidence.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const discovery = require('../src/magazine-discovery-service');
const args = process.argv.slice(2);
if (args.some(a => !['--run-unfiltered'].includes(a))) {
  console.error('Usage: node scripts/diagnose-magazine.js [--run-unfiltered]');
  process.exit(2);
}
const dataDir = process.env.YASNAFIT_DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'yasnafit.db');
if (!fs.existsSync(dbPath)) { console.error('Database not found: ' + dbPath); process.exit(2); }
(async () => {
  const run = args.includes('--run-unfiltered');
  const db = new DatabaseSync(dbPath, { readOnly: !run });
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    if (run) await discovery.runDiscovery(db, { diagnosticUnfiltered: true });
    const report = discovery.discoveryDiagnostics(db);
    report.environment = { generated_at: new Date().toISOString(), network: 'Node fetch on this machine; no mocked responses' };
    const output = path.join(dataDir, 'magazine-diagnostics.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.error('Report written: ' + output);
    // Export success is NOT evidence that real articles reached the queue.
  } finally { db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
