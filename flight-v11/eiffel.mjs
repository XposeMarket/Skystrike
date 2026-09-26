import * as THREE from 'three';

// Detailed lattice Eiffel Tower at true scale (330 m incl. antenna, 125 m base).
// Every iron member is an instance of one cylinder, so ~5k members cost 2 draw calls.
const UP = new THREE.Vector3(0, 1, 0);

export function eiffelMembers() {
  const chords = [], braces = [];
  const seg = (list, a, b, r) => list.push([a, b, r]);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Truss column: square cross-sections at successive levels, chords + X-bracing + rings.
  function truss(levels, chordR, braceR) {
    for (let i = 0; i < levels.length; i++) {
      const {c, s, y} = levels[i];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => V(c.x + u * s, y, c.z + v * s));
      levels[i].corners = corners;
      for (let k = 0; k < 4; k++) seg(braces, corners[k], corners[(k + 1) % 4], braceR);
      if (!i) continue;
      const prev = levels[i - 1].corners;
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        seg(chords, prev[k], corners[k], chordR);
        seg(braces, prev[k], corners[n], braceR);
        seg(braces, prev[n], corners[k], braceR);
      }
    }
  }

  // Four curved legs from the ground to the second floor (115 m).
  const legTop = 115;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const lv = [];
    for (let y = 0; y <= legTop + 0.01; y += 5.75) {
      const t = y / legTop;
      const d = 13 + 39 * Math.pow(1 - t, 1.55);   // leg centre offset per axis
      const s = 3.2 + 5.3 * (1 - t);               // leg half-width
      lv.push({c: V(sx * d, 0, sz * d), s, y});
    }
    truss(lv, 0.75, 0.24);
  }
  // Upper shaft: single tapering column from the second floor to the top deck (276 m).
  const up = [];
  for (let y = legTop; y <= 276.01; y += 7) {
    const t = (y - legTop) / (276 - legTop);
    up.push({c: V(0, 0, 0), s: 3.2 + 14 * Math.pow(1 - t, 1.9), y});
  }
  truss(up, 0.6, 0.2);
  // Tie legs into the shaft base.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) seg(chords, V(sx * 13, legTop, sz * 13), V(sx * 17.2, legTop, sz * 17.2), 0.6);

  // The iconic decorative arches between the legs under the first floor.
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    const R = (x, z) => V(Math.cos(a) * x - Math.sin(a) * z, 0, Math.sin(a) * x + Math.cos(a) * z);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, x = -40 + 80 * t;
      const p = R(44, x);
      p.y = 18 + 21 * Math.sin(Math.PI * t) ** 0.7;
      pts.push(p);
    }
    for (let i = 1; i < pts.length; i++) {
      seg(chords, pts[i - 1], pts[i], 0.55);
      // Filigree drops from arch to first-floor girder.
      if (i % 2 === 0) { const q = pts[i].clone(); q.y = 57; seg(braces, pts[i], q, 0.16); }
    }
  }
  return {chords, braces};
}

export function buildEiffel() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({color: '#6e5a45', roughness: 0.55, metalness: 0.55});
  const deck = new THREE.MeshStandardMaterial({color: '#5a4938', roughness: 0.7, metalness: 0.3});
  const {chords, braces} = eiffelMembers();
  const up = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), sc = new THREE.Vector3();
  for (const [list, sides] of [[chords, 6], [braces, 4]]) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, sides, 1, true);
    const mesh = new THREE.InstancedMesh(geo, iron, list.length);
    list.forEach(([a, b, r], i) => {
      up.subVectors(b, a); const len = up.length();
      q.setFromUnitVectors(UP, up.normalize());
      sc.set(r, len, r);
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  // Platforms: hollow square decks with railings.
  const ring = (y, outer, inner, h) => {
    const w = (outer - inner) / 2;
    for (const [x, z, sx, sz] of [[0, (outer - w) / 2, outer, w], [0, -(outer - w) / 2, outer, w], [(outer - w) / 2, 0, w, inner], [-(outer - w) / 2, 0, w, inner]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), deck);
      b.position.set(x, y, z); g.add(b);
    }
  };
  ring(57, 74, 30, 6);   // first floor
  ring(115, 42, 18, 4);  // second floor
  const top = new THREE.Mesh(new THREE.BoxGeometry(16.5, 10, 16.5), deck); top.position.y = 281; g.add(top);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 12, 8), deck); cap.position.y = 292; g.add(cap);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 32, 8), new THREE.MeshStandardMaterial({color: '#d8d2c8', metalness: 0.6, roughness: 0.4}));
  mast.position.y = 314; g.add(mast);
  // Warm floodlight glow at night-ish angles; beacon on the mast.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({color: '#ffcf6a'}));
  beacon.position.y = 330; g.add(beacon);
  // Pier foundations under each leg.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 20), new THREE.MeshStandardMaterial({color: '#9c8f7c', roughness: 0.9}));
    p.position.set(sx * 50, 1.5, sz * 50); g.add(p);
  }
  g.position.y = 0.7; // member radius would otherwise dip below grade
  const outer = new THREE.Group(); outer.add(g);
  return outer;
}
