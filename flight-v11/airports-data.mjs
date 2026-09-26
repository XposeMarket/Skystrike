// Build step: OurAirports (public domain) -> compact 10°x10° runway tiles + ident index.
import fs from 'node:fs/promises';

export function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const HARD = /ASP|CON|PEM|BIT|TAR|ASF|PAV|MAC|CEM/i;
export function tileKey(lat, lon) { return `${Math.floor((lat + 90) / 10)}_${Math.floor((lon + 180) / 10)}`; }

export function compileAirports(airportsCsv, runwaysCsv) {
  const airports = new Map();
  for (const a of parseCSV(airportsCsv)) if (/^(small|medium|large)_airport$/.test(a.type)) airports.set(a.ident, a);
  const tiles = {}, index = {};
  let count = 0;
  for (const r of parseCSV(runwaysCsv)) {
    const a = airports.get(r.airport_ident); if (!a || r.closed === '1') continue;
    const len = +r.length_ft; if (!(len >= 2000) || !HARD.test(r.surface)) continue;
    const la1 = +r.le_latitude_deg, lo1 = +r.le_longitude_deg, la2 = +r.he_latitude_deg, lo2 = +r.he_longitude_deg;
    if (![la1, lo1, la2, lo2].every(v => Number.isFinite(v)) || !r.le_latitude_deg || !r.he_latitude_deg) continue;
    const key = tileKey(+a.latitude_deg, +a.longitude_deg);
    const tile = tiles[key] ||= {};
    const apt = tile[a.ident] ||= { n: a.name, t: a.type[0], lat: +(+a.latitude_deg).toFixed(5), lon: +(+a.longitude_deg).toFixed(5), c: a.municipality || '', r: [] };
    apt.r.push([+la1.toFixed(6), +lo1.toFixed(6), +la2.toFixed(6), +lo2.toFixed(6), Math.round(Math.max(18, (+r.width_ft || 100) * .3048)), r.le_ident, r.he_ident]);
    index[a.ident] = [apt.lat, apt.lon, a.name, a.iata_code || ''];
    count++;
  }
  return { tiles, index, count };
}

export async function buildAirports(download, outDir = 'dist/assets/airports') {
  const base = 'https://davidmegginson.github.io/ourairports-data/';
  const [ap, rw] = await Promise.all([download(base + 'airports.csv'), download(base + 'runways.csv')]);
  const { tiles, index, count } = compileAirports(ap.toString('utf8'), rw.toString('utf8'));
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(Object.entries(tiles).map(([k, v]) => fs.writeFile(`${outDir}/${k}.json`, JSON.stringify(v))));
  await fs.writeFile(`${outDir}/index.json`, JSON.stringify(index));
  if (count < 10000) throw new Error(`Too few runways compiled: ${count}`);
  console.log('airports', Object.keys(index).length, 'runways', count, 'tiles', Object.keys(tiles).length);
}
