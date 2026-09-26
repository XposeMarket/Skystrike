import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {fromArrayBuffer} from 'geotiff';
import sharp from 'sharp';
import {integrate} from './integrate.mjs';
import {buildAirports} from './airports-data.mjs';
const BASE='3808ef5455cf9b05bf4e9c3479c4f07babf78ea0';
const RAW=`https://raw.githubusercontent.com/XposeMarket/Skystrike/${BASE}/`;
await fs.mkdir('.flight-cache',{recursive:true});await fs.mkdir('dist/assets/models/rafale',{recursive:true});await fs.mkdir('dist/assets/planets',{recursive:true});
const provenance=[];
async function download(url){
  const key=crypto.createHash('sha256').update(url).digest('hex'),file=path.join('.flight-cache',key);
  let bytes;try{bytes=await fs.readFile(file);}catch{
    let error;for(let n=0;n<3;n++){try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length)throw new Error(`Empty ${url}`);await fs.writeFile(file,bytes);break;}catch(e){error=e;await new Promise(r=>setTimeout(r,500*(n+1)));}}
    if(!bytes)throw error;
  }
  provenance.push({url,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});return bytes;
}
// Evaluate only pinned build adapters, capture the generated ES module, never execute
// browser/game code during the build. This removes the nested network loader at runtime.
let assembled='';const blobs=new Map();let blobId=0;
const context=vm.createContext({console:{log:console.log,warn:console.warn,error:(...args)=>{throw new Error(args.map(String).join(' '));}},Blob,Response,
  URL:{createObjectURL:blob=>{const id=`build-blob:${++blobId}`;blobs.set(id,blob);return id;},revokeObjectURL:id=>blobs.delete(id)},
  document:{getElementById:()=>null},fetch:async url=>{
    const u=new URL(url);if(u.hostname!=='raw.githubusercontent.com'||!u.pathname.startsWith('/XposeMarket/Skystrike/'))throw new Error('Unexpected legacy build input');
    const pinned=u.href.replace('/flight-universe-pwa/',`/${BASE}/`);return new Response(await download(pinned));
  }});
