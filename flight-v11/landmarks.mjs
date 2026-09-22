import * as THREE from 'three';

// Recognizable procedural landmarks, placed at real coordinates.
// These are not photogrammetry scans. They are distinct silhouettes so a
// flyover reads as the place instead of another extruded OSM box.
export const LANDMARKS = [
  {id:'eiffel', name:'Eiffel Tower', city:'Paris', lat:48.85837, lon:2.294481, h:330, kind:'tower'},
  {id:'liberty', name:'Statue of Liberty', city:'New York', lat:40.689247, lon:-74.044502, h:93, kind:'statue'},
  {id:'empire', name:'Empire State Building', city:'New York', lat:40.748441, lon:-73.985664, h:443, kind:'skyscraper'},
  {id:'bigben', name:'Elizabeth Tower', city:'London', lat:51.500729, lon:-0.124625, h:96, kind:'clock'},
  {id:'colosseum', name:'Colosseum', city:'Rome', lat:41.89021, lon:12.492231, h:48, kind:'arena'},
  {id:'burj', name:'Burj Khalifa', city:'Dubai', lat:25.197197, lon:55.274376, h:828, kind:'spire'},
  {id:'sydney', name:'Sydney Opera House', city:'Sydney', lat:-33.856784, lon:151.215297, h:65, kind:'shells'},
  {id:'christ', name:'Christ the Redeemer', city:'Rio', lat:-22.951916, lon:-43.210487, h:38, kind:'statue'},
  {id:'pyramid', name:'Great Pyramid of Giza', city:'Giza', lat:29.979235, lon:31.134202, h:138, kind:'pyramid'},
  {id:'cn', name:'CN Tower', city:'Toronto', lat:43.642566, lon:-79.387057, h:553, kind:'tower'},
  {id:'space', name:'Space Needle', city:'Seattle', lat:47.620506, lon:-122.349277, h:184, kind:'needle'},
  {id:'gateway', name:'Gateway Arch', city:'St. Louis', lat:38.624691, lon:-90.184776, h:192, kind:'arch'},
  {id:'capitol', name:'US Capitol', city:'Washington', lat:38.889939, lon:-77.00905, h:88, kind:'dome'},
  {id:'taj', name:'Taj Mahal', city:'Agra', lat:27.175015, lon:78.042155, h:73, kind:'dome'},
  {id:'petra', name:'Treasury at Petra', city:'Petra', lat:30.32202, lon:35.45174, h:40, kind:'facade'},
  {id:'tokyo', name:'Tokyo Skytree', city:'Tokyo', lat:35.710063, lon:139.8107, h:634, kind:'spire'},
  {id:'shard', name:'The Shard', city:'London', lat:51.5045, lon:-0.0865, h:310, kind:'spire'},
  {id:'sagrada', name:'Sagrada Familia', city:'Barcelona', lat:41.403629, lon:2.174356, h:172, kind:'spires'},
  {id:'brandenburg', name:'Brandenburg Gate', city:'Berlin', lat:52.516275, lon:13.377704, h:26, kind:'gate'},
  {id:'pisa', name:'Leaning Tower of Pisa', city:'Pisa', lat:43.722952, lon:10.396597, h:56, kind:'lean'},
  {id:'sphinx', name:'Great Sphinx', city:'Giza', lat:29.975268, lon:31.137567, h:20, kind:'statue'},
  {id:'golden', name:'Golden Gate Bridge', city:'San Francisco', lat:37.819929, lon:-122.478255, h:227, kind:'bridge', span:1280, heading:32},
  {id:'towerbridge', name:'Tower Bridge', city:'London', lat:51.505456, lon:-0.075356, h:65, kind:'bridge', span:240, heading:90},
  {id:'arc', name:'Arc de Triomphe', city:'Paris', lat:48.873792, lon:2.295028, h:50, kind:'gate'},
];

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.08,
    emissive: new THREE.Color(opts.emissive || '#000'),
    emissiveIntensity: opts.emissive ? 0.35 : 0,
  });
  matCache.set(key, m);
  return m;
}

function box(w, h, d, color, y, opts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  mesh.position.y = y;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
function cyl(r, h, color, y, opts, segs = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat(color, opts));
  mesh.position.y = y;
  return mesh;
}
function cone(r, h, color, y, opts, segs = 12) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), mat(color, opts));
  mesh.position.y = y;
  return mesh;
}

