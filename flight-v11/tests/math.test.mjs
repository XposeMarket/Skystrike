import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {unitAt,geoAt,localToGeo,geoToLocal,travelGeo,sampleHeight,segmentSphereEntry} from '../planet-math.mjs';
import {makeAircraftPreview} from '../aircraft.mjs';
import {mapBuildingUV} from '../buildings.mjs';
import {nearestLandmarks,buildLandmark,LANDMARKS} from '../landmarks.mjs';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('longitude convention matches Three sphere UVs',()=>{assert.deepEqual(unitAt(0,0),[1,0,-0]);near(unitAt(0,90)[2],-1);near(geoAt([0,0,-1]).lon,90);});
test('local tangent frames round-trip on both bodies, including the date line',()=>{for(const radius of [1737400,3396000])for(const origin of [{lat:0,lon:179.99},{lat:89.8,lon:-45},{lat:-43,lon:23}]){const g=travelGeo(origin,15000,-9000,radius),p=geoToLocal(origin,g,1234,radius),back=localToGeo(origin,p,radius);near(back.lat,g.lat);near(back.lon,g.lon);near(back.altitude,1234);}});
test('polar crossing remains finite and reverses longitude rather than clamping flight',()=>{const g=travelGeo({lat:89.99,lon:10},0,-2000,1737400);assert.ok(Number.isFinite(g.lat)&&g.lat<90);assert.ok(Math.abs(g.lon+170)<.1);});
test('height sampling wraps the seam and respects 0E vs -180E grids',()=>{const d=new Float32Array([0,10,20,30,0,10,20,30]);near(sampleHeight(d,4,2,0,-180,-180),15);near(sampleHeight(d,4,2,0,180,-180),15);near(sampleHeight(d,4,2,0,45,0),0);near(sampleHeight(d,4,2,0,225,0),20);});
test('swept entry catches a frame that crosses an entire small moon',()=>{near(segmentSphereEntry([-10,0,0],[10,0,0],[0,0,0],2),.4);assert.equal(segmentSphereEntry([-10,5,0],[10,5,0],[0,0,0],2),null);assert.equal(segmentSphereEntry([0,0,0],[1,0,0],[0,0,0],2),0);});
test('preview models are aircraft-specific and have valid geometry',()=>{const sizes={};for(const key of ['rafale','globalhawk','shuttle']){const g=makeAircraftPreview(key),s=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());assert.ok(s.length()>5);sizes[key]=s;}assert.ok(sizes.globalhawk.x>30);assert.ok(sizes.shuttle.z>25);assert.ok(sizes.shuttle.y>sizes.rafale.y);});
test('diagonal building wall UVs remain upright in metres',()=>{const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(10,10);shape.lineTo(20,0);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:12.8,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,150,0);mapBuildingUV(g,150,4);const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++)if(Math.abs(n.getY(i))<.5)near(uv.getY(i),p.getY(i)-150,.0001);});
test('landmarks sit on real coordinates and build a finite silhouette',()=>{
  const paris=nearestLandmarks(48.8584,2.2945,400,2);
  assert.equal(paris[0].id,'eiffel');
  assert.ok(paris[0].dist<30);
  const nyc=nearestLandmarks(40.6892,-74.0445,500,3);
  assert.equal(nyc[0].id,'liberty');
  for(const L of LANDMARKS){
    const g=buildLandmark(L);
    const box=new THREE.Box3().setFromObject(g);
    assert.ok(box.min.y>=-0.05,L.id+' min '+box.min.y);
    assert.ok(Number.isFinite(box.max.y)&&box.max.y>L.h*0.7,L.id+' max '+box.max.y);
  }
});
test('downloaded MOLA is metre elevation with the correct hemispheres',async()=>{const meta=JSON.parse(await fs.readFile('dist/assets/planets/mars.json','utf8')),b=await fs.readFile('dist/assets/planets/mars.bin'),d=new Float32Array(meta.width*meta.height);for(let i=0;i<d.length;i++)d[i]=b.readInt16LE(i*2)*meta.scale;const olympus=sampleHeight(d,meta.width,meta.height,18.65,-133.8,meta.west),hellas=sampleHeight(d,meta.width,meta.height,-42.5,70,meta.west);assert.ok(olympus>17000,`Olympus ${olympus}`);assert.ok(hellas<-5000,`Hellas ${hellas}`);});
test('Moon half-metre offset conversion and map dimensions are explicit',async()=>{const meta=JSON.parse(await fs.readFile('dist/assets/planets/moon.json','utf8'));assert.equal(meta.scale,.5);assert.equal(meta.west,-180);assert.equal(meta.width,2880);assert.ok(meta.min<-5000&&meta.max>5000);});
