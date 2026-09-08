const VERSION = 'loader-v3-boundary-timer';
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

function modernizeTimer(source) {
  if (!source.includes('const clock = new THREE.Clock();')) return source;

  source = source
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

  return source;
}

try {
  const chunks = await Promise.all(PARTS.map(loadPart));
  let source = chunks.map(normalizeChunk).join('');
  source = modernizeTimer(source);

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
