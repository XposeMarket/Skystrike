const VERSION = 'loader-v8-hd-terrain-facades';
const PARTS = [
  'app-part-00.txt',
  'app-part-01.txt',
  'app-part-02.txt',
  'app-part-03.txt',
  'app-part-04.txt',
];

const REMOTE_BASE = 'https://raw.githubusercontent.com/XposeMarket/Skystrike/flight-universe-pwa/';

async function loadPart(name) {
  const response = await fetch(`${REMOTE_BASE}${name}?v=${VERSION}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load flight source ${name}: ${response.status}`);
  return response.text();
}

function normalizeChunk(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
}

function repairChunkBoundaries(source) {
  return source.replace(/THREE\.B\s+ufferGeometry/g, 'THREE.BufferGeometry');
}

function modernizeTimer(source) {
  if (!source.includes('const clock = new THREE.Clock();')) return source;
  return source
    .replace('const clock = new THREE.Clock();', 'const timer = new THREE.Timer();\ntimer.connect(document);')
    .replaceAll('clock.getDelta()', 'timer.getDelta()')
    .replaceAll('clock.elapsedTime', 'timer.getElapsed()')
    .replace('function animate() {\n  requestAnimationFrame(animate);', 'function animate(timestamp) {\n  requestAnimationFrame(animate);\n  timer.update(timestamp);');
}

function upgradeTerrain(source) {
  source = source.replace('terrainZoom: 12,', 'terrainZoom: 14,');
  source = source.replace(
    '  const seg=detail ? 56 : 28;',
    '  const detailLevel=Number(detail)||0;\n  const seg=detailLevel>=3?128:detailLevel===2?96:detailLevel===1?72:48;',
  );
  source = source.replace(
    '  const ez=Math.min(z,15), shift=Math.max(0,z-15);\n  const elevation=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ez}/${serverX >> shift}/${serverY >> shift}.png`;',
    '  const ez=Math.min(z,15), shift=Math.max(0,z-15), elevationScale=2**shift;\n  const elevationParentX=serverX >> shift, elevationParentY=serverY >> shift;\n  const elevationChildX=serverX-(elevationParentX<<shift), elevationChildY=serverY-(elevationParentY<<shift);\n  const elevation=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ez}/${elevationParentX}/${elevationParentY}.png`;',
  );
  source = source.replace(
    "      const px=Math.max(0,Math.min(data.width-1,Math.floor(vx*(data.width-1))));\n      const py=Math.max(0,Math.min(data.height-1,Math.floor(vy*(data.height-1))));",
    "      const eu=(elevationChildX+vx)/elevationScale, ev=(elevationChildY+vy)/elevationScale;\n      const px=Math.max(0,Math.min(data.width-1,Math.floor(eu*(data.width-1))));\n      const py=Math.max(0,Math.min(data.height-1,Math.floor(ev*(data.height-1))));",
  );
  source = source.replace(
    '  const schedules=[{z,radius,detail:false},{z:z+1,radius:0,detail:true}];',
    '  const schedules=[{z,radius,detail:0},{z:z+1,radius:1,detail:1}];\n  if(state.quality>=.95)schedules.push({z:z+2,radius:1,detail:2});\n  if(state.quality>=1.25)schedules.push({z:z+3,radius:0,detail:3});\n  const scheduleByZoom=new Map(schedules.map(s=>[s.z,s.radius]));',
  );
  source = source.replace(
    '    const keepRadius=level===z?radius+1:1;',
    '    const keepRadius=(scheduleByZoom.get(level)??0)+1;',
  );
  source = source.replace(
    '  const mat=new THREE.MeshStandardMaterial({map:texture,color:texture?0xffffff:0x3a463b,roughness:.96,metalness:0,polygonOffset:detail,polygonOffsetFactor:detail?-1:0,polygonOffsetUnits:detail?-1:0});',
    '  const mat=new THREE.MeshStandardMaterial({map:texture,color:texture?0xffffff:0x3a463b,roughness:.93,metalness:0,polygonOffset:detailLevel>0,polygonOffsetFactor:detailLevel?-detailLevel:0,polygonOffsetUnits:detailLevel?-detailLevel:0});',
  );
  source = source.replace(
    '  mesh.userData={tx,ty,z,size:tileMeters,seg,heights,avgHeight:count?sum/count:0,detail};',
    '  mesh.renderOrder=detailLevel;\n  mesh.userData={tx,ty,z,size:tileMeters,seg,heights,avgHeight:count?sum/count:0,detail:detailLevel};',
  );

  const terrainHeight = [
    'function terrainHeightAt(x,z){',
    '  let best=null;',
    '  for(const mesh of terrainTileMap.values()){',
    '    const {size}=mesh.userData;',
    '    const u=(x-(mesh.position.x-size/2))/size;',
    '    const v=(z-(mesh.position.z-size/2))/size;',
    '    if(u<0||u>1||v<0||v>1)continue;',
    '    if(!best||mesh.userData.z>best.mesh.userData.z)best={mesh,u,v};',
    '  }',
    '  if(!best)return state.terrainBase||0;',
    '  const {mesh,u,v}=best,{seg,heights}=mesh.userData;',
    '  const gx=THREE.MathUtils.clamp(u*seg,0,seg),gy=THREE.MathUtils.clamp(v*seg,0,seg);',
    '  const x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(seg,x0+1),y1=Math.min(seg,y0+1);',
    '  const fx=gx-x0,fy=gy-y0,idx=(xx,yy)=>yy*(seg+1)+xx;',
    '  const h00=heights[idx(x0,y0)],h10=heights[idx(x1,y0)],h01=heights[idx(x0,y1)],h11=heights[idx(x1,y1)];',
    '  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00,h10,fx),THREE.MathUtils.lerp(h01,h11,fx),fy);',
    '}',
  ].join('\n');
  source = source.replace(
    /function terrainHeightAt\(x,z\)\{[\s\S]*?\n\}\n\nasync function refreshTerrainTiles/,
    `${terrainHeight}\n\nasync function refreshTerrainTiles`,
  );
  return source;
}

