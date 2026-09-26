import * as THREE from 'three';

const TILE_URL = k => `./assets/airports/${k}.json`;
export function tileKey(lat, lon) { return `${Math.floor((lat + 90) / 10)}_${Math.floor((lon + 180) / 10)}`; }
export function haversine(a, b, c, d) { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

// Point-in-runway test in local metres; returns along-track t (0..1) or null.
export function runwayHit(rw, x, z, margin = 4) {
  const dx = rw.x2 - rw.x1, dz = rw.z2 - rw.z1, L2 = dx * dx + dz * dz; if (!L2) return null;
  const t = ((x - rw.x1) * dx + (z - rw.z1) * dz) / L2; if (t < -.01 || t > 1.01) return null;
  const px = rw.x1 + dx * t, pz = rw.z1 + dz * t;
  return Math.hypot(x - px, z - pz) <= rw.w / 2 + margin ? t : null;
}

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#2d2f31'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .06})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2); }
  g.fillStyle = '#e8e8e2'; g.fillRect(30, 0, 4, 120); g.fillRect(1, 0, 2, 256); g.fillRect(61, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function thresholdTexture(label) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 192; const g = c.getContext('2d');
  g.fillStyle = '#2d2f31'; g.fillRect(0, 0, 128, 192); g.fillStyle = '#e8e8e2';
  for (let i = 0; i < 8; i++) { const x = 6 + i * 15 + (i >= 4 ? 4 : 0); g.fillRect(x, 150, 9, 38); }
  g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText(String(label || '').replace(/^0/, '').slice(0, 3), 64, 128);
  g.fillRect(1, 0, 2, 192); g.fillRect(125, 0, 2, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createAirports(d) {
  const { state, earthGroup, flightPos, localFromGeo, terrainHeightAt, toast } = d;
  const group = new THREE.Group(); group.name = 'airports'; earthGroup.add(group);
  const tiles = new Map(), loading = new Set(), runways = new Map();
  const stripe = stripeTexture();
  const baseMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: .92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const lightMat = new THREE.PointsMaterial({ color: 0xffe6a8, size: 3.2, sizeAttenuation: true, depthWrite: false, transparent: true, opacity: .95 });
  let index = null, originKey = '', heightAt = 0, scanAt = 0;

  async function loadTile(key) {
    if (tiles.has(key) || loading.has(key)) return; loading.add(key);
    try { const r = await fetch(TILE_URL(key)); tiles.set(key, r.ok ? await r.json() : {}); } catch { tiles.set(key, null); }
    finally { loading.delete(key); }
  }
  async function loadIndex() { if (!index) { try { index = await (await fetch('./assets/airports/index.json')).json(); } catch { index = {}; } } return index; }

  function nearby(lat, lon, radius) {
    const out = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const t = tiles.get(tileKey(lat + a * 10, lon + b * 10)); if (!t) continue;
      for (const [id, ap] of Object.entries(t)) { const dist = haversine(lat, lon, ap.lat, ap.lon); if (dist <= radius) out.push({ id, ap, dist }); }
    }
    return out.sort((p, q) => p.dist - q.dist);
  }

  function build(id, ap, i, r) {
    const [la1, lo1, la2, lo2, w, le, he] = r;
    const rw = { key: `${id}:${i}`, id, name: ap.n, la1, lo1, la2, lo2, w, le, he, label: `${id} ${le}/${he}`, h: null, mesh: null };
    const g = new THREE.Group(); rw.mesh = g;
    const body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), baseMat); body.rotation.x = -Math.PI / 2; g.add(body);
    const ends = [[le, 0], [he, 1]].map(([lab, end]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: thresholdTexture(lab), roughness: .9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); m.rotation.x = -Math.PI / 2; m.userData.end = end; g.add(m); return m; });
    rw.ends = ends; rw.body = body;
    group.add(g); runways.set(rw.key, rw); return rw;
  }

  function layout(rw) {
    const a = localFromGeo(rw.la1, rw.lo1), b = localFromGeo(rw.la2, rw.lo2);
    Object.assign(rw, { x1: a.x, z1: a.z, x2: b.x, z2: b.z });
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); rw.len = len;
    rw.heading = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const g = rw.mesh; g.position.set((a.x + b.x) / 2, rw.h ?? 0, (a.z + b.z) / 2); g.rotation.y = -rw.heading * Math.PI / 180;
    rw.body.scale.set(rw.w, len, 1); stripe.repeat.set(1, 1); rw.body.material.map.repeat.y = 1;
    rw.body.geometry.dispose(); const geo = new THREE.PlaneGeometry(1, 1); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * len / 90); rw.body.geometry = geo;
    const endLen = Math.min(60, len * .06);
    for (const m of rw.ends) { m.scale.set(rw.w, endLen, 1); m.position.set(0, .08, (m.userData.end ? -1 : 1) * (len / 2 - endLen / 2)); m.rotation.z = m.userData.end ? Math.PI : 0; }
    if (!rw.lights) {
      const pts = [], n = Math.min(60, Math.floor(len / 60));
      for (let k = 0; k <= n; k++) for (const s of [-1, 1]) pts.push(s * (rw.w / 2 + 2), 1, -len / 2 + len * k / n);
      const geo2 = new THREE.BufferGeometry(); geo2.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      rw.lights = new THREE.Points(geo2, lightMat); g.add(rw.lights);
    }
  }

  // Flat runway plane at the highest sampled terrain point, so it never sinks into bumps.
  function settleHeight(rw) {
    let h = -Infinity; for (let k = 0; k <= 8; k++) { const t = k / 8; h = Math.max(h, terrainHeightAt(rw.x1 + (rw.x2 - rw.x1) * t, rw.z1 + (rw.z2 - rw.z1) * t)); }
    if (Number.isFinite(h)) { rw.h = h + .35; rw.mesh.position.y = rw.h; }
  }

  function update() {
    if (state.mode !== 'earth') { group.visible = false; return; }
    group.visible = true;
    const geo = state.currentGeo || state.location, now = performance.now();
    const ok = `${state.earthOrigin.lat},${state.earthOrigin.lon}`;
    if (ok !== originKey) { originKey = ok; for (const rw of runways.values()) { layout(rw); rw.h = null; } }
    if (now - scanAt > 1500) {
      scanAt = now;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) loadTile(tileKey(geo.lat + a * 10, geo.lon + b * 10));
      const want = new Set();
      for (const { id, ap } of nearby(geo.lat, geo.lon, 30000).slice(0, 14)) ap.r.forEach((r, i) => { const k = `${id}:${i}`; want.add(k); if (!runways.has(k)) layout(build(id, ap, i, r)); });
      for (const [k, rw] of runways) if (!want.has(k)) { group.remove(rw.mesh); rw.mesh.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== baseMat && o.material !== lightMat) { o.material.map?.dispose(); o.material.dispose(); } }); runways.delete(k); }
    }
    if (now - heightAt > 900) { heightAt = now; for (const rw of runways.values()) if (Math.hypot(rw.mesh.position.x - flightPos.x, rw.mesh.position.z - flightPos.z) < 12000) settleHeight(rw); }
  }

  function groundAt(x, z) {
    for (const rw of runways.values()) { if (rw.h == null) continue; const t = runwayHit(rw, x, z); if (t != null) return { h: rw.h, runway: rw, t }; }
    return null;
  }

  // Put the aircraft on the threshold of a runway end (spawn = {id, end, approach}).
  function placeOnRunway(spawn, fm) {
    const rw = [...runways.values()].find(r => r.id === spawn.id && (spawn.idx == null || r.key.endsWith(':' + spawn.idx))); if (!rw) return false;
    layout(rw); settleHeight(rw);
    const fwd = spawn.end ? -1 : 1; // end 0 = le threshold heading toward he
    const sx = fwd > 0 ? rw.x1 : rw.x2, sz = fwd > 0 ? rw.z1 : rw.z2, ex = fwd > 0 ? rw.x2 : rw.x1, ez = fwd > 0 ? rw.z2 : rw.z1;
    const ux = (ex - sx) / rw.len, uz = (ez - sz) / rw.len, hdg = (Math.atan2(ux, -uz) * 180 / Math.PI + 360) % 360;
    state.yawAngle = -hdg * Math.PI / 180; state.roll = 0; state.yaw = 0;
    const cfg = d.configs[state.currentAircraft];
    if (spawn.approach) {
      const dist = 7400; flightPos.set(sx - ux * dist, rw.h + dist * Math.tan(3 * Math.PI / 180) + 12, sz - uz * dist);
      state.pitch = -.02; state.speed = Math.max(fm.profile?.vs || 60, 0) * 1.35 || cfg.minSpeed * 1.3; state.throttle = .42; fm.onGround = false; fm.setGear(true, true); fm.setBrakes(false, true);
      toast(`FINAL · ${rw.name.toUpperCase()} RWY ${fwd > 0 ? rw.le : rw.he} · 4 NM, 3° GLIDESLOPE`);
    } else {
      flightPos.set(sx + ux * 45, 0, sz + uz * 45); state.pitch = 0; state.speed = 0; state.throttle = 0;
      fm.setGear(true, true); fm.onGround = true; fm.setBrakes(true, true); flightPos.y = rw.h + cfg.displaySize * (fm.contact?.() ?? .25);
      toast(`LINED UP · ${rw.name.toUpperCase()} RWY ${fwd > 0 ? rw.le : rw.he} · FULL THROTTLE, PULL AT ROTATE`);
    }
    fm.lastY = flightPos.y; fm.sink = 0; state.throttleUI?.(state.throttle);
    return true;
  }

  function nearestRunways() { return [...runways.values()].map(rw => ({ rw, dist: Math.hypot(rw.mesh.position.x - flightPos.x, rw.mesh.position.z - flightPos.z) })).sort((a, b) => a.dist - b.dist); }
  function approachGuidance() {
    const n = nearestRunways()[0]; if (!n || n.dist > 15000 || state.mode !== 'earth') return null;
    const rw = n.rw, fwdH = (state.heading + 360) % 360;
    const useLe = Math.abs(((fwdH - rw.heading + 540) % 360) - 180) < 90;
    const tx = useLe ? rw.x1 : rw.x2, tz = useLe ? rw.z1 : rw.z2, dist = Math.hypot(tx - flightPos.x, tz - flightPos.z);
    const ideal = (rw.h ?? 0) + dist * Math.tan(3 * Math.PI / 180), dev = flightPos.y - ideal;
    return { rw, ident: useLe ? rw.le : rw.he, dist, dev };
  }

  return { group, update, groundAt, placeOnRunway, nearby, loadTile, loadIndex, runways, nearestRunways, approachGuidance, tileKey };
}

