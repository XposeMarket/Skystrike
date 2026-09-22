import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// A failed download must never leave an invisible vehicle or masquerade as a jet.
export function makeAircraftPreview(key) {
  const g=new THREE.Group();g.name=`${key}-flight-preview`;
  const white=new THREE.MeshStandardMaterial({color:0xe1e5e4,roughness:.52,metalness:.16});
  const dark=new THREE.MeshStandardMaterial({color:0x20272e,roughness:.74});
  const glass=new THREE.MeshStandardMaterial({color:0x243b4a,roughness:.16,metalness:.45});
  const part=(geo,mat,pos,rot)=>{const m=new THREE.Mesh(geo,mat);if(pos)m.position.set(...pos);if(rot)m.rotation.set(...rot);g.add(m);return m;};
  if(key==='shuttle'){
    part(new THREE.CapsuleGeometry(2.25,23,8,20),white,[0,0,0],[Math.PI/2,0,0]);
    part(new THREE.BoxGeometry(3.8,.32,22),dark,[0,-1.75,0]);
    const s=new THREE.Shape();s.moveTo(0,-8);s.lineTo(11,10);s.lineTo(0,7);s.lineTo(-11,10);s.closePath();
    const wing=new THREE.ExtrudeGeometry(s,{depth:.45,bevelEnabled:false});wing.rotateX(Math.PI/2);part(wing,white,[0,-1,0]);
    part(new THREE.BoxGeometry(.4,7,5),white,[0,3.2,10]);
    part(new THREE.SphereGeometry(2.15,16,10),glass,[0,.9,-10]).scale.set(1,.45,1.4);
    for(const [x,y] of [[-1.3,-.3],[1.3,-.3],[0,1.5]])part(new THREE.CylinderGeometry(.6,1,2,14),dark,[x,y,13],[Math.PI/2,0,0]);
  } else if(key==='globalhawk'){
    part(new THREE.CapsuleGeometry(.85,11,8,16),white,[0,0,0],[Math.PI/2,0,0]);
    part(new THREE.SphereGeometry(1.1,16,10),white,[0,.45,-4]).scale.set(1,1.1,1.8);
    part(new THREE.BoxGeometry(35,.22,1.8),white,[0,0,1]);
    for(const side of [-1,1])part(new THREE.BoxGeometry(.18,3.3,1.8),white,[side*1.4,1.1,5],[0,0,-side*.65]);
    part(new THREE.CylinderGeometry(.6,.6,3,16),dark,[0,.8,3],[Math.PI/2,0,0]);
  } else {
    part(new THREE.CapsuleGeometry(.7,9,8,16),white,[0,0,0],[Math.PI/2,0,0]);
    const s=new THREE.Shape();s.moveTo(0,-3);s.lineTo(5,4);s.lineTo(-5,4);s.closePath();const wing=new THREE.ExtrudeGeometry(s,{depth:.2,bevelEnabled:false});wing.rotateX(Math.PI/2);part(wing,white);
    part(new THREE.BoxGeometry(.2,2.8,2.5),white,[0,1,4]);part(new THREE.SphereGeometry(.7,16,8),glass,[0,.7,-2]).scale.set(1,.7,2);
  }
  return g;
}
function dispose(root){const gs=new Set(),ms=new Set(),ts=new Set(),images=new Set();root?.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>{if(t.image?.close)images.add(t.image);t.dispose();});images.forEach(i=>i.close());}

export function createAircraftManager({state,configs,root,toast,onChange=()=>{}}) {
  // Both NASA GLBs require KHR_draco_mesh_compression. Serve the matching decoder
  // alongside the models, and share a bounded worker pool between selections.
  const draco=new DRACOLoader().setDecoderPath('./assets/draco/').setWorkerLimit(2);
  const loader=new GLTFLoader().setDRACOLoader(draco);let serial=0,visual=null,abort=null;
  const status={key:null,phase:'idle',source:null,error:null};
  const update=(phase,source=null,error=null)=>{Object.assign(status,{key:state.currentAircraft,phase,source,error});onChange({...status});};
  function swap(next){if(visual){root.remove(visual);dispose(visual);}visual=next;root.add(next);}
  async function select(key,silent=false){
    const cfg=configs[key];if(!cfg)return {phase:'invalid'};
    if(state.mode!=='earth'&&!cfg.space){if(!silent)toast(`${cfg.name} is atmospheric only`);return {phase:'rejected'};}
    const token=++serial;abort?.abort();abort=new AbortController();const controller=abort;
    state.currentAircraft=key;state.speed=Math.min(state.speed||cfg.cruise,cfg.cruise);
    document.querySelectorAll('[data-aircraft]').forEach(el=>el.classList.toggle('active',el.dataset.aircraft===key));
    swap(makeAircraftPreview(key));update('loading');if(!silent)toast(`Loading ${cfg.name} · flight controls remain available`);
    let lastError;
    const urls=key==='rafale'?['./assets/models/rafale/Rafale.gltf']: [`./assets/models/${key}.glb`];
    for(const url of urls){
      let timeout;try{
        const timed=new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('Model load timed out'));},15000);});
        const task=(async()=>{
          const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
          const bytes=await response.arrayBuffer();
          if(!url.endsWith('.gltf')&&(bytes.byteLength<20||new DataView(bytes).getUint32(0,true)!==0x46546c67))throw new Error('Invalid GLB asset');
          const base=new URL('.',new URL(url,location.href)).href;
          const gltf=await loader.parseAsync(bytes,base);
          if(token!==serial||controller.signal.aborted){dispose(gltf.scene);return null;}
          return gltf.scene;
        })();
        const raw=await Promise.race([task,timed]);clearTimeout(timeout);
        if(!raw)return {phase:'superseded'};
        raw.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(raw),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        if(!Number.isFinite(size.length())||size.length()<.0001){dispose(raw);throw new Error('Empty aircraft model');}
        const wrapper=new THREE.Group();wrapper.name=`${key}-model`;raw.position.sub(center);wrapper.add(raw);wrapper.scale.setScalar(cfg.displaySize/Math.max(size.x,size.y,size.z));
        // Shuttle D is +X forward, +Z up, unlike the Y-up fighter/drone assets.
        wrapper.rotation.set(...(key==='shuttle'?[-Math.PI/2,0,Math.PI/2]:cfg.rotation));
        wrapper.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
        if(token!==serial){dispose(wrapper);return {phase:'superseded'};}
        swap(wrapper);update('ready',url);if(!silent)toast(`${cfg.name} ready`);return {...status};
      }catch(e){clearTimeout(timeout);lastError=String(e.message||e);if(token!==serial)return {phase:'superseded'};}
    }
    update('preview',null,lastError);if(!silent)toast(`${cfg.name} · preview model active. Retry in Aircraft.`);return {...status};
  }
  return {select,status,get visual(){return visual;},dispose(){++serial;abort?.abort();dispose(visual);draco.dispose();visual=null;}};
}
