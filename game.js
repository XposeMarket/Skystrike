const sourceParts = [
  'game-source-00.txt',
  'game-source-01.txt',
  'game-source-02.txt',
  'game-source-03.txt',
  'game-source-04.txt'
];

try {
  const responses = await Promise.all(sourceParts.map((path) => fetch(path)));
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`Failed to load game source: ${failed.status} ${failed.statusText}`);
  const source = (await Promise.all(responses.map((response) => response.text()))).join('');
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
} catch (error) {
  console.error(error);
  document.body.innerHTML = `<main style="font-family:system-ui;padding:2rem;color:white;background:#07111d;min-height:100vh"><h1>Skystrike failed to load</h1><p>${String(error.message || error)}</p><p>Launch the game through <code>launch.py</code> or another local HTTP server.</p></main>`;
}
