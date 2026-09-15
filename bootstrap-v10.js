const VERSION = 'loader-v10-experience-overhaul';
const PREVIOUS_LOADER = 'https://raw.githubusercontent.com/XposeMarket/Skystrike/c5c5bb6684c46d651eaeddd5a3783ad48255c690/bootstrap-v9.js';

function upgradeV10(source) {
  const patch = (needle, replacement, label) => {
    const next = source.replace(needle, replacement);
    if (next === source) console.warn(`[Flight Universe v10] patch skipped: ${label}`);
    source = next;
  };

  patch(
    "  quality: 1,\n  terrainRadius: 1,",
    "  quality: Number(localStorage.getItem('fu:quality') || 1),\n  autoQuality: localStorage.getItem('fu:autoQuality') !== '0',\n  resolutionScale: 1,\n  baseFov: Number(localStorage.getItem('fu:fov') || 72),\n  paused: false,\n  haptics: localStorage.getItem('fu:haptics') !== '0',\n  audio: localStorage.getItem('fu:audio') !== '0',\n  cameraMotion: localStorage.getItem('fu:cameraMotion') !== '0',\n  terrainRadius: 1,",
    'persistent experience state',
  );

  patch(
    'renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));',
    'renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));',
    'initial renderer density',
  );

  const starField = `function makeStars() {
  const addLayer=(count,size,opacity,color,minR,maxR)=>{
    const geo=new THREE.BufferGeometry(),arr=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const r=minR+Math.random()*(maxR-minR),u=Math.random()*2-1,t=Math.random()*Math.PI*2,s=Math.sqrt(1-u*u);
      arr[i*3]=r*s*Math.cos(t);arr[i*3+1]=r*u;arr[i*3+2]=r*s*Math.sin(t);
    }
    geo.setAttribute('position',new THREE.BufferAttribute(arr,3));
    const mat=new THREE.PointsMaterial({color,size,sizeAttenuation:true,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
    scene.add(new THREE.Points(geo,mat));
  };
  addLayer(6200,88,.56,0xbfd9ff,150000,1000000);
  addLayer(760,175,.88,0xffffff,180000,950000);
  addLayer(260,245,.72,0xffe7c1,240000,900000);
}
makeStars();`;
  patch(
    /function makeStars\(\) \{[\s\S]*?\n\}\nmakeStars\(\);/,
    starField,
    'layered star field',
  );

  const cloudField = `function makeCloudTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,128);
  const puffs=[[64,70,54],[112,56,66],[158,68,58],[196,74,42],[128,79,72]];
  for(const [x,y,r] of puffs){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.92)');g.addColorStop(.42,'rgba(244,250,255,.58)');g.addColorStop(1,'rgba(235,244,255,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return texture;
}
function buildClouds() {
  clearGroup(cloudGroup);
  if(!state.clouds)return;
  const texture=makeCloudTexture();
  const count=state.quality>=1.25?52:state.quality>=.95?38:24;
  for(let i=0;i<count;i++){
    const cluster=new THREE.Group();
    cluster.position.set((Math.random()-.5)*32000,1700+Math.random()*2600,(Math.random()-.5)*32000);
    cluster.userData.speed=2.5+Math.random()*7;
    const pieces=3+Math.floor(Math.random()*4);
    for(let j=0;j<pieces;j++){
      const mat=new THREE.SpriteMaterial({map:texture,color:0xffffff,transparent:true,opacity:.10+Math.random()*.12,depthWrite:false,fog:true});
      const s=new THREE.Sprite(mat);const scale=650+Math.random()*1500;
      s.position.set((Math.random()-.5)*900,(Math.random()-.5)*150,(Math.random()-.5)*450);s.scale.set(scale,scale*.42,1);cluster.add(s);
    }
    cloudGroup.add(cluster);
  }
}`;
  patch(
    /function buildClouds\(\) \{[\s\S]*?\n\}\n\nconst BUILDING_ZOOM/,
    cloudField + '\n\nconst BUILDING_ZOOM',
    'volumetric cloud clusters',
  );

  patch(
    '  camera.lookAt(camTarget);\n}',
    `  camera.lookAt(camTarget);
  const baseFov=state.baseFov||72;
  const cfg=aircraftConfigs[state.currentAircraft];
  const motion=state.cameraMotion?(state.mode==='earth'?THREE.MathUtils.clamp(state.speed/Math.max(1,cfg.maxSpeed),0,1):THREE.MathUtils.clamp(state.spaceVelocity/9,0,1)):0;
  const targetFov=baseFov+motion*(state.cameraMode===1?2.2:5.5)+(state.boost?2.2:0);
  camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-dt*3.2));camera.updateProjectionMatrix();
}`,
    'speed-sensitive camera FOV',
  );

  const experienceCode = `let v10AdaptiveAt=0,v10GoodFrames=0,v10UiAt=0;
let v10Audio=null;
function v10Vibrate(ms=10){if(state.haptics&&navigator.vibrate)navigator.vibrate(ms);}
function setV10Paused(value){
  state.paused=!!value;
  const overlay=document.getElementById('pauseOverlay');if(overlay)overlay.classList.toggle('open',state.paused);
  const btn=document.getElementById('pauseBtn');if(btn){btn.textContent=state.paused?'▶':'Ⅱ';btn.setAttribute('aria-label',state.paused?'Resume flight':'Pause flight');}
  if(state.paused)toast('FLIGHT PAUSED');
  if(v10Audio?.master)v10Audio.master.gain.setTargetAtTime(state.paused?0:.075,v10Audio.ctx.currentTime,.08);
}
function initV10Audio(){
  if(v10Audio||!state.audio)return;
  const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
  try{
    const ctx=new AudioCtx(),master=ctx.createGain();master.gain.value=.0001;master.connect(ctx.destination);
    const engine=ctx.createOscillator(),engine2=ctx.createOscillator(),engineGain=ctx.createGain();engine.type='sawtooth';engine2.type='sine';engine.frequency.value=62;engine2.frequency.value=124;engineGain.gain.value=.0001;engine.connect(engineGain);engine2.connect(engineGain);engineGain.connect(master);engine.start();engine2.start();
    const frames=Math.max(1,Math.floor(ctx.sampleRate*2)),buffer=ctx.createBuffer(1,frames,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1)*.55;
    const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),windGain=ctx.createGain();noise.buffer=buffer;noise.loop=true;filter.type='bandpass';filter.frequency.value=850;filter.Q.value=.42;windGain.gain.value=.0001;noise.connect(filter);filter.connect(windGain);windGain.connect(master);noise.start();
    v10Audio={ctx,master,engine,engine2,engineGain,noise,filter,windGain};ctx.resume();master.gain.setTargetAtTime(.075,ctx.currentTime,.12);
  }catch{}
}
function updateV10Audio(){
  if(!v10Audio)return;const {ctx,master,engine,engine2,engineGain,filter,windGain}=v10Audio;
  if(ctx.state==='suspended'&&state.running&&!state.paused)ctx.resume().catch(()=>{});
  const cfg=aircraftConfigs[state.currentAircraft],ratio=state.mode==='earth'?THREE.MathUtils.clamp(state.speed/Math.max(1,cfg.maxSpeed),0,1):THREE.MathUtils.clamp(state.spaceVelocity/9,0,1),active=state.running&&!state.paused&&state.audio;
  master.gain.setTargetAtTime(active ? .075 : .0001,ctx.currentTime,.12);
  engine.frequency.setTargetAtTime(state.mode==='space'?46:54+state.throttle*92+ratio*58,ctx.currentTime,.08);engine2.frequency.setTargetAtTime(state.mode==='space'?92:108+state.throttle*180+ratio*90,ctx.currentTime,.08);
  engineGain.gain.setTargetAtTime(active?(state.mode==='space'?.09:.12+state.throttle*.07):.0001,ctx.currentTime,.08);filter.frequency.setTargetAtTime(480+ratio*1900,ctx.currentTime,.12);windGain.gain.setTargetAtTime(active&&state.mode==='earth'?Math.max(.0001,ratio*.11):.0001,ctx.currentTime,.12);
}
function updateAdaptiveQuality(elapsed){
  if(!state.autoQuality||elapsed-v10AdaptiveAt<1.25)return;v10AdaptiveAt=elapsed;
  const low=innerWidth<900?43:50,high=innerWidth<900?53:57;let next=state.resolutionScale;
  if(fps<low){next=Math.max(.62,next-.08);v10GoodFrames=0;}else if(fps>high){v10GoodFrames++;if(v10GoodFrames>=2){next=Math.min(1,next+.045);v10GoodFrames=0;}}else v10GoodFrames=0;
  if(Math.abs(next-state.resolutionScale)>.001){state.resolutionScale=next;applyPixelRatio();}
}
function updateV10Ui(elapsed){
  if(elapsed-v10UiAt<.25)return;v10UiAt=elapsed;
  const q=document.getElementById('qualityStatus');if(q)q.textContent=(state.autoQuality?'AUTO ':'LOCK ')+Math.round(state.resolutionScale*100)+'% · '+fps+' FPS';
  const n=document.getElementById('networkStatus');if(n){n.textContent=navigator.onLine?'ONLINE TILES':'OFFLINE CACHE';n.classList.toggle('offline',!navigator.onLine);}
  const a=document.getElementById('aircraftStatus');if(a)a.textContent=(aircraftConfigs[state.currentAircraft]?.name||state.currentAircraft).toUpperCase();
  const warning=document.getElementById('flightWarning');if(warning){let text='';if(state.running&&!state.paused&&state.mode==='earth'){const cfg=aircraftConfigs[state.currentAircraft],agl=state.altitude-(state.terrainBase||0);if(agl<85&&state.speed>95)text='PULL UP';else if(agl>55&&state.speed<cfg.minSpeed*1.12)text='STALL';else if(state.boost)text='AFTERBURNER';}warning.textContent=text;warning.classList.toggle('show',!!text);}
}
function updateV10Systems(dt,elapsed){updateAdaptiveQuality(elapsed);updateV10Audio();updateV10Ui(elapsed);}
function installV10Experience(){
  const auto=document.getElementById('autoQualityToggle'),motion=document.getElementById('cameraMotionToggle'),haptics=document.getElementById('hapticsToggle'),audio=document.getElementById('audioToggle');
  state.terrainZoom=state.quality>=1.25?15:state.quality<.9?13:14;
  if(auto){auto.checked=state.autoQuality;auto.addEventListener('change',e=>{state.autoQuality=e.target.checked;localStorage.setItem('fu:autoQuality',state.autoQuality?'1':'0');if(!state.autoQuality){state.resolutionScale=1;applyPixelRatio();}toast(state.autoQuality?'Adaptive resolution on':'Adaptive resolution locked');});}
  if(motion){motion.checked=state.cameraMotion;motion.addEventListener('change',e=>{state.cameraMotion=e.target.checked;localStorage.setItem('fu:cameraMotion',state.cameraMotion?'1':'0');});}
  if(haptics){haptics.checked=state.haptics;haptics.addEventListener('change',e=>{state.haptics=e.target.checked;localStorage.setItem('fu:haptics',state.haptics?'1':'0');v10Vibrate(12);});}
  if(audio){audio.checked=state.audio;audio.addEventListener('change',e=>{state.audio=e.target.checked;localStorage.setItem('fu:audio',state.audio?'1':'0');if(state.audio)initV10Audio();updateV10Audio();});}
  const qs=document.getElementById('qualitySelect');if(qs){qs.value=String(state.quality);qs.addEventListener('change',()=>{localStorage.setItem('fu:quality',String(state.quality));state.terrainZoom=state.quality>=1.25?15:state.quality<.9?13:14;if(state.mode==='earth'&&state.running){const g=state.currentGeo||state.location;loadTerrain(g.lat,g.lon,state.location.name);}});}
  const fr=document.getElementById('fovRange');if(fr){fr.value=String(state.baseFov);fr.addEventListener('input',e=>{state.baseFov=+e.target.value;localStorage.setItem('fu:fov',String(state.baseFov));});}
  document.getElementById('pauseBtn')?.addEventListener('click',()=>{setV10Paused(!state.paused);v10Vibrate(12);});document.getElementById('resumeBtn')?.addEventListener('click',()=>setV10Paused(false));
  const help=document.getElementById('helpOverlay'),toggleHelp=value=>help?.classList.toggle('open',value??!help.classList.contains('open'));document.getElementById('helpBtn')?.addEventListener('click',()=>toggleHelp());document.getElementById('closeHelpBtn')?.addEventListener('click',()=>toggleHelp(false));
  ['startBtn','quickSpaceBtn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{initV10Audio();setV10Paused(false);v10Vibrate(16);}));
  document.addEventListener('pointerdown',e=>{if(e.target.closest('button,.stick-zone,.throttle-zone'))v10Vibrate(7);},{passive:true});
  window.addEventListener('keydown',e=>{if(e.repeat&&['KeyP','KeyH','Digit1','Digit2','Digit3'].includes(e.code))return;if(e.code==='KeyP')setV10Paused(!state.paused);if(e.code==='KeyH')toggleHelp();if(e.code==='BracketRight'){state.throttle=THREE.MathUtils.clamp(state.throttle+.05,0,1);}if(e.code==='BracketLeft'){state.throttle=THREE.MathUtils.clamp(state.throttle-.05,0,1);}if(e.code==='Digit1')setAircraft('rafale');if(e.code==='Digit2')setAircraft('globalhawk');if(e.code==='Digit3')setAircraft('shuttle');if(e.code==='Escape'){toggleHelp(false);panel.classList.remove('open');}});
  window.addEventListener('online',()=>toast('MAP STREAM ONLINE'));window.addEventListener('offline',()=>toast('OFFLINE · USING CACHED ASSETS'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused)setV10Paused(true);});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{const el=document.getElementById('updateStatus');if(el){el.textContent='UPDATE READY · RELOAD';el.classList.add('show');}});
  window.__FLIGHT_UNIVERSE__={state,renderer,camera,scene,setAircraft,loadTerrain,enterSpace,returnToEarth};
  updateV10Ui(999);
}`;
  patch('function animate', experienceCode + '\n\nfunction animate', 'experience systems');

  patch(
    '  updateSolar(dt,elapsed);',
    '  updateSolar(dt,elapsed);\n  updateV10Systems(dt,elapsed);',
    'experience update loop',
  );

  patch(
    /if\(state\.running\)\{updateFlight\(dt\);/,
    'if(state.running&&!state.paused){updateFlight(dt);',
    'pause-aware flight loop',
  );

  patch(
    'function applyPixelRatio(){renderer.setPixelRatio(Math.min(devicePixelRatio,Math.min(2,1.5*state.quality)));}',
    'function applyPixelRatio(){renderer.setPixelRatio(Math.min(devicePixelRatio,Math.min(2,1.65*state.quality*state.resolutionScale)));}',
    'adaptive renderer density',
  );

  patch(
    'populateUI();',
    'populateUI();\ninstallV10Experience();',
    'experience installer',
  );

  return source;
}

try {
  const response = await fetch(PREVIOUS_LOADER, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load previous Flight Universe loader: ${response.status}`);
  let code = await response.text();
  const upgradeSource = upgradeV10.toString();
  code = `const V10_UPGRADE_CODE=${JSON.stringify(upgradeSource)};\n` + code;
  code = code.replace("const PATCH_VERSION='loader-v9-aircraft-weapons-destruction';", `const PATCH_VERSION='${VERSION}';`);
  if (!code.includes("UPGRADE_CODE+'\\nfunction cacheBustServiceWorker'")) throw new Error('v9 loader injection point changed');
  code = code.replace("UPGRADE_CODE+'\\nfunction cacheBustServiceWorker'", "UPGRADE_CODE+'\\n'+V10_UPGRADE_CODE+'\\nfunction cacheBustServiceWorker'");
  if (!code.includes('source = upgradeAircraftWeapons(source);')) throw new Error('v9 aircraft upgrade hook changed');
  code = code.replace('source = upgradeAircraftWeapons(source);', 'source = upgradeAircraftWeapons(source);\n  source = upgradeV10(source);');
  const moduleUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try { await import(moduleUrl); } finally { URL.revokeObjectURL(moduleUrl); }
} catch (error) {
  console.error(error);
  const loadingText = document.getElementById('loadingText');
  if (loadingText) loadingText.textContent = 'FLIGHT SYSTEM UPDATE FAILED · RELOAD';
}