function upgradeBuildings(source) {
  const materialFunctions = [
    'function makeFacadeTexture(kind) {',
    "  const palettes={default:['#b7b0a3','#253746'],glass:['#8bb5c1','#173746'],brick:['#a56d56','#263746'],industrial:['#848d91','#263238']};",
    '  const [base,glass]=palettes[kind]||palettes.default;',
    "  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;",
    "  const ctx=canvas.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,512,512);",
    "  const grain=ctx.createImageData(512,512);for(let i=0;i<grain.data.length;i+=4){const n=18+Math.random()*22;grain.data[i]=n;grain.data[i+1]=n;grain.data[i+2]=n;grain.data[i+3]=kind==='glass'?10:18;}ctx.putImageData(grain,0,0);",
    "  if(kind==='brick'){ctx.strokeStyle='rgba(63,29,20,.38)';ctx.lineWidth=2;for(let y=0;y<512;y+=18){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();const offset=(Math.floor(y/18)%2)*26;for(let x=-offset;x<512;x+=52){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+18);ctx.stroke();}}}",
    "  if(kind==='industrial'){ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;for(let x=0;x<512;x+=18){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}}",
    "  if(kind==='glass'){const g=ctx.createLinearGradient(0,0,512,0);g.addColorStop(0,'rgba(180,230,245,.18)');g.addColorStop(.5,'rgba(255,255,255,.34)');g.addColorStop(1,'rgba(67,118,143,.18)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);}",
    '  const cols=kind===\'industrial\'?3:4,rows=7,bayW=512/cols,floorH=512/rows;',
    "  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const padX=kind==='industrial'?18:12,padY=kind==='industrial'?17:12,x=c*bayW+padX,y=r*floorH+padY,w=bayW-padX*2,h=floorH-padY*2;if(kind==='brick'||kind==='default'){ctx.fillStyle='rgba(30,27,25,.42)';ctx.fillRect(x-4,y-4,w+8,h+8);}const wg=ctx.createLinearGradient(x,y,x,y+h);wg.addColorStop(0,'rgba(190,225,238,.72)');wg.addColorStop(.45,glass);wg.addColorStop(1,'rgba(8,20,30,.86)');ctx.fillStyle=wg;ctx.fillRect(x,y,w,h);ctx.fillStyle='rgba(235,247,252,.32)';ctx.fillRect(x+2,y+2,w-4,2);ctx.fillStyle='rgba(5,12,18,.42)';ctx.fillRect(x+w*.49,y,2,h);}",
    "  ctx.fillStyle='rgba(20,24,27,.42)';ctx.fillRect(0,492,512,20);",
    '  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(kind===\'industrial\'?.045:.075,.22);texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());return texture;',
    '}',
    'function makeRoofTexture(kind){',
    "  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');",
    "  const base=kind==='industrial'?'#727a7e':kind==='glass'?'#7c8588':'#4b5054';ctx.fillStyle=base;ctx.fillRect(0,0,512,512);",
    "  if(kind==='industrial'){ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=3;for(let x=0;x<512;x+=22){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}}else if(kind==='glass'){ctx.fillStyle='rgba(230,235,232,.18)';for(let y=20;y<512;y+=84)for(let x=20;x<512;x+=84)ctx.fillRect(x,y,48,48);}else{ctx.strokeStyle='rgba(12,15,17,.5)';ctx.lineWidth=2;for(let y=0;y<512;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();for(let x=(Math.floor(y/20)%2)*18;x<512;x+=36){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+12,y+20);ctx.stroke();}}}",
    "  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(.045,.045);t.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());return t;",
    '}',
    'function makeBuildingMaterial(kind) {',
    "  return new THREE.MeshStandardMaterial({map:makeFacadeTexture(kind),color:0xffffff,roughness:kind==='glass'?.27:.78,metalness:kind==='glass'?.2:kind==='industrial'?.12:.02,side:THREE.DoubleSide,depthTest:true,depthWrite:true});",
    '}',
    'function makeRoofMaterial(kind){',
    "  return new THREE.MeshStandardMaterial({map:makeRoofTexture(kind),color:0xffffff,roughness:kind==='glass'?.62:.9,metalness:kind==='industrial'?.18:.03,side:THREE.DoubleSide,depthTest:true,depthWrite:true});",
    '}',
  ].join('\n');

  source = source.replace(
    /function makeFacadeTexture\(kind\) \{[\s\S]*?\n\}\nfunction makeBuildingMaterial\(kind\) \{[\s\S]*?\n\}/,
    materialFunctions,
  );

  const buildingTile = [
    'function makeBuildingTile(tx, ty, elements) {',
    '  const groups = { default: [], glass: [], brick: [], industrial: [] };',
    '  const colliders = [];',
    '  let accepted = 0;',
    '  for (const way of elements) {',
    '    if (accepted >= BUILDING_TILE_LIMIT || !way.geometry || way.geometry.length < 4) continue;',
    '    try {',
    '      const points = way.geometry.map(point => localFromGeo(point.lat, point.lon));',
    '      let area = 0, cx = 0, cz = 0;',
    '      for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a.x * b.z - b.x * a.z; cx += a.x; cz += a.z; }',
    '      area = Math.abs(area) * .5; cx /= points.length; cz /= points.length;',
    '      if (!Number.isFinite(area) || area < 12) continue;',
    '      const shape = new THREE.Shape(); shape.moveTo(points[0].x, -points[0].z);',
    '      for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].z); shape.closePath();',
    '      const tags = way.tags || {}, height = parseBuildingHeight(tags, area, Number(way.id) || accepted);',
    '      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });',
    '      geometry.rotateX(-Math.PI / 2); geometry.translate(0, terrainHeightAt(cx, cz) + .25, 0);',
    '      groups[buildingKind(tags, height)].push(geometry);',
    '      const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));',
    '      colliders.push({polygon:points.map(p=>({x:p.x,z:p.z})),minX,maxX,minZ,maxZ,base:terrainHeightAt(cx,cz),top:terrainHeightAt(cx,cz)+height});',
    '      accepted++;',
    '    } catch {}',
    '  }',
    '  const group = new THREE.Group(); group.name = `osm-buildings-${BUILDING_ZOOM}-${tx}-${ty}`;',
    '  for (const [kind, geometries] of Object.entries(groups)) {',
    '    if (!geometries.length) continue;',
    '    const merged = new THREE.BufferGeometry(); let vertexOffset = 0;',
    '    const positionArrays = [], normalArrays = [], uvArrays = [], roofIndices = [], wallIndices = [];',
    '    for (const geometry of geometries) {',
    "      const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');",
    '      positionArrays.push(position.array); if(normal)normalArrays.push(normal.array); if(uv)uvArrays.push(uv.array);',
    '      const index=geometry.getIndex(), localIndex=index?Array.from(index.array):Array.from({length:position.count},(_,i)=>i);',
    '      if(geometry.groups?.length){',
    '        for(const part of geometry.groups){const target=part.materialIndex===0?roofIndices:wallIndices;for(let i=part.start;i<part.start+part.count;i++)target.push(localIndex[i]+vertexOffset);}',
    '      } else { for(const value of localIndex)wallIndices.push(value+vertexOffset); }',
    '      vertexOffset += position.count; geometry.dispose();',
    '    }',
    "    merged.setAttribute('position',new THREE.Float32BufferAttribute(Float32Array.from(positionArrays.flatMap(a=>Array.from(a))),3));",
    "    if(normalArrays.length===geometries.length)merged.setAttribute('normal',new THREE.Float32BufferAttribute(Float32Array.from(normalArrays.flatMap(a=>Array.from(a))),3));",
    "    if(uvArrays.length===geometries.length)merged.setAttribute('uv',new THREE.Float32BufferAttribute(Float32Array.from(uvArrays.flatMap(a=>Array.from(a))),2));",
    '    merged.setIndex([...roofIndices,...wallIndices]); merged.clearGroups();',
    '    if(roofIndices.length)merged.addGroup(0,roofIndices.length,0); if(wallIndices.length)merged.addGroup(roofIndices.length,wallIndices.length,1);',
    "    if(normalArrays.length!==geometries.length)merged.computeVertexNormals(); merged.computeBoundingSphere();",
    '    const mesh=new THREE.Mesh(merged,[makeRoofMaterial(kind),makeBuildingMaterial(kind)]); mesh.userData.buildingCount=geometries.length; group.add(mesh);',
    '  }',
    '  group.userData.buildingCount=accepted; group.userData.colliders=colliders; group.add(makeVegetationTile(tx,ty,accepted)); return group;',
    '}',
  ].join('\n');

  source = source.replace(
    /function makeBuildingTile\(tx, ty, elements\) \{[\s\S]*?\n\}\n\nfunction parseOsmBuildingXml/,
    `${buildingTile}\n\nfunction parseOsmBuildingXml`,
  );
  return source;
}

