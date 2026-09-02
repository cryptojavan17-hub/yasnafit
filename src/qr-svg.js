'use strict';
// QR Code Model 2, byte mode, ECC M, versions 1-10. Enough for otpauth URLs.

const EXP=new Uint8Array(256);
const LOG=new Uint8Array(256);
(function initGalois(){
  let value=1;
  for(let i=0;i<255;i++){
    EXP[i]=value;
    LOG[value]=i;
    value<<=1;
    if(value&0x100) value^=0x11d;
  }
  EXP[255]=EXP[0];
})();
function gfMul(a,b){
  if(!a||!b) return 0;
  return EXP[(LOG[a]+LOG[b])%255];
}
function rsGenerator(degree){
  let poly=[1];
  for(let i=0;i<degree;i++){
    const next=new Array(poly.length+1).fill(0);
    for(let j=0;j<poly.length;j++){
      next[j]^=poly[j];
      next[j+1]^=gfMul(poly[j],EXP[i]);
    }
    poly=next;
  }
  return poly;
}
function rsEncode(data,ecCount){
  const gen=rsGenerator(ecCount);
  const res=new Array(ecCount).fill(0);
  for(const byte of data){
    const factor=byte^res[0];
    res.shift();
    res.push(0);
    if(!factor) continue;
    for(let i=0;i<ecCount;i++) res[i]^=gfMul(gen[i+1],factor);
  }
  return res;
}

