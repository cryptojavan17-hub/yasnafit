'use strict';
// Where the app keeps everything that must survive a restart: the SQLite file, private
// body photos and documents, smtp.json, the coach TOTP key and database backups.
//
// Container platforms (Railway) give a service exactly ONE persistent volume and tell the
// app where it is through RAILWAY_VOLUME_MOUNT_PATH, so that directory becomes the data
// root when present. YASNAFIT_DATA_DIR / YASNAFIT_BACKUP_DIR always win, and the fallback
// is the repository layout used on desktops.
//
// Exercise images are public teaching material but far too large for git, so they follow
// the same rule: YASNAFIT_MEDIA_DIR wins, otherwise <dataDir>/media (which is the volume
// on a container and <repo>/data/media locally). Videos stay repo-side by owner decision.
//
// Note: private file rows store absolute paths, so the mount path of a volume that already
// holds data must never be changed afterwards.
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
function resolveDir(value,fallback,label){
  const raw=String(value||'').trim();
  if(!raw)return fallback;
  const resolved=path.resolve(raw);
  if(resolved===path.parse(resolved).root)throw new Error(`${label} points at the filesystem root`);
  return resolved;
}

// Railway exports this automatically for a service with an attached volume.
const volumeMount=String(process.env.RAILWAY_VOLUME_MOUNT_PATH||'').trim();
const dataDir=resolveDir(process.env.YASNAFIT_DATA_DIR||(volumeMount?path.resolve(volumeMount):''),path.join(root,'data'),'YASNAFIT_DATA_DIR');
// A volume is one directory: on a platform that only persists that path, backups belong inside it.
const defaultBackupDir=volumeMount&&!process.env.YASNAFIT_BACKUP_DIR?path.join(dataDir,'backups'):path.join(root,'backups');
const backupDir=resolveDir(process.env.YASNAFIT_BACKUP_DIR,defaultBackupDir,'YASNAFIT_BACKUP_DIR');

const assessmentsDir=path.join(dataDir,'assessments');
const documentsDir=path.join(dataDir,'assessment-documents');
// Bulk media (exercise images) lives beside the database so a container volume carries it.
const mediaDir=resolveDir(process.env.YASNAFIT_MEDIA_DIR,path.join(dataDir,'media'),'YASNAFIT_MEDIA_DIR');
const exerciseImagesDir=path.join(mediaDir,'images','exercises','imported');

function ensurePrivateDir(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  // The directory holds student photos; the default umask is not acceptable on a shared host.
  try{fs.chmodSync(dir,0o700);}catch(error){/* Windows has no POSIX bits */}
  return dir;
}

function ensureMediaDirs(){
  // ensurePrivateDir already applies mode 0o700; levels are created one by one so every
  // intermediate directory gets the private mode too.
  for(const dir of [mediaDir,path.join(mediaDir,'images'),path.join(mediaDir,'images','exercises'),exerciseImagesDir]){
    ensurePrivateDir(dir);
  }
  return {mediaDir,exerciseImagesDir};
}

module.exports={root,dataDir,backupDir,assessmentsDir,documentsDir,mediaDir,exerciseImagesDir,ensurePrivateDir,ensureMediaDirs};
