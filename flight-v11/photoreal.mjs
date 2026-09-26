import * as THREE from 'three';
import {TilesRenderer} from '3d-tiles-renderer';
import {GoogleCloudAuthPlugin} from '3d-tiles-renderer/core/plugins';
import {GLTFExtensionsPlugin, TileCompressionPlugin, TilesFadePlugin} from '3d-tiles-renderer/plugins';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// Google Photorealistic 3D Tiles, anchored to the game's local earth frame
// (x = east, y = up, z = south, metres, origin = state.earthOrigin).
const KEY_STORE = 'fu.googleTilesKey', ON_STORE = 'fu.photoreal';
const ENU_TO_GAME = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

// ECEF -> game-local matrix for an origin. Exported for tests.
export function frameFor(ellipsoid, lat, lon, target = new THREE.Matrix4()) {
  const enu = new THREE.Matrix4();
  ellipsoid.getEastNorthUpFrame(lat * Math.PI / 180, lon * Math.PI / 180, 0, enu);
  return target.copy(ENU_TO_GAME).multiply(enu.invert());
}

export function createPhotoreal({renderer, camera, state, earthGroup, terrainTiles, buildingsGroup, terrainHeightAt, toast}) {
  const holder = new THREE.Group();
  holder.name = 'photoreal-tiles';
  holder.matrixAutoUpdate = false;
  earthGroup.add(holder);
  const mobile = matchMedia('(pointer:coarse)').matches;
  let tiles = null, origin = null, lift = 0, calibrated = false, ready = false, lastErr = 0;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const attrib = document.createElement('div');
  attrib.id = 'photorealAttrib';
  attrib.style.cssText = 'position:fixed;left:8px;bottom:4px;z-index:40;font:10px/1.2 system-ui;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;opacity:.85;display:none;max-width:60vw';
  document.body.appendChild(attrib);

  const key = () => (localStorage.getItem(KEY_STORE) || '').trim();
  const wanted = () => localStorage.getItem(ON_STORE) !== '0' && !!key();

  function start() {
    stop();
    tiles = new TilesRenderer();
    tiles.registerPlugin(new GoogleCloudAuthPlugin({apiToken: key(), autoRefreshToken: true}));
    const draco = new DRACOLoader().setDecoderPath('./assets/draco/');
    tiles.registerPlugin(new GLTFExtensionsPlugin({dracoLoader: draco}));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new TilesFadePlugin());
    tiles.errorTarget = mobile ? 20 : 10;
    tiles.maxDepth = Infinity;
    tiles.lruCache.minSize = mobile ? 400 : 900;
    tiles.lruCache.maxSize = mobile ? 700 : 1600;
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.addEventListener('load-model', () => { ready = true; });
    tiles.addEventListener('load-error', e => {
      const now = performance.now();
      if (now - lastErr > 8000) { lastErr = now; toast?.('Photoreal tiles: ' + (e.error?.message || 'load error').slice(0, 80)); }
    });
    holder.add(tiles.group);
    origin = null; calibrated = false; ready = false;
  }
  function stop() {
    if (!tiles) return;
    holder.remove(tiles.group);
    tiles.dispose();
    tiles = null; ready = false;
    terrainTiles.visible = true; buildingsGroup.visible = true;
    attrib.style.display = 'none';
  }

  // Ellipsoid heights differ from the game's MSL terrain by the geoid (~-50..+60 m).
  // Calibrate once per origin by raycasting the photoreal ground at the origin.
  function calibrate() {
    ray.set(new THREE.Vector3(0, 9000, 0), down);
    ray.far = 20000;
    const hit = ray.intersectObject(tiles.group, true)[0];
    if (!hit) return;
    const target = terrainHeightAt(0, 0);
    if (!Number.isFinite(target)) return;
    lift += target - hit.point.y;
    calibrated = true;
    applyFrame();
  }
  function applyFrame() {
    frameFor(tiles.ellipsoid, origin.lat, origin.lon, holder.matrix);
    holder.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
    holder.matrixWorldNeedsUpdate = true;
  }

  let frame = 0;
  function update() {
    const on = wanted() && state.mode === 'earth';
    if (!on) { if (tiles) stop(); return; }
    if (!tiles) start();
    if (origin !== state.earthOrigin) { origin = state.earthOrigin; lift = 0; calibrated = false; applyFrame(); }
    camera.updateMatrixWorld();
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.update();
    if (ready && !calibrated && (++frame % 20 === 0)) calibrate();
    // Real meshes replace the heightmap skin and OSM boxes once they've loaded.
    const show = ready && calibrated;
    terrainTiles.visible = !show;
    buildingsGroup.visible = !show;
    if (show && frame % 60 === 0) {
      const list = [];
      try { tiles.getAttributions(list); } catch {}
      const text = [...new Set(list.map(a => a.value).filter(v => typeof v === 'string'))].join(' · ');
      attrib.textContent = 'Google' + (text ? ' · ' + text : '');
      attrib.style.display = 'block';
    }
  }

  const api = {
    update, stop, start,
    get active() { return !!tiles && ready && calibrated; },
    get hasKey() { return !!key(); },
    setKey(k) { localStorage.setItem(KEY_STORE, (k || '').trim()); if (tiles) start(); },
    setEnabled(v) { localStorage.setItem(ON_STORE, v ? '1' : '0'); if (!v) stop(); },
    get enabled() { return wanted(); },
  };
  installUI(api);
  return api;
}

function installUI(api) {
  const tab = document.getElementById('tab-settings');
  if (!tab || document.getElementById('photorealToggle')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <label class="setting toggle"><span>Photoreal 3D cities<small>Google 3D Tiles: real Eiffel Tower, Manhattan, etc. Needs a Maps API key</small></span><input id="photorealToggle" type="checkbox"/></label>
    <label class="setting"><span>Google Maps API key<small>Map Tiles API enabled. Stored on this device only</small></span><input id="photorealKey" type="password" autocomplete="off" placeholder="AIza..." style="max-width:46%"/></label>`;
  const anchor = tab.querySelector('#buildingToggle')?.closest('label');
  anchor ? anchor.after(...wrap.children) : tab.prepend(...wrap.children);
  const toggle = document.getElementById('photorealToggle'), input = document.getElementById('photorealKey');
  toggle.checked = api.enabled;
  input.value = localStorage.getItem(KEY_STORE) || '';
  input.addEventListener('change', () => { api.setKey(input.value); if (input.value.trim()) { toggle.checked = true; api.setEnabled(true); } });
  toggle.addEventListener('change', () => {
    if (toggle.checked && !api.hasKey) { toggle.checked = false; input.focus(); return; }
    api.setEnabled(toggle.checked);
  });
}
