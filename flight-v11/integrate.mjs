// One-time BUILD adapter for the pinned legacy runtime. No source rewriting,
// GitHub code fetches, eval, or blob modules are shipped to the browser.
export function integrate(source){
  function replace(needle,value,label){const next=source.replace(needle,value);if(next===source)throw new Error(`Legacy integration contract failed: ${label}`);source=next;}
  source="import {createAircraftManager} from '../flight-v11/aircraft.mjs';\nimport {makeFacadeMaterial,mapBuildingUV,facadeAtlasCount,facadeKind} from '../flight-v11/buildings.mjs';\nimport {createPlanetSurfaces} from '../flight-v11/surfaces.mjs';\nimport {nearestLandmarks,buildLandmark,suppressRadius} from '../flight-v11/landmarks.mjs';\n"+source;
  replace(/function fallbackAircraft\(\) \{[\s\S]*?\nfunction tileXY/,
`const aircraftManager=createAircraftManager({state,configs:aircraftConfigs,root:aircraftRoot,toast,onChange:status=>{
  state.aircraftLoad=status;
  const el=document.getElementById('modelLoadStatus');if(el)el.textContent=status.phase==='ready'?'LOCAL 3D MODEL READY':status.phase==='loading'?'LOADING MODEL ? CONTROLS AVAILABLE':'PREVIEW ACTIVE ? RETRY MODEL';
}});
async function setAircraft(key,silent=false){return aircraftManager.select(key,silent);}
function tileXY`,'awaitable aircraft manager');
  replace(/function makeFacadeTexture\(kind\) \{[\s\S]*?\nfunction seededRandom/,
`function makeBuildingMaterial(kind){return makeFacadeMaterial(kind,renderer,false);}
function makeRoofMaterial(kind){return makeFacadeMaterial(kind,renderer,true);}
function seededRandom`,'shared physically scaled facade atlases');
  replace('      geometry.translate(0, base, 0);','      geometry.translate(0, base, 0);\n      mapBuildingUV(geometry,base,way.id);','upright facade UVs');
  replace(
    '  const groups = { default: [], glass: [], brick: [], industrial: [] };\n  const colliders = [];\n  let accepted = 0;',
    '  const tileLat = (elements[0] && elements[0].geometry && elements[0].geometry[0] && elements[0].geometry[0].lat) || state.lat;\n  const tileLon = (elements[0] && elements[0].geometry && elements[0].geometry[0] && elements[0].geometry[0].lon) || state.lon;\n  const landmarks = nearestLandmarks(tileLat, tileLon, 2200, 4).map(L => {\n    const p = localFromGeo(L.lat, L.lon);\n    return {...L, x:p.x, z:p.z, radius:suppressRadius(L)};\n  });\n  const groups = { default: [], glass: [], brick: [], industrial: [], stone: [], civic: [], monument: [] };\n  const colliders = [];\n  let accepted = 0;',
    'landmark positions before footprints'
  );
  replace(
    'groups[kind].push(geometry);',
    'const nearLandmark=(landmarks||[]).some(L=>Math.hypot(cx-L.x,cz-L.z)<L.radius); if(!nearLandmark){ const tagged=facadeKind(tags); const facade=tagged==="default"?kind:tagged; (groups[facade]||groups[kind]).push(geometry); }',
    'landmark footprint suppression and richer facade kinds'
  );
  replace(
    '  const group = new THREE.Group();\n  group.name = `osm-buildings-${BUILDING_ZOOM}-${tx}-${ty}`;',
    '  const group = new THREE.Group();\n  group.name = `osm-buildings-${BUILDING_ZOOM}-${tx}-${ty}`;\n  group.userData.landmarks = landmarks;\n  for (const L of landmarks) {\n    const model = buildLandmark(L);\n    model.position.set(L.x, terrainHeightAt(L.x, L.z), L.z);\n    group.add(model);\n  }',
    'place nearby landmark silhouettes'
  );

  replace('mats.forEach(m=>{if(m.map)m.map.dispose?.();m.dispose?.();});',"mats.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture&&!v.userData?.shared)v.dispose();m.dispose?.();});",'shared texture ownership');
  replace('async function loadTerrain(lat,lon,name=\'EARTH\') {',`let worldLoadSerial=0;
async function loadTerrain(lat,lon,name='EARTH') {
  surfaces.reset();const worldToken=++worldLoadSerial;state.transitioning=true;`,'Earth transition ownership');
  replace('  await refreshTerrainTiles(true);\n  state.terrainBase=',"  await refreshTerrainTiles(true);\n  if(worldToken!==worldLoadSerial||state.mode!=='earth')return;\n  state.transitioning=false;\n  state.terrainBase=",'stale Earth completion guard');
  replace('  await refreshTerrainTiles(true);state.terrainBase=',"  const originToken=state.earthOrigin;await refreshTerrainTiles(true);if(state.mode!=='earth'||originToken!==state.earthOrigin){state.rebasing=false;return;}state.terrainBase=",'stale rebase guard');
  replace("function enterSpace(target='Earth', instant=false) {",`function enterSpace(target='Earth', instant=false) {
  ++worldLoadSerial;surfaces.reset();clearTerrain();clearBuildings();setLoading('',false);
  if(state.currentAircraft!=='shuttle')void setAircraft('shuttle',true);`,'orbit transition');
  replace("  if (!state.running) beginGame('space');","  if(!state.running){state.running=true;startScreen.classList.add('hidden');hud.classList.remove('hidden');}",'orbital start must not asynchronously overwrite the selected target');
  replace('function updateFlight(dt) {',`function updateFlight(dt) {
  if(state.mode==='surface'){surfaces.update(dt);return;}
  if(state.mode==='space'&&state.approachTarget&&surfaces.approach(dt))return;`,'surface flight dispatcher');
  replace('    flightPos.addScaledVector(forward,state.spaceVelocity*1100*dt);',`    const previousSpacePosition=flightPos.clone();
    flightPos.addScaledVector(forward,state.spaceVelocity*1100*dt);
    if(surfaces.checkApproach(previousSpacePosition))return;`,'swept planetary approach');
  replace('function updateHUD(elapsed) {',"function updateHUD(elapsed) {\n  if(state.mode==='surface'){surfaces.updateHUD();return;}", 'planet-aware instruments');
  replace("n.textContent=navigator.onLine?'ONLINE TILES':'OFFLINE CACHE';","n.textContent=state.mode==='surface'?'PLANET MAP CACHED':navigator.onLine?'ONLINE TILES':'OFFLINE CACHE';",'body-aware network status');
  replace("if(state.mode==='space')return returnToEarth();const cfg=", "if(state.mode==='surface')return surfaces.leave();if(state.mode==='space')return returnToEarth();const cfg=",'planet orbit button');
  replace("state.mode==='space' ? -200 : -35","state.mode==='space' ? -200 : -Math.max(35,(aircraftConfigs[state.currentAircraft]?.displaySize||16)*1.8)",'chase camera clears larger aircraft');
  replace("state.mode==='space'?70:12","state.mode==='space'?70:Math.max(12,(aircraftConfigs[state.currentAircraft]?.displaySize||16)*.6)",'larger aircraft camera height');
  replace("addScaledVector(forward,5).addScaledVector(up,2.2)","addScaledVector(forward,state.currentAircraft==='shuttle'?14:5).addScaledVector(up,2.2)",'Shuttle cockpit view');
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
  // v12: per-aircraft flight model, airports/runways, landing gear, takeoff & landing.
  source="import {createFlightModel} from '../flight-v11/flightmodel.mjs';\nimport {createAirports,installAirportUI} from '../flight-v11/airports.mjs';\nimport {createPhotoreal} from '../flight-v11/photoreal.mjs';\n"+source;
  replace(/renderer\.render\(scene,camera\);/,'if(state.mode===\'earth\')photoreal.update();else photoreal.stop();renderer.render(scene,camera);','photoreal tile update');
  replace(/    const max = cfg\.maxSpeed\*\(state\.boost\?1\.16:1\);[\s\S]*?if\(flightPos\.y<minY\)\{[^\n]*\n/,
`    if(fm.step(dt,cfg)){aircraftRoot.position.copy(flightPos);aircraftRoot.quaternion.copy(flightQuat);state.altitude=flightPos.y;return;}
    const previousX=flightPos.x,previousZ=flightPos.z;
    const buildingHit=!fm.onGround&&buildingCollisionAt(flightPos.x,flightPos.z,flightPos.y);
    if(buildingHit){fm.crash('BUILDING STRIKE');}
    state.currentGeo=geoFromFlight();
    state.terrainBase=terrainHeightAt(flightPos.x,flightPos.z);
`,'v12 flight model');
  replace("  await setAircraft('rafale',true);\n  window.__FLIGHT_UNIVERSE__.ready=true;",
`  await setAircraft('rafale',true);
  installAirportUI({airports,fm,state,loadTerrain,toast});fm.installUI();
  window.__FLIGHT_UNIVERSE__.airports=airports;window.__FLIGHT_UNIVERSE__.fm=fm;
  window.__FLIGHT_UNIVERSE__.ready=true;`,'v12 airport UI');
  replace('function animate(timestamp) {',
`const airports=createAirports({state,earthGroup,flightPos,localFromGeo,terrainHeightAt,toast,configs:aircraftConfigs});
const photoreal=createPhotoreal({renderer,camera,state,earthGroup,terrainTiles,buildingsGroup,terrainHeightAt,toast});
const fm=createFlightModel({state,flightPos,flightQuat,flightEuler,aircraftRoot,airports,terrainHeightAt,toast,spawnExplosion,configs:aircraftConfigs});
state.throttleUI=t=>{const f=document.getElementById('throttleFill'),k=document.getElementById('throttleKnob');if(f)f.style.height=(t*100)+'%';if(k)k.style.bottom='calc('+(t*100)+'% - 4px)';};
let v12GuideAt=0;
function updateApproachGuide(){const now=performance.now();if(now-v12GuideAt<300)return;v12GuideAt=now;let el=document.getElementById('ilsGuide');if(!el){el=document.createElement('div');el.id='ilsGuide';el.className='ils-guide';document.getElementById('hud')?.append(el);}const g=state.mode==='earth'&&!fm.onGround?airports.approachGuidance():null;if(!g||g.dist>12000){el.hidden=true;return;}el.hidden=false;const nm=(g.dist/1852).toFixed(1),d=Math.round(g.dev*3.28084);el.textContent='RWY '+g.ident+' ? '+nm+' NM ? GS '+(Math.abs(d)<60?'ON':d>0?'HIGH +'+d:'LOW '+d)+' FT';el.dataset.state=Math.abs(d)<60?'on':'off';}
function animate(timestamp) {`,'v12 systems');
  replace("function updateHUD(elapsed) {\n  if(state.mode==='surface'){surfaces.updateHUD();return;}","function updateHUD(elapsed) {\n  if(state.mode==='surface'){surfaces.updateHUD();return;}\n  updateApproachGuide();",'v12 approach guide');
  // Stall/pull-up warnings: silence PULL UP on a stabilised gear-down approach and while rolling.
  replace("if(agl<85&&state.speed>95)text='PULL UP';","if(!fm.onGround&&agl<85&&state.speed>95&&!fm.gearDown)text='PULL UP';else if(fm.onGround)text='';",'v12 warnings');
  replace("$('updateStatus').textContent='BUILD V11';","$('updateStatus').textContent='BUILD V12';",'build label');
  replace("navigator.serviceWorker.register('./sw.js?v=flight-v11')","navigator.serviceWorker.register('./sw.js?v=flight-v12')",'service worker revision v12');
  // Performance: phones get a lower default DPR ceiling; the adaptive scaler still raises it when FPS allows.
  replace('renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));',"const MOBILE_GPU=matchMedia('(pointer:coarse)').matches;renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE_GPU?1.25:1.6));",'mobile DPR');
  replace('function applyPixelRatio(){renderer.setPixelRatio(Math.min(devicePixelRatio,Math.min(2,1.65*state.quality*state.resolutionScale)));}',"function applyPixelRatio(){renderer.setPixelRatio(Math.min(devicePixelRatio,Math.min(MOBILE_GPU?1.5:2,(MOBILE_GPU?1.3:1.65)*state.quality*state.resolutionScale)));}",'mobile DPR cap');
  source=source.replaceAll('·','?').replaceAll('°','?');
  return source;
}
