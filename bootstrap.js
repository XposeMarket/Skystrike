const VERSION = 'loader-v6-boundary-timer-guard';
const PARTS = [
  'app-part-00.txt',
  'app-part-01.txt',
  'app-part-02.txt',
  'app-part-03.txt',
  'app-part-04.txt',
];
const REMOTE_BASE = 'https://raw.githubusercontent.com/XposeMarket/Skystrike/flight-universe-pwa/';

async function loadPart(name) {
  const localUrl = new URL(`./${name}?v=${VERSION}`, import.meta.url);
  try {
    const localResponse = await fetch(localUrl, { cache: 'no-store' });
    if (localResponse.ok) return localResponse.text();
  } catch {
    // Fall through to the compatibility source below.
  }

  const remoteResponse = await fetch(`${REMOTE_BASE}${name}?v=${VERSION}`, { cache: 'no-store' });
  if (!remoteResponse.ok) {
    throw new Error(`Failed to load ${name}: ${remoteResponse.status}`);
  }
  return remoteResponse.text();
}

function normalizeChunk(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
}

function repairChunkBoundaries(source) {
  // Only repair an actually broken identifier boundary. A valid
  // THREE.BufferGeometry contains zero whitespace and must remain untouched.
  return source.replace(/THREE\.B\s+ufferGeometry/g, 'THREE.BufferGeometry');
}

function modernizeTimer(source) {
  if (!source.includes('const clock = new THREE.Clock();')) return source;

  return source
    .replace(
      'const clock = new THREE.Clock();',
      'const timer = new THREE.Timer();\ntimer.connect(document);',
    )
    .replaceAll('clock.getDelta()', 'timer.getDelta()')
    .replaceAll('clock.elapsedTime', 'timer.getElapsed()')
    .replace(
      'function animate() {\n  requestAnimationFrame(animate);',
      'function animate(timestamp) {\n  requestAnimationFrame(animate);\n  timer.update(timestamp);',
    );
}

function cacheBustServiceWorker(source) {
  return source.replace(
    "navigator.serviceWorker.register('./sw.js')",
    `navigator.serviceWorker.register('./sw.js?v=${VERSION}')`,
  );
}

try {
  const chunks = await Promise.all(PARTS.map(loadPart));
  let source = chunks.map(normalizeChunk).join('');
  source = repairChunkBoundaries(source);
  source = modernizeTimer(source);
  source = cacheBustServiceWorker(source);

  // \s+ intentionally requires real whitespace. \s* would also match the
  // valid identifier THREE.BufferGeometry and falsely reject good source.
  if (/THREE\.B\s+ufferGeometry/.test(source)) {
    throw new Error('Flight source chunk boundary is still malformed');
  }

  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
} catch (error) {
  console.error('[Flight Universe] bootstrap failed', error);
  const loading = document.getElementById('loading');
  const message = String(error?.message || error);
  if (loading) {
    loading.classList.remove('out');
    loading.innerHTML = `<div class="spinner"></div><div>FLIGHT SYSTEMS FAILED TO LOAD</div><small>${message}</small>`;
  }
}
