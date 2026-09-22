import * as THREE from 'three';
import {clamp,wrap,degrees,geoAt,unitAt,localToGeo,geoToLocal,travelGeo,sampleHeight,segmentSphereEntry} from './planet-math.mjs';

export const SURFACE_BODIES={
  Mars:{radius:3396000,color:0xb87d58,sky:0x8b644e,dem:'mars',credit:'NASA MOLA + JPL/USGS Viking',sites:[{name:'Valles Marineris',lat:-13.5,lon:-59.2},{name:'Olympus Mons',lat:18.65,lon:-133.8},{name:'Jezero region',lat:18.38,lon:77.58}]},
  Moon:{radius:1737400,color:0xa7a49f,sky:0x020307,dem:'moon',credit:'NASA SVS / LROC + LOLA',sites:[{name:'Tycho crater',lat:-43.31,lon:-11.36},{name:'Apollo 11 region',lat:.674,lon:23.473},{name:'Copernicus crater',lat:9.62,lon:-20.08}]}
};
const $=id=>document.getElementById(id);
export function createPlanetSurfaces(api){
  const {state,renderer,scene,earthGroup,solarGroup,solarBodies,flightPos,flightQuat,aircraftRoot,camera,hemi,sunLight,toast,setLoading}=api;
  const group=new THREE.Group();group.name='mapped-planet-surface';group.visible=false;scene.add(group);
  const attribution=document.querySelector('.attribution'),earthCredit=attribution?.textContent||'';
  const cache=new Map();let generation=0,controller=null,active=null,patch=null,origin=null,cooldown=0,lastUi=0;
  const material=new THREE.MeshStandardMaterial({roughness:1,metalness:0,side:THREE.FrontSide});
  function removePatch(){if(patch){group.remove(patch);patch.geometry.dispose();patch=null;}}
  function reset(){
    generation++;controller?.abort();controller=null;state.transitioning=false;state.approachTarget=null;state.surfaceBody=null;active=null;group.visible=false;removePatch();
    if($('surfaceReadout'))$('surfaceReadout').hidden=true;
    if(attribution)attribution.textContent=earthCredit;
    $('navOverlay').style.display='';scene.background=new THREE.Color(0x01040a);scene.fog.color.setHex(0x6d8ba4);hemi.intensity=1.2;hemi.color.setHex(0xb9d9ff);sunLight.intensity=2.8;
    for(const child of scene.children)if(child.isPoints)child.visible=true;
  }
  async function asset(name,signal){
    if(cache.has(name))return cache.get(name);
    const slug=SURFACE_BODIES[name].dem;
    const read=async(path,json=false)=>{const r=await fetch(path,{signal});if(!r.ok)throw new Error(`Surface asset HTTP ${r.status}`);return json?r.json():r.arrayBuffer();};
    const [meta,bytes,color]=await Promise.all([read(`./assets/planets/${slug}.json`,true),read(`./assets/planets/${slug}.bin`),read(`./assets/planets/${slug}.jpg`)]);
    if(meta.unit!=='metre'||meta.byteOrder!=='little-endian'||bytes.byteLength!==meta.width*meta.height*2)throw new Error('Invalid planetary elevation grid');
    const view=new DataView(bytes),heights=new Float32Array(meta.width*meta.height);for(let i=0;i<heights.length;i++)heights[i]=view.getInt16(i*2,true)*meta.scale;
    const blobUrl=URL.createObjectURL(new Blob([color],{type:'image/jpeg'}));let map;
    try{map=await new THREE.TextureLoader().loadAsync(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}
    map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.wrapT=THREE.ClampToEdgeWrapping;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());map.userData.shared=true;
    if(signal.aborted){map.dispose();throw new Error('Surface load cancelled');}
    const value={meta,heights,map};cache.set(name,value);return value;
  }
  function elevation(lat,lon){return sampleHeight(active.data.heights,active.data.meta.width,active.data.meta.height,lat,lon,active.data.meta.west);}
  function buildPatch(){
    removePatch();const def=active.def,radius=def.radius,segments=state.quality>=1.25?192:state.quality<.9?96:144,extent=320000;
    const geo=new THREE.PlaneGeometry(extent,extent,segments,segments),p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=-p.getY(i),g=travelGeo(origin,x,z,radius),h=elevation(g.lat,g.lon),local=geoToLocal(origin,g,h,radius);
      p.setXYZ(i,local.x,local.y,local.z);
      // Unwrap around the patch centre rather than interpolating 359 degrees across a seam.
      const delta=wrap(g.lon-origin.lon+180,360)-180;
      uv.setXY(i,(origin.lon+180+delta)/360,(g.lat+90)/180);
    }
    p.needsUpdate=true;uv.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();
    material.map=active.data.map;material.color.setHex(0xffffff);material.needsUpdate=true;
    patch=new THREE.Mesh(geo,material);patch.name=`${active.name}-real-elevation`;group.add(patch);
  }
  function snapCamera(){
    aircraftRoot.position.copy(flightPos);aircraftRoot.quaternion.copy(flightQuat);
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(flightQuat);
    camera.position.copy(flightPos).addScaledVector(forward,-70).add(new THREE.Vector3(0,25,0));camera.up.set(0,1,0);camera.lookAt(flightPos.clone().addScaledVector(forward,120));
  }
  async function enter(name,geo=null){
    if(!SURFACE_BODIES[name]){toast('This body currently supports orbital flybys only');return false;}
    const token=++generation;controller?.abort();controller=new AbortController();const current=controller;
    state.transitioning=true;state.approachTarget=null;setLoading(`LOADING ${name.toUpperCase()} · REAL IMAGERY + ELEVATION`,true);
    let timeout;try{
      const timer=new Promise((_,reject)=>{timeout=setTimeout(()=>{current.abort();reject(new Error('Planet download timed out. Try again.'));},45000);});
      const data=await Promise.race([asset(name,current.signal),timer]);clearTimeout(timeout);if(token!==generation)return false;
      const def=SURFACE_BODIES[name],site=geo||def.sites[0];
      if(!Number.isFinite(site.lat)||!Number.isFinite(site.lon))throw new Error('Invalid surface coordinates');
      // Never reuse the Earth tile origin or its map/elevation providers for another body.
      api.clearTerrain();api.clearBuildings();earthGroup.visible=false;solarGroup.visible=false;
      active={name,def,data};origin={lat:clamp(site.lat,-89.99,89.99),lon:wrap(site.lon+180,360)-180};state.mode='surface';state.surfaceBody=name;state.spaceTarget=name;state.surfaceGeo={...origin};
      state.running=true;$('startScreen').classList.add('hidden');$('hud').classList.remove('hidden');
      group.visible=true;scene.background=new THREE.Color(def.sky);scene.fog.color.setHex(def.sky);scene.fog.density=name==='Mars'?.000006:0;hemi.intensity=name==='Mars'?.65:.28;hemi.color.setHex(name==='Mars'?0xd5b39b:0xc3d0e5);sunLight.intensity=2.5;
      for(const child of scene.children)if(child.isPoints)child.visible=name==='Moon';
      state.pitch=state.roll=state.yawAngle=0;state.heading=0;state.stickX=state.stickY=state.yaw=0;state.throttle=.35;state.speed=650;
      $('throttleFill').style.height='35%';$('throttleKnob').style.bottom='calc(35% - 4px)';
      state.terrainBase=elevation(origin.lat,origin.lon);state.altitude=state.terrainBase+6000;
      flightQuat.identity();flightPos.set(0,state.altitude,0);buildPatch();snapCamera();
      // Shuttle uses arcade reaction-control flight here, not atmospheric aerodynamic lift.
      if(state.currentAircraft!=='shuttle')void api.setAircraft('shuttle',true);
      $('navOverlay').style.display='none';$('guidanceCue').classList.add('hidden');$('spaceBtn').textContent='ORBIT';$('surfaceReadout').hidden=false;
      if(attribution)attribution.textContent=`${def.credit} · Regional global maps, not close-up imagery · Aircraft NASA`;
      cooldown=performance.now()+3000;state.transitioning=false;setLoading('',false);updateHUD();toast(`${name.toUpperCase()} SURFACE · ${site.name||'orbital entry'} · O / ORBIT to leave`);return true;
    }catch(e){clearTimeout(timeout);if(token===generation){state.transitioning=false;setLoading('',false);toast(`Surface unavailable · ${e.message||e}`);}return false;}
  }
  function update(dt){
    if(!active||state.transitioning)return;
    const blend=1-Math.exp(-dt*4);state.roll=THREE.MathUtils.lerp(state.roll,-state.stickX*1.05,blend);state.pitch=THREE.MathUtils.lerp(state.pitch,state.stickY*1.15,blend);
    state.yawAngle+=(-state.yaw*.75+Math.sin(state.roll)*.6-state.stickX*.18)*dt;
    flightQuat.setFromEuler(new THREE.Euler(state.pitch,state.yawAngle,state.roll,'YXZ'));
    const speed=state.throttle*(state.boost?5200:1600);state.speed=THREE.MathUtils.lerp(state.speed,speed,1-Math.exp(-dt*1.4));
    flightPos.addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(flightQuat),state.speed*dt);
    const g=localToGeo(origin,flightPos,active.def.radius),ground=elevation(g.lat,g.lon);
    if(g.altitude<ground+18){const p=geoToLocal(origin,g,ground+18,active.def.radius);flightPos.set(p.x,p.y,p.z);g.altitude=ground+18;state.pitch=Math.max(0,state.pitch);state.speed*=.98;}
    state.surfaceGeo={lat:g.lat,lon:g.lon};state.altitude=g.altitude;state.terrainBase=ground;state.heading=wrap(degrees(-state.yawAngle),360);
    if(Math.hypot(flightPos.x,flightPos.z)>16000){origin={lat:g.lat,lon:g.lon};flightPos.set(0,g.altitude,0);buildPatch();snapCamera();}
    aircraftRoot.position.copy(flightPos);aircraftRoot.quaternion.copy(flightQuat);
    if(g.altitude-ground>90000){leave();return;}
    if(performance.now()-lastUi>180){lastUi=performance.now();updateHUD();}
  }
  function leave(){
    if(!active)return;
    const name=active.name,geo=state.surfaceGeo||origin;
    api.enterOrbit(name);const body=solarBodies.get(name);body.mesh.updateWorldMatrix(true,false);
    const dir=new THREE.Vector3(...unitAt(geo.lat,geo.lon)).transformDirection(body.mesh.matrixWorld);
    const center=body.mesh.getWorldPosition(new THREE.Vector3()),r=body.mesh.geometry.parameters.radius;
    flightPos.copy(center).addScaledVector(dir,r*1.45+100);aim(dir);state.spaceVelocity=.3;cooldown=performance.now()+5000;snapCamera();toast(`${name.toUpperCase()} ORBIT · Solar tab to choose another world`);
  }
  function aim(direction){state.yawAngle=Math.atan2(-direction.x,-direction.z);state.pitch=Math.asin(clamp(direction.y,-1,1));state.roll=0;flightQuat.setFromEuler(new THREE.Euler(state.pitch,state.yawAngle,0,'YXZ'));}
  function checkApproach(previous){
    if(state.mode!=='space'||state.transitioning||performance.now()<cooldown)return false;
    let hit=null;const a=previous.toArray(),b=flightPos.toArray();
    solarBodies.forEach(body=>{body.mesh.updateWorldMatrix(true,false);const center=body.mesh.getWorldPosition(new THREE.Vector3()),r=body.mesh.geometry.parameters.radius*1.07;const t=segmentSphereEntry(a,b,center.toArray(),r);if(t!==null&&(!hit||t<hit.t))hit={body,center,r,t};});
    if(!hit)return false;
    const {body,center,r,t}=hit,name=body.def.name;
    const point=previous.clone().lerp(flightPos,t),local=body.mesh.worldToLocal(point.clone()),geo=geoAt(local.toArray());
    flightPos.copy(point);state.approachTarget=null;
    if(SURFACE_BODIES[name]){cooldown=performance.now()+5000;void enter(name,geo);return true;}
    if(name==='Earth'){cooldown=performance.now()+5000;void api.returnEarth(geo);return true;}
    const outward=point.sub(center).normalize();flightPos.copy(center).addScaledVector(outward,r+80);aim(outward);state.spaceVelocity=.15;cooldown=performance.now()+5000;toast(`${name}: orbital flyby only · no mapped surface in this build`);return true;
  }
  function approach(dt){
    const name=state.approachTarget,body=solarBodies.get(name);if(!body)return false;
    if(state.stickX||state.stickY||state.yaw){state.approachTarget=null;toast('Approach assist disengaged');return false;}
    const previous=flightPos.clone(),center=body.mesh.getWorldPosition(new THREE.Vector3()),delta=center.sub(flightPos),distance=delta.length(),dir=delta.normalize();
    const radius=body.mesh.geometry.parameters.radius,speed=clamp((distance-radius)*1.3,90,6500);aim(dir);flightPos.addScaledVector(dir,Math.min(speed*dt,Math.max(0,distance-radius*.99)));state.speed=speed;state.heading=wrap(degrees(-state.yawAngle),360);
    checkApproach(previous);aircraftRoot.position.copy(flightPos);aircraftRoot.quaternion.copy(flightQuat);return true;
  }
  function updateHUD(){
    if(!active)return;const name=active.name,g=state.surfaceGeo||origin;
    $('modeText').textContent=`${name.toUpperCase()} SURFACE`;$('locationText').textContent=`${Math.abs(g.lat).toFixed(3)}° ${g.lat>=0?'N':'S'} · ${Math.abs(g.lon).toFixed(3)}° ${g.lon>=0?'E':'W'}`;
    $('speedText').textContent=Math.round(state.speed).toLocaleString();$('speedUnit').textContent='M/S';$('altText').textContent=(Math.max(0,state.altitude-state.terrainBase)/1000).toFixed(2);$('altUnit').textContent='KM AGL';$('headingText').textContent=String(Math.round(state.heading)).padStart(3,'0');$('thrText').textContent=Math.round(state.throttle*100);$('aglText').textContent=Math.round(Math.max(0,state.altitude-state.terrainBase)*3.28084).toLocaleString();
    $('surfaceReadout').textContent=`${name.toUpperCase()} · REGIONAL MAP / ${active.data.meta.pixelsPerDegree} PX/DEG ELEVATION\n${active.def.credit}\nArcade spacecraft controls · climb 90 km AGL to orbit`;
    $('networkStatus').textContent='PLANET MAP CACHED';$('flightWarning').classList.remove('show');
  }
  function installUI(){
    const readout=document.createElement('div');readout.id='surfaceReadout';readout.hidden=true;readout.className='surface-readout';$('hud').append(readout);
    const section=document.createElement('section');section.className='surface-destinations';section.innerHTML='<div class="subhead">EXPLORE MAPPED SURFACES</div><p class="source-note">Mars and Moon use real global imagery and elevation. Regional detail is lower than Earth. Other bodies currently support orbital flybys only.</p>';
    for(const [name,def] of Object.entries(SURFACE_BODIES))for(const site of def.sites){const b=document.createElement('button');b.className='card';b.dataset.surface=name;b.textContent=`${name} · ${site.name} ↘`;b.addEventListener('click',()=>{$('panel').classList.remove('open');void enter(name,site);});section.append(b);}
    const approachBtn=document.createElement('button');approachBtn.id='approachTargetBtn';approachBtn.className='wide-btn';approachBtn.textContent='APPROACH CURRENT ORBIT TARGET';approachBtn.addEventListener('click',()=>{if(state.mode!=='space'){toast('Choose an orbital destination below first');return;}state.approachTarget=state.spaceTarget;$('panel').classList.remove('open');toast(`Approach assist · ${state.spaceTarget} · steer to cancel`);});section.append(approachBtn);$('tab-solar').prepend(section);
  }
  return {enter,leave,reset,update,checkApproach,approach,updateHUD,installUI,get active(){return active?.name||null;},get patch(){return patch;},elevation,get origin(){return origin;},get cachedBodies(){return [...cache.keys()];}};
}