const builders = {
  tower(g, L) {
    const iron = '#5c4636';
    g.add(box(28, 8, 28, '#6b5846', 4));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = box(3.2, L.h * 0.62, 3.2, iron, L.h * 0.31);
      leg.position.x = Math.cos(a) * 18;
      leg.position.z = Math.sin(a) * 18;
      leg.rotation.z = Math.cos(a) * 0.16;
      leg.rotation.x = -Math.sin(a) * 0.16;
      g.add(leg);
    }
    g.add(box(22, 8, 22, '#7a624c', L.h * 0.58));
    g.add(cyl(4.2, L.h * 0.28, iron, L.h * 0.74, {}, 8));
    g.add(cyl(1.4, L.h * 0.14, '#c8b48a', L.h * 0.93, {}, 8));
    g.add(cone(2.2, 12, '#d7c49a', L.h - 2));
  },
  statue(g, L) {
    const stone = L.id === 'liberty' ? '#6f8f62' : '#d8d2c4';
    g.add(box(L.h * 0.55, L.h * 0.18, L.h * 0.55, '#8a8174', L.h * 0.09));
    g.add(cyl(L.h * 0.08, L.h * 0.42, stone, L.h * 0.38, {}, 10));
    g.add(box(L.h * 0.16, L.h * 0.22, L.h * 0.1, stone, L.h * 0.62));
    const head = new THREE.Mesh(new THREE.SphereGeometry(L.h * 0.07, 12, 8), mat(stone));
    head.position.y = L.h * 0.78;
    g.add(head);
    const arm = box(L.h * 0.05, L.h * 0.28, L.h * 0.05, stone, L.h * 0.82);
    arm.position.x = L.h * 0.1;
    arm.rotation.z = -0.35;
    g.add(arm);
    if (L.id === 'liberty') g.add(cone(1.6, 8, '#e6d7a2', L.h * 0.96, {emissive: '#c9a24a'}));
  },
  skyscraper(g, L) {
    const shaft = L.h * 0.72;
    g.add(box(58, shaft, 38, '#c5b7a2', shaft / 2));
    g.add(box(28, L.h * 0.16, 22, '#b7a890', shaft + L.h * 0.08));
    g.add(cyl(6, L.h * 0.1, '#9a8b74', shaft + L.h * 0.2, {}, 8));
    g.add(cone(3, L.h * 0.08, '#8d7d66', L.h - 4));
    const spire = cyl(0.7, 28, '#d9d3c6', L.h - 2, {metalness: 0.4}, 6);
    g.add(spire);
  },
  clock(g, L) {
    g.add(box(14, L.h * 0.82, 14, '#c8b48a', L.h * 0.41));
    const face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), mat('#1b2430', {emissive: '#c9a24a'}));
    face.position.set(0, L.h * 0.72, 7.2);
    g.add(face);
    g.add(cone(8, L.h * 0.16, '#6d5a42', L.h * 0.9));
    g.add(cone(2, 8, '#d7c49a', L.h - 1));
  },
  arena(g, L) {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(78, 82, L.h, 28, 1, true), mat('#c2ad8e'));
    wall.position.y = L.h / 2;
    g.add(wall);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(58, 58, 4, 24), mat('#6d624f'));
    inner.position.y = 2;
    g.add(inner);
    for (let i = 0; i < 8; i++) {
      const arch = box(8, L.h * 0.55, 6, '#8d7760', L.h * 0.32);
      const a = (i / 8) * Math.PI * 2;
      arch.position.x = Math.cos(a) * 80;
      arch.position.z = Math.sin(a) * 80;
      arch.lookAt(0, arch.position.y, 0);
      g.add(arch);
    }
  },
  spire(g, L) {
    const tiers = 7;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const w = 42 * (1 - t * 0.82);
      const h = L.h * 0.11;
      g.add(box(w, h, w * 0.72, i % 2 ? '#c9d0d6' : '#aeb7c0', h * 0.5 + i * h));
    }
    g.add(cyl(2.2, L.h * 0.22, '#d5dde4', L.h * 0.86, {metalness: 0.35}, 8));
    g.add(cone(1.2, L.h * 0.08, '#e8eef3', L.h - 4));
  },
  shells(g) {
    const colors = ['#f4f1ea', '#e7e1d4'];
    for (let i = 0; i < 5; i++) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(18 + i * 2.2, 16, 10, 0, Math.PI, 0, Math.PI / 2), mat(colors[i % 2]));
      shell.scale.set(1, 2.15, 1.15);
      shell.position.set((i - 2) * 18, 0, (i % 2) * 8);
      shell.rotation.y = -0.4 + i * 0.18;
      g.add(shell);
    }
    g.add(box(120, 6, 46, '#d8d0c2', 3));
  },
  pyramid(g, L) {
    const geo = new THREE.ConeGeometry(L.h * 1.15, L.h, 4);
    geo.rotateY(Math.PI / 4);
    const mesh = new THREE.Mesh(geo, mat('#c2a36a', {roughness: 0.84}));
    mesh.position.y = L.h / 2;
    g.add(mesh);
  },
  needle(g, L) {
    g.add(cyl(7, L.h * 0.62, '#d5d8dc', L.h * 0.31, {metalness: 0.25}));
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(22, 18, 10, 20), mat('#f2f4f6', {metalness: 0.2}));
    deck.position.y = L.h * 0.68;
    g.add(deck);
    g.add(cone(5, L.h * 0.22, '#e8ecef', L.h * 0.86));
  },
  arch(g, L) {
    const span = L.span || L.h * 1.15;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-span / 2, 8, 0),
      new THREE.Vector3(0, L.h * 1.35, 0),
      new THREE.Vector3(span / 2, 8, 0),
    );
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, Math.max(2.4, Math.min(6, L.h * 0.04)), 8, false), mat('#cfc6b6', {metalness: 0.18}));
    g.add(tube);
    g.add(box(span * 0.18, 8, 14, '#b7ad9c', 4, {}));
    g.add(box(span * 0.18, 8, 14, '#b7ad9c', 4));
    g.children[1].position.x = -span * 0.38;
    g.children[2].position.x = span * 0.38;
  },
  dome(g, L) {
    const baseW = L.id === 'taj' ? 96 : 78;
    const baseH = Math.max(14, L.h * 0.22);
    g.add(box(baseW, baseH, baseW * 0.72, '#f3efe6', baseH / 2));
    const domeR = L.h * 0.34;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f7f4ee'));
    dome.position.y = baseH;
    g.add(dome);
    g.add(cyl(Math.max(2.2, L.h * 0.035), L.h * 0.28, '#efe8da', baseH + domeR + L.h * 0.08));
    if (L.id === 'taj') {
      for (const [x, z] of [[-34, -18], [34, -18], [-34, 18], [34, 18]]) {
        const min = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f7f4ee'));
        min.position.set(x, baseH, z);
        g.add(min);
      }
    }
  },
  facade(g, L) {
    g.add(box(36, L.h, 14, '#c47a62', L.h / 2));
    g.add(box(18, L.h * 0.72, 4, '#a8584a', L.h * 0.4));
    const door = box(6, 12, 2, '#5c3a32', 7);
    door.position.z = 8;
    g.add(door);
    for (let i = 0; i < 4; i++) {
      const col = cyl(1.1, L.h * 0.7, '#d08a70', L.h * 0.35, {}, 8);
      col.position.set(-12 + i * 8, L.h * 0.35, 8);
      g.add(col);
    }
  },
  spires(g, L) {
    g.add(box(46, 28, 86, '#d8c7a2', 14));
    for (let i = 0; i < 4; i++) {
      const x = i < 2 ? -16 : 16;
      const z = i % 2 ? -30 : 30;
      g.add(cone(4.5, L.h * 0.72, '#cbb892', 28 + L.h * 0.28));
      g.children[g.children.length - 1].position.x = x;
      g.children[g.children.length - 1].position.z = z;
    }
    g.add(cone(6, L.h * 0.55, '#e6d7b8', 40 + L.h * 0.2));
  },
  gate(g, L) {
    g.add(box(62, 8, 12, '#d9d0be', 4));
    for (let i = 0; i < 6; i++) {
      const col = cyl(1.6, L.h * 0.7, '#e7e0d0', 8 + L.h * 0.28, {}, 10);
      col.position.x = -22 + i * 9;
      g.add(col);
    }
    g.add(box(64, 4, 14, '#cfc6b2', L.h * 0.78));
  },
  lean(g, L) {
    const shaft = cyl(7, L.h * 0.86, '#f0e6cf', L.h * 0.5, {}, 12);
    shaft.rotation.z = 0.06;
    g.add(shaft);
    g.add(cyl(9, 6, '#e4d8be', 3, {}, 12));
    g.add(cyl(8, 5, '#efe4cc', L.h * 0.92, {}, 12));
  },
  bridge(g, L) {
    const span = L.span || 400;
    const deck = box(span, 4, 28, '#b4533a', 46);
    g.add(deck);
    for (const side of [-1, 1]) {
      const tower = box(14, L.h, 22, '#c45c40', L.h / 2);
      tower.position.x = side * span * 0.28;
      g.add(tower);
      const cableMat = mat('#6e655c', {metalness: 0.3});
      for (let i = 0; i < 8; i++) {
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 18 + i * 3, 4), cableMat);
        drop.position.set(side * span * 0.28 + side * (8 + i * span * 0.025), 46 + (18 + i * 3) / 2, 0);
        g.add(drop);
      }
    }
  },
};

export function buildLandmark(L) {
  const g = new THREE.Group();
  g.name = 'landmark-' + L.id;
  const build = builders[L.kind] || builders.skyscraper;
  build(g, L);
  if (L.heading) g.rotation.y = THREE.MathUtils.degToRad(L.heading);
  g.traverse(o => { o.userData.landmark = L.id; o.userData.landmarkName = L.name; });
  g.userData.landmark = L;
  return g;
}

export function nearestLandmarks(lat, lon, radiusM = 2500, limit = 4) {
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  return LANDMARKS
    .map(L => {
      const dx = (L.lon - lon) * 111320 * cos;
      const dz = (lat - L.lat) * 111320;
      return {...L, dist: Math.hypot(dx, dz), dx, dz};
    })
    .filter(L => L.dist <= radiusM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

export function suppressRadius(L) {
  if (L.kind === 'bridge') return (L.span || 400) * 0.45;
  if (L.kind === 'arena' || L.kind === 'shells') return 110;
  if (L.kind === 'pyramid') return L.h * 1.3;
  return Math.max(28, Math.min(70, L.h * 0.18));
}
