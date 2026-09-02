'use strict';
const crypto=require('crypto');
const {qrSvg}=require('./qr-svg');

const BASE32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD=30;
const DIGITS=6;
const ISSUER='Yasnafit';

function generateSecret(bytes=20){
  return base32Encode(crypto.randomBytes(bytes));
}
function base32Encode(buffer){
  const bytes=Buffer.from(buffer);
  let bits='';
  for(const value of bytes) bits+=value.toString(2).padStart(8,'0');
  let out='';
  for(let index=0;index+5<=bits.length;index+=5){
    out+=BASE32[parseInt(bits.slice(index,index+5),2)];
  }
  return out;
}
function base32Decode(secret){
  const clean=String(secret||'').toUpperCase().replace(/[^A-Z2-7]/g,'');
  let bits='';
  for(const char of clean){
    const value=BASE32.indexOf(char);
    if(value<0) continue;
    bits+=value.toString(2).padStart(5,'0');
  }
  const bytes=[];
  for(let index=0;index+8<=bits.length;index+=8) bytes.push(parseInt(bits.slice(index,index+8),2));
  return Buffer.from(bytes);
}
function hotp(secretBuf,counter,digits=DIGITS){
  const message=Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter/0x100000000),0);
  message.writeUInt32BE(counter>>>0,4);
  const hmac=crypto.createHmac('sha1',secretBuf).update(message).digest();
  const offset=hmac[hmac.length-1]&0x0f;
  const binary=((hmac[offset]&0x7f)<<24)|((hmac[offset+1]&0xff)<<16)|((hmac[offset+2]&0xff)<<8)|(hmac[offset+3]&0xff);
  return String(binary%(10**digits)).padStart(digits,'0');
}
function counterAt(now=Date.now(),period=PERIOD){
  return Math.floor(Number(now)/1000/period);
}
function generate(secret,{now=Date.now(),period=PERIOD,digits=DIGITS}={}){
  return hotp(base32Decode(secret),counterAt(now,period),digits);
}
function verify(secret,code,{now=Date.now(),period=PERIOD,digits=DIGITS,window=1,lastCounter=null}={}){
  const normalized=String(code||'').replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'');
  if(!new RegExp(`^\\d{${digits}}$`).test(normalized)) return {ok:false};
  const secretBuf=base32Decode(secret);
  if(!secretBuf.length) return {ok:false};
  const current=counterAt(now,period);
  const expectedBuf=Buffer.from(normalized);
  for(let delta=-window;delta<=window;delta++){
    const counter=current+delta;
    if(lastCounter!=null && Number.isFinite(Number(lastCounter)) && counter<=Number(lastCounter)) continue;
    const candidate=Buffer.from(hotp(secretBuf,counter,digits));
    if(candidate.length===expectedBuf.length && crypto.timingSafeEqual(candidate,expectedBuf)){
      return {ok:true,counter};
    }
  }
  return {ok:false};
}
function otpauthUrl({secret,email,issuer=ISSUER}){
  const label=encodeURIComponent(`${issuer}:${email}`);
  const query=new URLSearchParams({
    secret:String(secret||'').replace(/\s+/g,''),
    issuer,
    algorithm:'SHA1',
    digits:String(DIGITS),
    period:String(PERIOD)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
function displaySecret(secret){
  return String(secret||'').replace(/(.{4})/g,'$1 ').trim();
}
function enrollment({secret,email,issuer=ISSUER}){
  const url=otpauthUrl({secret,email,issuer});
  return {
    secret,
    secret_display:displaySecret(secret),
    otpauth_url:url,
    qr_svg:qrSvg(url),
    period:PERIOD,
    digits:DIGITS,
    email
  };
}

module.exports={
  PERIOD,DIGITS,ISSUER,
  generateSecret,base32Encode,base32Decode,hotp,generate,verify,
  otpauthUrl,displaySecret,enrollment,qrSvg
};
