'use strict';

// package.json is the single source of truth for the application release version.
// Database schema versions and Program Builder document versions are separate concepts.
const manifest = require('../package.json');

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CHANGE_CATEGORIES = ['features','improvements','fixes','security','breaking_changes'];

if(!SEMVER_PATTERN.test(manifest.version)) {
  throw new Error(`Invalid application SemVer in package.json: ${manifest.version}`);
}

function getApplicationInfo(){
  return {
    version: manifest.version,
    name: manifest.displayName || manifest.name,
    environment: process.env.NODE_ENV || 'development'
  };
}

function normalizeChanges(raw){
  let parsed={};
  try { parsed=typeof raw==='string' ? JSON.parse(raw) : (raw || {}); } catch(e){ parsed={}; }
  return Object.fromEntries(CHANGE_CATEGORIES.map(category=>[
    category,
    Array.isArray(parsed[category]) ? parsed[category].filter(item=>typeof item==='string') : []
  ]));
}

function mapRelease(row){
  if(!row) return null;
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    release_date: row.release_date,
    summary: row.summary || '',
    changes: normalizeChanges(row.changes_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_current: row.version === manifest.version
  };
}

function listReleases(db){
  return db.prepare(`
    SELECT id, version, title, release_date, summary, changes_json, created_at, updated_at
    FROM releases
    ORDER BY release_date DESC, id DESC
  `).all().map(mapRelease);
}

function getRelease(db, version){
  if(!SEMVER_PATTERN.test(String(version||''))) return null;
  return mapRelease(db.prepare(`
    SELECT id, version, title, release_date, summary, changes_json, created_at, updated_at
    FROM releases WHERE version=?
  `).get(version));
}

module.exports = {
  SEMVER_PATTERN,
  CHANGE_CATEGORIES,
  getApplicationInfo,
  listReleases,
  getRelease
};
