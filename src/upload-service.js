const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_MIME = ['image/jpeg','image/png','image/webp','image/jpg'];
const ALLOWED_EXT = ['.jpg','.jpeg','.png','.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_ASSESSMENT = 10;

function genUUID(){
  if(crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function sanitizeFileName(name){
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g,'_').substring(0,100);
}

function getAssessmentDir(studentId, assessmentId){
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'data', 'assessments', String(studentId), String(assessmentId));
  fs.mkdirSync(dir, {recursive:true});
  return dir;
}

function validateFile(file){
  const errors=[];

  if(!file) { errors.push('فایل نامعتبر'); return errors; }

  // Size
  if(file.size > MAX_FILE_SIZE) errors.push(`حجم فایل زیاد است: ${file.size} > ${MAX_FILE_SIZE} - حداکثر 5MB`);
  if(file.size === 0) errors.push('فایل خالی است');

  // MIME
  if(!ALLOWED_MIME.includes(file.mimeType)){
    errors.push(`نوع فایل نامعتبر: ${file.mimeType} - فقط JPEG, PNG, WEBP مجاز است`);
  }

  // Extension
  const ext = path.extname(file.originalFilename||'').toLowerCase();
  if(!ALLOWED_EXT.includes(ext)){
    errors.push(`پسوند نامعتبر: ${ext}`);
  }

  // Filename security
  const name = file.originalFilename||'';
  if(name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')){
    errors.push('نام فایل نامعتبر - path traversal');
  }

  // Check for executable
  if(name.match(/\.(exe|bat|sh|php|js|html|svg)$/i)){
    errors.push('فایل اجرایی مجاز نیست');
  }

  return errors;
}

// Simple multipart parser without external deps
function parseMultipart(req, boundary){
  return new Promise((resolve,reject)=>{
    let raw = Buffer.alloc(0);
    let size=0;
    req.on('data',chunk=>{
      size += chunk.length;
      if(size > 20 * 1024 * 1024){ // 20MB total limit
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      raw = Buffer.concat([raw, chunk]);
    });
    req.on('end',()=>{
      try {
        const result = parseMultipartBuffer(raw, boundary);
        resolve(result);
      } catch(e){
        reject(e);
      }
    });
    req.on('error',reject);
  });
}

function parseMultipartBuffer(buffer, boundary){
  const boundaryStr = '--' + boundary;
  const parts = [];
  const rawStr = buffer.toString('binary');
  const split = rawStr.split(boundaryStr);

  for(let partStr of split){
    if(!partStr || partStr.trim()==='' || partStr.trim()==='--') continue;
    // Each part has headers and body separated by \r\n\r\n
    const headerEnd = partStr.indexOf('\r\n\r\n');
    if(headerEnd===-1) continue;
    const headersRaw = partStr.substring(0, headerEnd);
    let body = partStr.substring(headerEnd+4);

    // Remove trailing \r\n
    if(body.endsWith('\r\n')) body = body.substring(0, body.length-2);

    const headers = {};
    headersRaw.split('\r\n').forEach(line=>{
      const idx=line.indexOf(':');
      if(idx>-1){
        const key=line.substring(0,idx).trim().toLowerCase();
        const val=line.substring(idx+1).trim();
        headers[key]=val;
      }
    });

    const disposition = headers['content-disposition']||'';
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : null;
    const filename = filenameMatch ? filenameMatch[1] : null;

    if(filename){
      // File
      const contentType = headers['content-type']||'application/octet-stream';
      const bodyBuffer = Buffer.from(body, 'binary');
      parts.push({
        type: 'file',
        name,
        originalFilename: filename,
        mimeType: contentType,
        size: bodyBuffer.length,
        data: bodyBuffer
      });
    } else {
      // Field
      parts.push({
        type: 'field',
        name,
        value: body
      });
    }
  }

  return parts;
}

function saveAssessmentPhoto(db, studentId, assessmentId, file, photoType='front'){
  const errors = validateFile(file);
  if(errors.length) {
    const err = new Error(errors[0]);
    err.validationErrors = errors;
    err.statusCode = 400;
    throw err;
  }

  // Check count limit
  const count = db.prepare('SELECT COUNT(*) as c FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL').get(assessmentId).c;
  if(count >= MAX_FILES_PER_ASSESSMENT){
    throw new Error(`حداکثر ${MAX_FILES_PER_ASSESSMENT} عکس مجاز است`);
  }

  const dir = getAssessmentDir(studentId, assessmentId);
  const ext = path.extname(file.originalFilename||'.jpg').toLowerCase() || '.jpg';
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.jpg';
  const stableId = genUUID();
  const storedFileName = `${stableId}_${sanitizeFileName(photoType)}${safeExt}`;
  const storagePath = path.join(dir, storedFileName);

  // Ensure safe path
  const resolvedBase = path.resolve(dir);
  const resolvedTarget = path.resolve(storagePath);
  if(!resolvedTarget.startsWith(resolvedBase)){
    throw new Error('Invalid storage path');
  }

  fs.writeFileSync(storagePath, file.data);

  const res = db.prepare(`
    INSERT INTO assessment_photos (stable_id, assessment_id, student_id, photo_type, storage_path, original_filename, mime_type, size_bytes, version)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(stableId, assessmentId, studentId, photoType, storagePath, file.originalFilename, file.mimeType, file.size, 1);

  return {
    id: res.lastInsertRowid,
    stable_id: stableId,
    storage_path: storagePath,
    photo_type: photoType,
    original_filename: file.originalFilename,
    mime_type: file.mimeType,
    size_bytes: file.size
  };
}

function getPhotoFilePath(db, photoId){
  const photo = db.prepare('SELECT * FROM assessment_photos WHERE id=? AND deleted_at IS NULL').get(photoId);
  if(!photo) return null;
  if(!fs.existsSync(photo.storage_path)) return null;
  return photo;
}

function deletePhoto(db, photoId){
  const photo = db.prepare('SELECT * FROM assessment_photos WHERE id=? AND deleted_at IS NULL').get(photoId);
  if(!photo) return false;
  // Soft delete
  db.prepare('UPDATE assessment_photos SET deleted_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?').run(photoId);
  // Optionally delete file? Keep file for audit, but mark deleted
  return true;
}

module.exports = {
  ALLOWED_MIME,
  ALLOWED_EXT,
  MAX_FILE_SIZE,
  parseMultipart,
  parseMultipartBuffer,
  saveAssessmentPhoto,
  getPhotoFilePath,
  deletePhoto,
  getAssessmentDir,
  validateFile,
  genUUID,
  sanitizeFileName
};
