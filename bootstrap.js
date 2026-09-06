const VERSION = 'navigation-v1';
const PARTS = [
  './app-part-00.txt',
  './app-part-01.txt',
  './app-part-02.txt',
  './app-part-03.txt',
  './app-part-04.txt'
].map((url) => `${url}?v=${VERSION}`);
const responses = await Promise.all(PARTS.map((url) => fetch(url, { cache: 'no-store' })));
for (const response of responses) {
  if (!response.ok) throw new Error(`Failed to load ${response.url}: ${response.status}`);
}
const source = (await Promise.all(responses.map((response) => response.text()))).join('');
const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try { await import(moduleUrl); } finally { URL.revokeObjectURL(moduleUrl); }
