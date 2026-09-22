import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('test-results',{recursive:true});
const server=spawn('python3',['-m','http.server','4173','-d','dist'],{stdio:'ignore'});
const origin='http://127.0.0.1:4173';let browser;
const report={checks:[],pageErrors:[],console:[]};
async function check(name,fn){await fn();report.checks.push({name,passed:true});console.log('PASS',name);}
try{
  for(let n=0;n<30;n++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('fu:quality','.75');localStorage.setItem('fu:autoQuality','0');localStorage.setItem('fu:audio','0');});
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__FLIGHT_UNIVERSE__?.ready,{},{timeout:90000});
  await page.screenshot({path:'test-results/01-launch.png'});
  await check('Rafale, Global Hawk and Shuttle load real local models',async()=>{
    for(const key of ['rafale','globalhawk','shuttle']){
      const result=await page.evaluate(async key=>{const a=window.__FLIGHT_UNIVERSE__;const status=await a.setAircraft(key);let meshes=0;a.aircraftManager.visual.traverse(o=>{if(o.isMesh)meshes++;});return {status,meshes,name:a.aircraftManager.visual.name};},key);
      assert.equal(result.status.phase,'ready',JSON.stringify(result));assert.ok(result.meshes>0);assert.equal(result.name,key+'-model');
      report.checks.push({name:key,passed:true,...result});
    }
  });
  await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__;a.state.running=true;a.state.paused=true;document.getElementById('startScreen').classList.add('hidden');document.getElementById('hud').classList.remove('hidden');});
  await check('Mars loads actual surface geometry and metre elevations',async()=>{
    const result=await page.evaluate(async()=>{const a=window.__FLIGHT_UNIVERSE__,entered=await a.surfaces.enter('Mars',{lat:-13.5,lon:-59.2,name:'Valles Marineris'});return {entered,mode:a.state.mode,vertices:a.surfaces.patch.geometry.attributes.position.count,height:a.surfaces.elevation(18.65,-133.8)};});
    assert.equal(result.entered,true);assert.equal(result.mode,'surface');assert.ok(result.vertices>8000);assert.ok(result.height>17000);await page.screenshot({path:'test-results/02-mars.png'});
  });
  await check('Terrain collision clearance and floating-origin rebasing',async()=>{
    const result=await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__;a.flightPos.y=-25000;a.surfaces.update(.02);const agl=a.state.altitude-a.state.terrainBase;a.flightPos.x=20000;a.surfaces.update(.02);return {agl,x:a.flightPos.x,z:a.flightPos.z,geo:a.state.surfaceGeo};});assert.ok(result.agl>=17.9);assert.ok(Math.hypot(result.x,result.z)<1);assert.ok(Number.isFinite(result.geo.lon));
  });
  await check('Pause freezes the flight position',async()=>{const before=await page.evaluate(()=>window.__FLIGHT_UNIVERSE__.flightPos.toArray());await page.waitForTimeout(400);const after=await page.evaluate(()=>window.__FLIGHT_UNIVERSE__.flightPos.toArray());assert.deepEqual(before,after);});
  await check('Moon map, distinct lighting, and orbital return',async()=>{
    assert.equal(await page.evaluate(()=>window.__FLIGHT_UNIVERSE__.surfaces.enter('Moon',{lat:-43.31,lon:-11.36,name:'Tycho'})),true);await page.screenshot({path:'test-results/03-moon.png'});
    const r=await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__;a.surfaces.leave();return {mode:a.state.mode,target:a.state.spaceTarget,active:a.surfaces.active,finite:a.flightPos.toArray().every(Number.isFinite)};});assert.equal(r.mode,'space');assert.equal(r.target,'Moon');assert.equal(r.active,null);assert.ok(r.finite);
  });
  await check('Latest aircraft selection wins asynchronous races',async()=>{
    const r=await page.evaluate(async()=>{const a=window.__FLIGHT_UNIVERSE__;a.state.mode='earth';await Promise.all([a.setAircraft('shuttle'),a.setAircraft('globalhawk')]);return {key:a.state.currentAircraft,phase:a.aircraftManager.status.phase,name:a.aircraftManager.visual.name};});assert.deepEqual(r,{key:'globalhawk',phase:'ready',name:'globalhawk-model'});
  });
  await check('A failed Shuttle request keeps a labeled Shuttle preview and supports retry',async()=>{
    await page.route('**/assets/models/shuttle.glb',route=>route.fulfill({status:503,body:'test model outage'}));
    const result=await page.evaluate(()=>window.__FLIGHT_UNIVERSE__.setAircraft('shuttle'));assert.equal(result.phase,'preview');assert.ok((await page.locator('#modelLoadStatus').textContent()).includes('PREVIEW'));
    await page.unroute('**/assets/models/shuttle.glb');await page.locator('#retryAircraftBtn').dispatchEvent('click');await page.waitForFunction(()=>window.__FLIGHT_UNIVERSE__.aircraftManager.status.phase==='ready',{},{timeout:20000});
  });
  await check('Swept orbital entry hands off to Mars instead of flying through it',async()=>{
    await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__;a.enterSpace('Mars',true);});await page.waitForTimeout(5200);
    const didHit=await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__,m=a.solarBodies.get('Mars').mesh;m.updateWorldMatrix(true,false);const c=m.getWorldPosition(a.flightPos.clone()),r=m.geometry.parameters.radius,previous=c.clone();previous.x+=r*2;a.flightPos.copy(c);a.flightPos.x-=r*2;return a.surfaces.checkApproach(previous);});assert.equal(didHit,true);await page.waitForFunction(()=>window.__FLIGHT_UNIVERSE__.state.mode==='surface',{},{timeout:15000});
  });
  await check('Building wall and roof materials use bounded shared atlases',async()=>{
    const r=await page.evaluate(()=>{const a=window.__FLIGHT_UNIVERSE__;a.state.vegetation=false;const g=a.state.earthOrigin,els=[{id:1001,tags:{building:'commercial',height:'24'},geometry:[{lat:g.lat,lon:g.lon},{lat:g.lat,lon:g.lon+.0002},{lat:g.lat+.0002,lon:g.lon+.0002},{lat:g.lat+.0002,lon:g.lon},{lat:g.lat,lon:g.lon}]}];const t=a.makeBuildingTile(0,0,els);const mats=t.children.filter(c=>c.isMesh).flatMap(c=>c.material);return {mats:mats.length,shared:mats.every(m=>m.map.userData.shared),repeat:mats.map(m=>m.map.repeat.toArray()),count:a.facadeAtlasCount()};});assert.ok(r.mats>=2);assert.ok(r.shared);assert.ok(r.count<=8);assert.ok(r.repeat.some(v=>Math.abs(v[1]-1/12.8)<1e-8));
  });
  await check('Mobile hangar and planet destination controls fit the screen',async()=>{
    await page.setViewportSize({width:844,height:390});await page.locator('#menuBtn').dispatchEvent('click');await page.locator('[data-tab="solar"]').dispatchEvent('click');assert.equal(await page.locator('[data-surface="Mars"]').count(),3);assert.equal(await page.locator('[data-surface="Moon"]').count(),3);await page.screenshot({path:'test-results/04-mobile-destinations.png'});
  });
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=String(e.stack||e);console.error(e);process.exitCode=1;}finally{await fs.writeFile('test-results/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill();}
