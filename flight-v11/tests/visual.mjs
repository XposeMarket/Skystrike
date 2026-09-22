import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('test-results',{recursive:true});
const server=spawn('python3',['-m','http.server','4174','-d','dist'],{stdio:'ignore'});
let browser;
try {
  for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:4174')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4174',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FLIGHT_UNIVERSE__?.ready,{},{timeout:60000});
  const result=await page.evaluate(()=>{
    const a=window.__FLIGHT_UNIVERSE__;a.state.paused=true;a.state.running=false;a.state.vegetation=false;a.state.terrainBase=0;
    document.querySelectorAll('#startScreen,#hud,#loading,#toast').forEach(e=>e.style.display='none');
    a.scene.children.forEach(c=>{if(!c.isLight)c.visible=false;});a.scene.background.setHex(0xaabac6);a.scene.fog.density=0;
    const o=a.state.earthOrigin,mLon=111320*Math.cos(o.lat*Math.PI/180),geo=(x,z)=>({lat:o.lat-z/111320,lon:o.lon+x/mLon});
    const box=(id,x,z,w,d,h,tags)=>({id,tags:{building:'yes',height:String(h),...tags},geometry:[[x,z],[x+w,z],[x+w,z+d],[x,z+d],[x,z]].map(v=>geo(...v))});
    const g=a.makeBuildingTile(123,123,[
      box(501,-42,-18,22,28,22,{building:'apartments','building:material':'brick'}),
      box(502,-9,-20,23,30,54,{building:'commercial','building:material':'glass'}),
      box(503,27,-12,25,35,15,{building:'warehouse'})
    ]);
    g.name='material-inspection-fixture';a.scene.add(g);a.camera.position.set(105,78,123);a.camera.up.set(0,1,0);a.camera.lookAt(0,22,0);a.camera.fov=48;a.camera.updateProjectionMatrix();
    return {buildings:g.userData.buildingCount,atlases:a.facadeAtlasCount()};
  });
  assert.equal(result.buildings,3);
  await page.waitForTimeout(350);await page.screenshot({path:'test-results/05-building-material-fixture.png'});
  await fs.writeFile('test-results/visual.json',JSON.stringify({fixture:'Synthetic building footprints for inspecting actual in-game wall/roof materials; not an aerial view of a real city.',...result,errors},null,2));
  assert.deepEqual(errors,[]);
} finally {await browser?.close();server.kill();}