function cacheBustServiceWorker(source) {
  return source.replace("navigator.serviceWorker.register('./sw.js')", `navigator.serviceWorker.register('./sw.js?v=${VERSION}')`);
}

try {
  const chunks = await Promise.all(PARTS.map(loadPart));
  let source = chunks.map(normalizeChunk).join('');
  source = repairChunkBoundaries(source);
  source = modernizeTimer(source);
  source = upgradeTerrain(source);
  source = upgradeBuildings(source);
  source = cacheBustServiceWorker(source);
  if (/THREE\.B\s+ufferGeometry/.test(source)) throw new Error('Flight source chunk boundary is still malformed');
  if (!source.includes('terrainZoom: 14,')) throw new Error('HD terrain upgrade did not apply');
  if (!source.includes('function makeRoofMaterial(kind)')) throw new Error('Building material upgrade did not apply');
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { await import(moduleUrl); } finally { URL.revokeObjectURL(moduleUrl); }
} catch (error) {
  console.error('[Flight Universe] bootstrap failed', error);
  const loading = document.getElementById('loading');
  const message = String(error?.message || error);
  if (loading) {
    loading.classList.remove('out');
    loading.innerHTML = `<div class="spinner"></div><div>FLIGHT SYSTEMS FAILED TO LOAD</div><small>${message}</small>`;
  }
}