async function evaluate(code){
  const module=new vm.SourceTextModule(code,{context,importModuleDynamically:async id=>{
    const blob=blobs.get(id);if(!blob)throw new Error('Missing build module');const text=await blob.text();
    if(text.startsWith("import * as THREE from 'three'")){assembled=text;const empty=new vm.SyntheticModule([],()=>{},{context});await empty.link(()=>{});await empty.evaluate();return empty;}
    return evaluate(text);
  }});await module.link(()=>{throw new Error('Unexpected static import in legacy adapter');});await module.evaluate();return module;
}
await evaluate((await download(RAW+'bootstrap-v10.js')).toString('utf8'));
if(assembled.length<60000||!assembled.includes('installV10Experience'))throw new Error('Incomplete legacy assembly');
await fs.writeFile('.flight-cache/assembled-v10.mjs',assembled);
await fs.writeFile('.flight-cache/game.mjs',integrate(assembled));
const result=await build({entryPoints:['.flight-cache/game.mjs'],bundle:true,format:'esm',target:'es2022',minify:true,outdir:'dist/assets',entryNames:'game-[hash]',metafile:true});
const entry=Object.entries(result.metafile.outputs).find(([,v])=>v.entryPoint)?.[0];if(!entry)throw new Error('Missing built entry');
let html=(await download(RAW+'index.html')).toString('utf8');
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace(/https:\/\/cdn\.jsdelivr\.net\/gh\/XposeMarket\/Skystrike@[^" ]+\/styles\.css/,'./styles.css').replace(/<script type="module" src="[^\"]+"><\/script>/,`<script type="module" src="./${entry.replace(/^dist\//,'')}"></script>`).replaceAll('BUILD V10','BUILD V12').replace('FLIGHT UNIVERSE / V10','FLIGHT UNIVERSE / V12');
html=html.replace('</head>','<link rel="stylesheet" href="./v11.css" /></head>');
await fs.writeFile('dist/index.html',html);
for(const file of ['styles.css','styles-v10.css','icon.svg','manifest.webmanifest'])await fs.writeFile('dist/'+file,await download(RAW+file));
await fs.copyFile('flight-v11/v11.css','dist/v11.css');await fs.copyFile('flight-v11/sw.js','dist/sw.js');

async function model(name,url){const bytes=await download(url);if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67)throw new Error(`Invalid ${name} GLB`);const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());console.log(name,'GLB',bytes.length,'extensions:',JSON.stringify(json.extensionsRequired||[]));await fs.writeFile(`dist/assets/models/${name}.glb`,bytes);}
await Promise.all([
  model('globalhawk','https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/global-hawk/Global%20Hawk.glb'),
  model('shuttle','https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/space-shuttle-%28d%29/Space%20Shuttle%20%28D%29.glb'),
  (async()=>{const url='https://raw.githubusercontent.com/jeanjerome/OpenSkyFlight/main/assets/models/rafale/Rafale.gltf',bytes=await download(url),json=JSON.parse(bytes.toString());await fs.writeFile('dist/assets/models/rafale/Rafale.gltf',bytes);for(const item of [...(json.buffers||[]),...(json.images||[])]){if(!item.uri||item.uri.startsWith('data:'))continue;if(item.uri.includes('..')||item.uri.startsWith('/')||item.uri.includes(':'))throw new Error('Unsafe model dependency path');const output=path.join('dist/assets/models/rafale',decodeURIComponent(item.uri));await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,await download(new URL(item.uri,url).href));}})()
]);
const PDS='https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/';
const SVS='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/';
async function saveGrid(slug,source,w,h,scale,west,read){
  const width=w/2,height=h/2,out=Buffer.alloc(width*height*2);let min=Infinity,max=-Infinity;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const value=(read(y*2*w+x*2)+read(y*2*w+x*2+1)+read((y*2+1)*w+x*2)+read((y*2+1)*w+x*2+1))/4;const raw=Math.max(-32768,Math.min(32767,Math.round(value/scale)));out.writeInt16LE(raw,(y*width+x)*2);min=Math.min(min,raw*scale);max=Math.max(max,raw*scale);}
  if(!(max-min>1000))throw new Error(`Invalid elevation range ${slug}`);
  await fs.writeFile(`dist/assets/planets/${slug}.bin`,out);await fs.writeFile(`dist/assets/planets/${slug}.json`,JSON.stringify({width,height,unit:'metre',byteOrder:'little-endian',scale,west,pixelsPerDegree:width/360,registration:'pixel-centre',min,max,source},null,2));console.log(slug,'elevation',width,height,min,max);
}
await Promise.all([
  (async()=>{const label=(await download(PDS+'megt90n000eb.lbl')).toString();if(!/SAMPLE_TYPE\s*=\s*MSB_INTEGER/.test(label)||!/UNIT\s*=\s*METER/.test(label))throw new Error('MOLA format changed');const bytes=await download(PDS+'megt90n000eb.img');if(bytes.length!==5760*2880*2)throw new Error('MOLA grid size changed');await saveGrid('mars',PDS+'megt90n000eb.img',5760,2880,1,0,i=>bytes.readInt16BE(i*2));await fs.writeFile('dist/assets/planets/mars.jpg',await download('https://maps.jpl.nasa.gov/tmaps/pix/mar0kuu2.jpg'));})(),
  (async()=>{const bytes=await download(SVS+'ldem_16_uint.tif');const tif=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const image=await tif.getImage(),r=await image.readRasters({interleave:true});if(image.getWidth()!==5760||image.getHeight()!==2880)throw new Error('LOLA grid size changed');await saveGrid('moon',SVS+'ldem_16_uint.tif',5760,2880,.5,-180,i=>r[i]*.5-10000);const color=await download(SVS+'lroc_color_poles_4k.tif');await fs.writeFile('dist/assets/planets/moon.jpg',await sharp(color).jpeg({quality:90}).toBuffer());})()
]);
await buildAirports(download);
await fs.copyFile('flight-v11/ATTRIBUTION.md','dist/ATTRIBUTION.md');
await fs.writeFile('dist/assets/provenance.json',JSON.stringify({legacyCommit:BASE,assets:provenance},null,2));
console.log('Flight Universe v11 built. Static first-party runtime, NASA aircraft and two mapped surfaces.');