export function installAirportUI(d) {
  const { airports, fm, state, loadTerrain, toast } = d;
  const tab = document.getElementById('tab-places'); if (!tab) return;
  const box = document.createElement('div'); box.className = 'airport-box';
  box.innerHTML = `<div class="subhead">AIRPORTS · TAKEOFF & LANDING</div>
  <div class="search-row"><input id="airportSearch" placeholder="ICAO / IATA / name (KFDK, JFK, Heathrow)" autocomplete="off"/><button id="airportSearchBtn">FIND</button></div>
  <div class="cards compact" id="airportCards"></div>
  <div class="source-note">Runways: OurAirports (public domain). Keys: G gear · B brakes. Land gear down, under ~900 fpm, wings level.</div>`;
  tab.insertBefore(box, tab.querySelector('.subhead'));
  const cards = box.querySelector('#airportCards');
  async function go(id, lat, lon, approach) {
    document.getElementById('panel')?.classList.remove('open');
    await airports.loadTile(airports.tileKey(lat, lon));
    const ap = airports.nearby(lat, lon, 5000).find(a => a.id === id); if (!ap) return toast('No paved runway data for that airport');
    await loadTerrain(ap.ap.lat, ap.ap.lon, ap.ap.n);
    airports.update(); // build runways at new origin
    await new Promise(r => setTimeout(r, 50)); airports.update();
    const longest = ap.ap.r.map((r, i) => ({ i, len: Math.hypot(r[0] - r[2], (r[1] - r[3]) * Math.cos(r[0] * Math.PI / 180)) })).sort((a, b) => b.len - a.len)[0];
    fm.spawn = { id, idx: longest.i, end: 0, approach };
    for (let k = 0; k < 20 && !airports.placeOnRunway(fm.spawn, fm); k++) { await new Promise(r => setTimeout(r, 150)); airports.update(); }
  }
  function render(list) {
    cards.innerHTML = '';
    for (const { id, lat, lon, name, sub } of list.slice(0, 8)) {
      const c = document.createElement('div'); c.className = 'card airport-card';
      c.innerHTML = `<b>${id}</b><span>${name}</span><small>${sub || ''}</small><div class="airport-actions"><button data-a="0">TAKEOFF</button><button data-a="1">LAND</button></div>`;
      c.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(id, lat, lon, b.dataset.a === '1')));
      cards.append(c);
    }
    if (!list.length) cards.innerHTML = '<div class="source-note">No matches.</div>';
  }
  async function refreshNearby() {
    const g = state.currentGeo || state.location; await airports.loadTile(airports.tileKey(g.lat, g.lon));
    render(airports.nearby(g.lat, g.lon, 150000).map(({ id, ap, dist }) => ({ id, lat: ap.lat, lon: ap.lon, name: ap.n, sub: `${(dist / 1852).toFixed(0)} NM · ${ap.r.length} RWY` })));
  }
  async function search() {
    const q = document.getElementById('airportSearch').value.trim().toUpperCase(); if (!q) return refreshNearby();
    const idx = await airports.loadIndex();
    const hits = Object.entries(idx).filter(([id, v]) => id === q || v[3] === q).concat(Object.entries(idx).filter(([id, v]) => id !== q && v[3] !== q && v[2].toUpperCase().includes(q)).slice(0, 8));
    render(hits.map(([id, v]) => ({ id, lat: v[0], lon: v[1], name: v[2], sub: v[3] })));
  }
  box.querySelector('#airportSearchBtn').addEventListener('click', search);
  box.querySelector('#airportSearch').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
  document.querySelector('[data-tab="places"]')?.addEventListener('click', () => { if (!document.getElementById('airportSearch').value) refreshNearby(); });
  refreshNearby();
  window.__flightAirportGo = go;
}
