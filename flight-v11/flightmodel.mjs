import * as THREE from 'three';

// Per-aircraft flight model. Units: metres, seconds, m/s.
// thrust = forward accel at full dry throttle; drag k chosen so level full-dry speed ~= maxSpeed.
export const PROFILES = {
  rafale:     { thrust: 26,  ab: 1.55, vs: 62, vr: 78,  maxBank: 1.25, contact: .26, sinkMax: 38, gearDrag: 1.35, roll: .018 },
  globalhawk: { thrust: 5.5, ab: 1.1,  vs: 42, vr: 52,  maxBank: .75,  contact: .2,  sinkMax: 22, gearDrag: 1.2,  roll: .02 },
  shuttle:    { thrust: 34,  ab: 1.4,  vs: 92, vr: 108, maxBank: 1.0,  contact: .22, sinkMax: 55, gearDrag: 1.3,  roll: .015 },
};
const G = 9.81;
export const CRASH_SINK = 6.4; // m/s (~1260 fpm)
export function landingGrade(fpm) { return fpm < 130 ? 'BUTTER' : fpm < 320 ? 'SMOOTH' : fpm < 700 ? 'FIRM' : 'HARD'; }

// Pure speed integration, exported for tests.
export function speedStep(v, dt, p, cfg, { throttle, boost, pitch, gearDown, onGround, brakes, onRunway }) {
  const k = p.thrust / (cfg.maxSpeed * cfg.maxSpeed);
  const thrust = p.thrust * throttle * (boost ? p.ab : 1);
  let decel = k * v * v * (gearDown ? p.gearDrag : 1);
  if (onGround) decel += (onRunway ? p.roll : .08) * G + (brakes ? .42 * G : 0);
  else decel += G * Math.sin(pitch);
  return THREE.MathUtils.clamp(v + (thrust - decel) * dt, 0, cfg.maxSpeed * 1.25);
}

