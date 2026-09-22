// One-time BUILD adapter for the pinned legacy runtime. No source rewriting,
// GitHub code fetches, eval, or blob modules are shipped to the browser.
export function integrate(source){
  function replace(needle,value,label){const next=source.replace(needle,value);if(next===source)throw new Error(`Legacy integration contract failed: ${label}`);source=next;}
  source="import {createAircraftManager} from '../flight-v11/aircraft.mjs';\nimport {makeFacadeMaterial,mapBuildingUV,facadeAtlasCount} from '../flight-v11/buildings.mjs';\nimport {createPlanetSurfaces} from '../flight-v11/surfaces.mjs';\n"+source;
  replace(/function fallbackAircraft\(\) \{[\s\S]*?\nfunction tileXY/,
`const aircraftManager=createAircraftManager({state,configs:aircraftConfigs,root:aircraftRoot,toast,onChange:status=>{
  state.aircraftLoad=status;
  const el=document.getElementById('modelLoadStatus');if(el)el.textContent=status.phase==='ready'?'LOCAL 3D MODEL READY':status.phase==='loading'?'LOADING MODEL · CONTROLS AVAILABLE':'PREVIEW ACTIVE · RETRY MODEL';
}});
async function setAircraft(key,silent=false){return aircraftManager.select(key,silent);}
function tileXY`,'awaitable aircraft manager');
  replace(/function makeFacadeTexture\(kind\) \{[\s\S]*?\nfunction seededRandom/,
`function makeBuildingMaterial(kind){return makeFacadeMaterial(kind,renderer,false);}
function makeRoofMaterial(kind){return makeFacadeMaterial(kind,renderer,true);}
function seededRandom`,'shared physically scaled facade atlases');
  replace('      geometry.translate(0, base, 0);','      geometry.translate(0, base, 0);\n      mapBuildingUV(geometry,base,way.id);','upright facade UVs');
  replace('mats.forEach(m=>{if(m.map)m.map.dispose?.();m.dispose?.();});',"mats.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture&&!v.userData?.shared)v.dispose();m.dispose?.();});",'shared texture ownership');
  replace('async function loadTerrain(lat,lon,name=\'EARTH\') {',`let worldLoadSerial=0;
async function loadTerrain(lat,lon,name='EARTH') {
  surfaces.reset();const worldToken=++worldLoadSerial;state.transitioning=true;`,'Earth transition ownership');
  replace('  await refreshTerrainTiles(true);\n  state.terrainBase=',"  await refreshTerrainTiles(true);\n  if(worldToken!==worldLoadSerial||state.mode!=='earth')return;\n  state.transitioning=false;\n  state.terrainBase=",'stale Earth completion guard');
  replace('  await refreshTerrainTiles(true);state.terrainBase=',"  const originToken=state.earthOrigin;await refreshTerrainTiles(true);if(state.mode!=='earth'||originToken!==state.earthOrigin){state.rebasing=false;return;}state.terrainBase=",'stale rebase guard');
  replace("function enterSpace(target='Earth', instant=false) {",`function enterSpace(target='Earth', instant=false) {
  ++worldLoadSerial;surfaces.reset();clearTerrain();clearBuildings();setLoading('',false);
  if(state.currentAircraft!=='shuttle')void setAircraft('shuttle',true);`,'orbit transition');
  replace('function updateFlight(dt) {',`function updateFlight(dt) {
  if(state.mode==='surface'){surfaces.update(dt);return;}
  if(state.mode==='space'&&state.approachTarget&&surfaces.approach(dt))return;`,'surface flight dispatcher');
  replace('    flightPos.addScaledVector(forward,state.spaceVelocity*1100*dt);',`    const previousSpacePosition=flightPos.clone();
    flightPos.addScaledVector(forward,state.spaceVelocity*1100*dt);
    if(surfaces.checkApproach(previousSpacePosition))return;`,'swept planetary approach');
  replace('function updateHUD(elapsed) {',"function updateHUD(elapsed) {\n  if(state.mode==='surface'){surfaces.updateHUD();return;}", 'planet-aware instruments');
  replace("if(state.mode==='space')return returnToEarth();const cfg=", "if(state.mode==='surface')return surfaces.leave();if(state.mode==='space')return returnToEarth();const cfg=",'planet orbit button');
  replace("window.__FLIGHT_UNIVERSE__={state,renderer,camera,scene,setAircraft,loadTerrain,enterSpace,returnToEarth};",`window.__FLIGHT_UNIVERSE__={state,renderer,camera,scene,setAircraft,loadTerrain,enterSpace,returnToEarth,surfaces,aircraftManager,flightPos,flightQuat,solarBodies,makeBuildingTile,facadeAtlasCount,build:'v11'};`,'diagnostics');
  replace('function animate(timestamp) {',`const surfaces=createPlanetSurfaces({state,renderer,scene,earthGroup,solarGroup,solarBodies,flightPos,flightQuat,aircraftRoot,camera,hemi,sunLight,toast,setLoading,setAircraft,clearTerrain,clearBuildings,enterOrbit:name=>enterSpace(name,true),returnEarth:geo=>loadTerrain(geo.lat,geo.lon,'EARTH REENTRY')});
function animate(timestamp) {`,'surface system composition');
  replace('  updateSolar(dt,elapsed);',"  const step=state.running&&!state.paused&&!state.transitioning?dt:0;\n  updateSolar(state.mode==='surface'?0:step,elapsed);",'pause-aware orbital update');
  replace('  updateCombat(dt);','  if(step>0)updateCombat(step);','pause-aware combat');
  replace('if(state.running&&!state.paused){updateFlight(dt);', 'if(state.running&&!state.paused&&!state.transitioning){updateFlight(dt);','transition-aware flight');
  replace('installV10Experience();\ninstallWeaponControls();',`installV10Experience();
surfaces.installUI();
const modelStatus=document.createElement('div');modelStatus.id='modelLoadStatus';modelStatus.className='source-note';$('tab-aircraft').append(modelStatus);
const retryModel=document.createElement('button');retryModel.id='retryAircraftBtn';retryModel.className='wide-btn';retryModel.textContent='RETRY CURRENT AIRCRAFT MODEL';retryModel.addEventListener('click',()=>setAircraft(state.currentAircraft));$('tab-aircraft').append(retryModel);
$('updateStatus').textContent='BUILD V11';
installWeaponControls();`,'surface destinations and aircraft retry UI');
  replace("navigator.serviceWorker.register('./sw.js?v=loader-v10-experience-overhaul')","navigator.serviceWorker.register('./sw.js?v=flight-v11')",'service worker revision');
  replace("  await setAircraft('rafale',true);","  await setAircraft('rafale',true);\n  window.__FLIGHT_UNIVERSE__.ready=true;",'initialization completion');
  // Bounded map fetches: an unavailable external provider is not a permanent loading screen.
  replace(/function loadTexture\(url, color = 0xffffff\) \{[\s\S]*?\n\}\n\nasync function buildSolarSystem/,
`function loadTexture(url,color=0xffffff){return new Promise(resolve=>{if(!url)return resolve(null);let done=false;const timer=setTimeout(()=>{done=true;resolve(null);},10000);texLoader.load(url,t=>{if(done){t.dispose();return;}done=true;clearTimeout(timer);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resolve(t);},undefined,()=>{if(!done){done=true;clearTimeout(timer);resolve(null);}});});}

async function buildSolarSystem`,'map texture timeout');
  replace(/function imageData\(url\) \{[\s\S]*?\n\}\n\nfunction terrainTileBounds/,
`function imageData(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';let done=false;const fail=e=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;reject(e);};const timer=setTimeout(()=>{fail(new Error('Elevation tile timeout'));img.src='';},10000);img.onerror=fail;img.onload=()=>{if(done)return;try{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height);done=true;clearTimeout(timer);resolve(data);}catch(e){fail(e);}};img.src=url;});}

function terrainTileBounds`,'elevation timeout');
  source=source.replaceAll('Â·','·').replaceAll('Â°','°');
  return source;
}