// ECC-M block layout: [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data]
const BLOCKS_M=[
  null,
  [10,1,16,0,0],
  [16,1,28,0,0],
  [26,1,44,0,0],
  [18,2,32,0,0],
  [24,2,43,0,0],
  [16,4,27,0,0],
  [18,4,31,0,0],
  [22,2,38,2,39],
  [22,3,36,2,37],
  [26,4,43,1,44]
];
const ALIGN={
  2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
  7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]
};
const FORMAT_MASK=0b101010000010010;
function formatBits(mask){
  const data=(0b00<<3)|mask; // ECC M = 00
  let rem=data<<10;
  const poly=0b10100110111;
  for(let i=14;i>=10;i--){
    if(rem>>>i) rem^=poly<<(i-10);
  }
  return ((data<<10)|rem)^FORMAT_MASK;
}
function versionBits(version){
  let rem=version<<12;
  const poly=0b1111100100101;
  for(let i=17;i>=12;i--){
    if(rem>>>i) rem^=poly<<(i-12);
  }
  return (version<<12)|rem;
}
function capacity(version){
  const spec=BLOCKS_M[version];
  return spec[1]*spec[2]+spec[3]*spec[4];
}
function chooseVersion(byteLength){
  const need=byteLength+3;
  for(let version=1;version<=10;version++){
    if(capacity(version)>=need) return version;
  }
  throw new Error('QR payload is too long');
}
function addBits(bits,value,count){
  for(let i=count-1;i>=0;i--) bits.push((value>>>i)&1);
}
function encodeData(bytes,version){
  const bits=[];
  addBits(bits,0b0100,4);
  addBits(bits,bytes.length,version<10?8:16);
  for(const value of bytes) addBits(bits,value,8);
  const total=capacity(version)*8;
  const remain=Math.min(4,total-bits.length);
  for(let i=0;i<remain;i++) bits.push(0);
  while(bits.length%8) bits.push(0);
  const pad=[0b11101100,0b00010001];
  let padIndex=0;
  while(bits.length<total){
    addBits(bits,pad[padIndex&1],8);
    padIndex++;
  }
  const codewords=[];
  for(let i=0;i<bits.length;i+=8){
    let value=0;
    for(let j=0;j<8;j++) value=(value<<1)|bits[i+j];
    codewords.push(value);
  }
  return codewords;
}
function interleave(version,data){
  const [ecPer,g1,d1,g2,d2]=BLOCKS_M[version];
  const blocks=[];
  let offset=0;
  for(let i=0;i<g1;i++){
    const block=data.slice(offset,offset+d1);
    offset+=d1;
    blocks.push({data:block,ec:rsEncode(block,ecPer)});
  }
  for(let i=0;i<g2;i++){
    const block=data.slice(offset,offset+d2);
    offset+=d2;
    blocks.push({data:block,ec:rsEncode(block,ecPer)});
  }
  const maxData=Math.max(d1,d2);
  const out=[];
  for(let i=0;i<maxData;i++) for(const block of blocks) if(i<block.data.length) out.push(block.data[i]);
  for(let i=0;i<ecPer;i++) for(const block of blocks) out.push(block.ec[i]);
  return out;
}
function sizeOf(version){return version*4+17;}
function reservedMatrix(version){
  const n=sizeOf(version);
  const reserved=Array.from({length:n},()=>new Array(n).fill(false));
  function fill(r0,c0,h,w){
    for(let r=r0;r<r0+h;r++) for(let c=c0;c<c0+w;c++) if(r>=0&&c>=0&&r<n&&c<n) reserved[r][c]=true;
  }
  function finder(r,c){fill(r-1,c-1,9,9);}
  finder(0,0);finder(0,n-8);finder(n-8,0);
  fill(6,0,1,n);fill(0,6,n,1);
  fill(n-8,8,1,8);fill(8,n-8,8,1);fill(8,0,1,9);fill(0,8,9,1);
  if(version>=7){fill(0,n-11,6,3);fill(n-11,0,3,6);}
  const align=ALIGN[version]||[];
  for(const r of align) for(const c of align){
    if((r<9&&c<9)||(r<9&&c>n-10)||(r>n-10&&c<9)) continue;
    fill(r-2,c-2,5,5);
  }
  return reserved;
}
function placeFinders(mod,n){
  function finder(r0,c0){
    for(let r=0;r<7;r++) for(let c=0;c<7;c++){
      const edge=r===0||c===0||r===6||c===6;
      const core=r>=2&&r<=4&&c>=2&&c<=4;
      mod[r0+r][c0+c]=edge||core;
    }
  }
  finder(0,0);finder(0,n-7);finder(n-7,0);
}
function placeTiming(mod,n){
  for(let i=0;i<n;i++){
    const bit=i%2===0;
    if(mod[6][i]==null) mod[6][i]=bit;
    if(mod[i][6]==null) mod[i][6]=bit;
  }
}
function placeAlign(mod,version){
  const n=mod.length;
  const align=ALIGN[version]||[];
  for(const r0 of align) for(const c0 of align){
    if((r0<9&&c0<9)||(r0<9&&c0>n-10)||(r0>n-10&&c0<9)) continue;
    for(let r=-2;r<=2;r++) for(let c=-2;c<=2;c++){
      const edge=Math.abs(r)===2||Math.abs(c)===2;
      mod[r0+r][c0+c]=edge||(r===0&&c===0);
    }
  }
}
function placeFormat(mod,mask){
  const n=mod.length;
  const bits=formatBits(mask);
  const coords=[];
  for(let i=0;i<6;i++) coords.push([i,8]);
  coords.push([7,8],[8,8],[8,7]);
  for(let i=5;i>=0;i--) coords.push([8,i]);
  for(let i=0;i<8;i++){
    const bit=((bits>>>(14-i))&1)===1;
    const [r,c]=coords[i];
    mod[r][c]=bit;
  }
  for(let i=8;i<15;i++){
    const bit=((bits>>>(14-i))&1)===1;
    const [r,c]=coords[i];
    mod[r][c]=bit;
  }
  for(let i=0;i<8;i++) mod[8][n-1-i]=((bits>>>(14-i))&1)===1;
  for(let i=0;i<7;i++) mod[n-7+i][8]=((bits>>>(6-i))&1)===1;
  mod[n-8][8]=true;
}
function placeVersion(mod,version){
  if(version<7) return;
  const n=mod.length;
  const bits=versionBits(version);
  let k=17;
  for(let i=0;i<6;i++) for(let j=0;j<3;j++){
    const bit=((bits>>>k)&1)===1;
    k--;
    mod[i][n-11+j]=bit;
    mod[n-11+j][i]=bit;
  }
}
function maskFn(mask,r,c){
  switch(mask){
    case 0: return (r+c)%2===0;
    case 1: return r%2===0;
    case 2: return c%3===0;
    case 3: return (r+c)%3===0;
    case 4: return (Math.floor(r/2)+Math.floor(c/3))%2===0;
    case 5: return (r*c)%2+(r*c)%3===0;
    case 6: return ((r*c)%2+(r*c)%3)%2===0;
    default: return ((r+c)%2+(r*c)%3)%2===0;
  }
}
function placeData(mod,reserved,codewords,mask){
  const n=mod.length;
  const bits=[];
  for(const word of codewords) for(let i=7;i>=0;i--) bits.push((word>>>i)&1);
  let index=0;
  let upward=true;
  for(let col=n-1;col>0;col-=2){
    if(col===6) col--;
    for(let i=0;i<n;i++){
      const row=upward?n-1-i:i;
      for(const c of [col,col-1]){
        if(reserved[row][c]||mod[row][c]!=null) continue;
        const bit=index<bits.length?bits[index]===1:false;
        index++;
        mod[row][c]=maskFn(mask,row,c)?!bit:bit;
      }
    }
    upward=!upward;
  }
}
function penalty(mod){
  const n=mod.length;
  let score=0;
  for(let r=0;r<n;r++){
    let run=1;
    for(let c=1;c<=n;c++){
      if(c<n && mod[r][c]===mod[r][c-1]) run++;
      else {
        if(run>=5) score+=run-2;
        run=1;
      }
    }
  }
  for(let c=0;c<n;c++){
    let run=1;
    for(let r=1;r<=n;r++){
      if(r<n && mod[r][c]===mod[r-1][c]) run++;
      else {
        if(run>=5) score+=run-2;
        run=1;
      }
    }
  }
  for(let r=0;r<n-1;r++) for(let c=0;c<n-1;c++){
    const v=mod[r][c];
    if(mod[r][c+1]===v && mod[r+1][c]===v && mod[r+1][c+1]===v) score+=3;
  }
  const pattern=[1,0,1,1,1,0,1];
  function finderLike(line){
    for(let i=0;i<=line.length-7;i++){
      let ok=true;
      for(let j=0;j<7;j++) if(line[i+j]!==pattern[j]){ok=false;break;}
      if(!ok) continue;
      const left=i>=4 && line.slice(i-4,i).every(v=>v===0);
      const right=i+11<=line.length && line.slice(i+7,i+11).every(v=>v===0);
      if(left||right) score+=40;
    }
  }
  for(let r=0;r<n;r++) finderLike(mod[r]);
  for(let c=0;c<n;c++) finderLike(mod.map(row=>row[c]));
  let dark=0;
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(mod[r][c]) dark++;
  score+=Math.abs(Math.floor(dark*100/(n*n)/5)-10)*10;
  return score;
}
function buildMatrix(text){
  const bytes=Array.from(Buffer.from(String(text),'utf8'));
  const version=chooseVersion(bytes.length);
  const n=sizeOf(version);
  const reserved=reservedMatrix(version);
  const data=interleave(version,encodeData(bytes,version));
  let best=null,bestScore=Infinity;
  for(let mask=0;mask<8;mask++){
    const mod=Array.from({length:n},()=>new Array(n).fill(null));
    placeFinders(mod,n);
    placeAlign(mod,version);
    placeTiming(mod,n);
    placeFormat(mod,mask);
    placeVersion(mod,version);
    placeData(mod,reserved,data,mask);
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(mod[r][c]==null) mod[r][c]=false;
    const score=penalty(mod);
    if(score<bestScore){bestScore=score;best=mod;}
  }
  return best;
}
function qrSvg(text,{moduleSize=8,margin=4}={}){
  const mod=buildMatrix(text);
  const n=mod.length;
  const dim=(n+margin*2)*moduleSize;
  let rects='';
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    if(!mod[r][c]) continue;
    const x=(c+margin)*moduleSize;
    const y=(r+margin)*moduleSize;
    rects+=`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}

module.exports={qrSvg};