export function createFlightModel(d) {
  const { state, flightPos, flightQuat, flightEuler, aircraftRoot, airports, terrainHeightAt, toast, spawnExplosion } = d;
  const fm = { onGround: false, gearDown: false, brakes: false, sink: 0, crashedUntil: 0, lastY: flightPos.y, gearKey: null, uiAt: 0, spawn: null, gearWarnAt: 0 };
  let gear = null;

  function buildGear() {
    const cfg = d.configs[state.currentAircraft], s = cfg.displaySize, p = PROFILES[state.currentAircraft] || PROFILES.rafale;
    if (gear) { aircraftRoot.remove(gear); gear.traverse(o => { o.geometry?.dispose(); }); }
    gear = new THREE.Group(); gear.name = 'landing-gear';
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xb8bcbf, roughness: .5, metalness: .6 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .9 });
    const top = -s * .09, bottom = -s * p.contact, len = top - bottom;
    for (const [x, z] of [[0, -s * .3], [-s * .17, s * .08], [s * .17, s * .08]]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(s * .008, s * .008, len, 6), strutMat);
      strut.position.set(x, bottom + len / 2, z); gear.add(strut);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(s * .03, s * .03, s * .025, 12), tyreMat);
      tyre.rotation.z = Math.PI / 2; tyre.position.set(x, bottom + s * .03, z); gear.add(tyre);
    }
    gear.visible = fm.gearDown; aircraftRoot.add(gear); fm.gearKey = state.currentAircraft;
  }
  function syncUI() {
    document.getElementById('gearBtn')?.classList.toggle('on', fm.gearDown);
    document.getElementById('brakeBtn')?.classList.toggle('on', fm.brakes);
  }
  function setGear(v, silent) {
    if (!v && fm.onGround) { if (!silent) toast('GEAR LOCKED ? ON GROUND'); return; }
    fm.gearDown = v; if (gear) gear.visible = v; if (!silent) toast(v ? 'GEAR DOWN' : 'GEAR UP'); syncUI();
  }
  function setBrakes(v, silent) { fm.brakes = v; if (!silent) toast(v ? 'BRAKES SET' : 'BRAKES RELEASED'); syncUI(); }
  function contactOffset() { return d.configs[state.currentAircraft].displaySize * (PROFILES[state.currentAircraft] || PROFILES.rafale).contact; }
  function ground(x, z) { return airports.groundAt(x, z) || { h: terrainHeightAt(x, z), runway: null }; }

  function crash(reason) {
    fm.crashedUntil = performance.now() + 2600; fm.onGround = false; fm.sink = 0; state.speed = 0;
    try { spawnExplosion(flightPos.clone(), 7); } catch {}
    aircraftRoot.visible = false; toast(`CRASHED ? ${reason}`); if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  }
  function respawn() {
    aircraftRoot.visible = true; fm.crashedUntil = 0;
    if (fm.spawn && airports.placeOnRunway(fm.spawn, fm)) return;
    const cfg = d.configs[state.currentAircraft];
    flightPos.y = terrainHeightAt(flightPos.x, flightPos.z) + 700; state.speed = cfg.cruise; state.pitch = 0; state.roll = 0; setGear(false, true); fm.lastY = flightPos.y;
    toast('RESPAWNED ? 700 M AGL');
  }

  function step(dt, cfg) {
    if (fm.gearKey !== state.currentAircraft) buildGear();
    airports.update(dt);
    if (fm.crashedUntil) { if (performance.now() > fm.crashedUntil) respawn(); return true; }
    if (Math.abs(flightPos.y - fm.lastY) > 150) { fm.onGround = false; fm.sink = 0; } // teleport/rebase
    const p = PROFILES[state.currentAircraft] || PROFILES.rafale;
    const g = ground(flightPos.x, flightPos.z);
    if (fm.onGround) {
      state.roll = 0;
      if (state.speed < p.vr * .92) state.pitch = 0; else state.pitch = Math.max(0, state.pitch);
      if (fm.brakes && state.throttle > .3) setBrakes(false, true);
    } else state.roll = THREE.MathUtils.clamp(state.roll, -p.maxBank, p.maxBank);
    state.speed = speedStep(state.speed, dt, p, cfg, { throttle: state.throttle, boost: state.boost, pitch: state.pitch, gearDown: fm.gearDown, onGround: fm.onGround, brakes: fm.brakes, onRunway: !!g.runway });
    flightEuler.set(state.pitch, state.yawAngle, state.roll, 'YXZ'); flightQuat.setFromEuler(flightEuler);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flightQuat).normalize();
    const prevY = flightPos.y;
    if (fm.onGround) {
      flightPos.x += forward.x * state.speed * dt; flightPos.z += forward.z * state.speed * dt;
      flightPos.y = ground(flightPos.x, flightPos.z).h + contactOffset();
      if (state.pitch > .06 && state.speed >= p.vr && state.throttle > .5 && performance.now() - (fm.touchAt || 0) > 2500) { fm.onGround = false; toast(`ROTATE ? LIFTOFF ${Math.round(state.speed * 1.944)} KT`); }
    } else {
      flightPos.addScaledVector(forward, state.speed * dt);
      const lift = THREE.MathUtils.clamp((state.speed - p.vs * .72) / (p.vs * .5), 0, 1);
      const bankLoss = (1 - Math.cos(state.roll)) * 7;
      fm.sink = THREE.MathUtils.lerp(fm.sink, (1 - lift) * p.sinkMax + bankLoss * (.4 + .6 * (1 - lift)), Math.min(1, dt * 1.6));
      flightPos.y -= fm.sink * dt;
      if (lift < .35) state.pitch -= (1 - lift) * .9 * dt; // stall nose drop
      const g2 = ground(flightPos.x, flightPos.z), c2 = g2.h + contactOffset();
      if (!fm.gearDown && state.speed < p.vs * 1.7 && flightPos.y - c2 < 120 && performance.now() - fm.gearWarnAt > 6000) { fm.gearWarnAt = performance.now(); toast('GEAR! PRESS G / GEAR'); }
      if (flightPos.y <= c2) {
        const sink = Math.max(0, -(flightPos.y - prevY) / Math.max(dt, 1e-3)), fpm = Math.round(sink * 196.85);
        const ok = fm.gearDown && sink < CRASH_SINK && Math.abs(state.roll) < .3 && state.pitch > -.14 && (g2.runway || state.speed < p.vr * 1.25);
        if (!ok) { crash(!fm.gearDown ? 'GEAR UP' : sink >= CRASH_SINK ? `${fpm} FPM` : !g2.runway ? 'OFF-FIELD' : 'BAD ATTITUDE'); fm.lastY = flightPos.y; return true; }
        fm.onGround = true; fm.touchAt = performance.now(); fm.sink = 0; flightPos.y = c2; state.pitch = 0;
        toast(`TOUCHDOWN ? ${fpm} FPM ? ${landingGrade(fpm)}${g2.runway ? ' ? ' + g2.runway.label : ''}`);
      }
    }
    fm.lastY = flightPos.y;
    const now = performance.now();
    if (now - fm.uiAt > 250) { fm.uiAt = now; const el = document.getElementById('gearText'); if (el) el.textContent = `${fm.gearDown ? 'GEAR DN' : 'GEAR UP'}${fm.brakes ? ' ? BRK' : ''}${fm.onGround ? ' ? GND' : ''} ? VS ${Math.round((flightPos.y - prevY) / Math.max(dt, 1e-3) * 196.85)} FPM`; }
    return false;
  }

  function installUI() {
    const stack = document.querySelector('.action-stack');
    if (stack) for (const [id, label, fn] of [['gearBtn', 'GEAR', () => setGear(!fm.gearDown)], ['brakeBtn', 'BRK', () => setBrakes(!fm.brakes)]]) {
      const b = document.createElement('button'); b.id = id; b.className = 'round-action small'; b.textContent = label; b.addEventListener('click', fn); stack.prepend(b);
    }
    const tel = document.getElementById('telemetry'); if (tel) { const s = document.createElement('div'); s.id = 'gearText'; s.className = 'gear-text'; tel.after(s); }
    window.addEventListener('keydown', e => { if (e.repeat || e.ctrlKey || e.metaKey || e.target?.tagName === 'INPUT') return; if (e.code === 'KeyG') setGear(!fm.gearDown); if (e.code === 'KeyB') setBrakes(!fm.brakes); });
    syncUI();
  }
  Object.assign(fm, { step, setGear, setBrakes, installUI, crash, contact: () => (PROFILES[state.currentAircraft] || PROFILES.rafale).contact });
  Object.defineProperty(fm, 'profile', { get: () => PROFILES[state.currentAircraft] || PROFILES.rafale });
  return fm;
}
