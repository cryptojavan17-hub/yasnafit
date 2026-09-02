#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const obsolete=[
  String.fromCodePoint(0x62f,0x627,0x646,0x634,0x20,0x622,0x645,0x648,0x632),
  String.fromCodePoint(0x62f,0x627,0x646,0x634,0x200c,0x622,0x645,0x648,0x632),
  String.fromCodePoint(0x62f,0x627,0x646,0x634,0x20,0x627,0x645,0x648,0x632)
];
const ignored=new Set(['.git','data','node_modules','backups']);
const hits=[];
function scan(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())scan(target);
    else if(!/\.(?:db|png|jpe?g|webp|ico)$/i.test(entry.name)){
      let text;try{text=fs.readFileSync(target,'utf8')}catch(error){continue}
      if(obsolete.some(word=>text.includes(word)))hits.push(path.relative(root,target));
    }
  }
}
scan(root);
assert.deepEqual(hits,[],`obsolete business terminology found in: ${hits.join(', ')}`);
console.log(JSON.stringify({ok:true,preferred_term:'شاگرد',files_checked:true}));
