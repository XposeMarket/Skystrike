import * as THREE from 'three';
const atlas=new Map();
const palettes={default:['#b1aea3','#21333d'],brick:['#965a42','#243644'],glass:['#608391','#152c3c'],industrial:['#9b9e98','#32424b']};
function rng(seed){let x=seed;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
function canvas(){const c=document.createElement('canvas');c.width=c.height=512;return c;}
function texture(c,anisotropy,color=true){const t=new THREE.CanvasTexture(c);if(color)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;t.userData.shared=true;return t;}
function getAtlas(kind,roof,renderer){
  const key=`${kind}:${roof}`;if(atlas.has(key))return atlas.get(key);
  const random=rng((Object.keys(palettes).indexOf(kind)+2)*(roof?593:173)),[base,glass]=palettes[kind]||palettes.default;
  const c=canvas(),h=canvas(),r=canvas(),ctx=c.getContext('2d'),hc=h.getContext('2d'),rc=r.getContext('2d');
  ctx.fillStyle=roof?(kind==='industrial'?'#868a88':'#50545a'):base;ctx.fillRect(0,0,512,512);
  hc.fillStyle='#888';hc.fillRect(0,0,512,512);rc.fillStyle=roof?'#eeeeee':'#dadada';rc.fillRect(0,0,512,512);
  for(let i=0;i<6000;i++){const x=random()*512,y=random()*512,v=random();ctx.fillStyle=v>.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.055)';ctx.fillRect(x,y,1+v*2,1+v*2);}
  if(roof){
    for(let y=0;y<512;y+=64){ctx.fillStyle='rgba(14,19,22,.38)';ctx.fillRect(0,y,512,2);hc.fillStyle='#444';hc.fillRect(0,y,512,2);}
    for(let x=0;x<512;x+=128){ctx.fillStyle='rgba(13,20,24,.28)';ctx.fillRect(x,0,2,512);hc.fillStyle='#444';hc.fillRect(x,0,2,512);}
  }else{
    if(kind==='brick')for(let y=0;y<512;y+=8){ctx.fillStyle='#b39681';ctx.fillRect(0,y,512,1);hc.fillStyle='#555';hc.fillRect(0,y,512,1);for(let x=(y/8%2)*12;x<512;x+=24){ctx.fillRect(x,y,1,8);hc.fillRect(x,y,1,8);}}
    if(kind==='industrial')for(let x=0;x<512;x+=12){ctx.fillStyle='rgba(30,38,40,.18)';ctx.fillRect(x,0,2,512);hc.fillStyle='#555';hc.fillRect(x,0,2,512);}
    // Four three-metre bays and four 3.2-metre floors, not seven floors per 4.5 metres.
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const pad=kind==='glass'?3:kind==='industrial'?30:24,x=col*128+pad,y=row*128+24,w=128-2*pad,hh=kind==='industrial'?48:76;
      ctx.fillStyle='rgba(10,17,22,.5)';ctx.fillRect(x-4,y-4,w+8,hh+11);hc.fillStyle='#333';hc.fillRect(x-4,y-4,w+8,hh+11);
      const gradient=ctx.createLinearGradient(x,y,x,y+hh);gradient.addColorStop(0,'#89a1ac');gradient.addColorStop(.35,glass);gradient.addColorStop(1,'#13222e');ctx.fillStyle=gradient;ctx.fillRect(x,y,w,hh);
      if(random()<.16&&kind!=='glass'){ctx.fillStyle='rgba(219,190,133,.4)';ctx.fillRect(x,y,w,hh);}
      if(random()<.36){ctx.fillStyle='rgba(195,200,192,.45)';ctx.fillRect(x,y,w,hh*(.2+random()*.4));}
      rc.fillStyle='#444';rc.fillRect(x,y,w,hh);hc.fillStyle='#555';hc.fillRect(x,y,w,hh);
      ctx.fillStyle='rgba(199,208,209,.8)';ctx.fillRect(x-2,y-2,w+4,2);ctx.fillRect(x+w/2-1,y,2,hh);ctx.fillRect(x-4,y+hh+2,w+8,4);hc.fillStyle='#aaa';hc.fillRect(x-4,y+hh+2,w+8,4);
    }
  }
  const an=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const out={map:texture(c,an),bump:texture(h,an,false),roughness:texture(r,an,false)};
  for(const t of Object.values(out))t.repeat.set(1/12,1/(roof?12:12.8));atlas.set(key,out);return out;
}
export function makeFacadeMaterial(kind,renderer,roof=false){
  const t=getAtlas(kind,roof,renderer);
  return new THREE.MeshStandardMaterial({map:t.map,bumpMap:t.bump,bumpScale:roof?.055:.07,roughnessMap:t.roughness,roughness:1,metalness:kind==='glass'?.24:.04,color:0xffffff,side:THREE.DoubleSide});
}
// After extrusion rotation/translation, project each wall along its own tangent.
// This keeps windows upright on diagonal OSM footprints and roofs roof-like.
export function mapBuildingUV(geometry,base,seed=0){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
  const offset=((Math.abs(Number(seed))||0)%4)*3;
  for(let i=0;i<p.count;i++){
    const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
    if(Math.abs(ny)>.7)uv.setXY(i,p.getX(i),-p.getZ(i));
    else uv.setXY(i,p.getX(i)*nz-p.getZ(i)*nx+offset,p.getY(i)-base);
  }
  uv.needsUpdate=true;
}
export function facadeAtlasCount(){return atlas.size;}
