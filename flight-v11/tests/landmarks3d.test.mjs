import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {eiffelMembers, buildEiffel} from '../eiffel.mjs';
import {frameFor} from '../photoreal.mjs';
import {WGS84_ELLIPSOID} from '3d-tiles-renderer';

test('eiffel lattice is dense, true-scale and grounded', () => {
  const {chords, braces} = eiffelMembers();
  assert.ok(chords.length + braces.length > 1500, 'lattice has real member count');
  let minY = Infinity, maxY = -Infinity, maxX = 0;
  for (const [a, b] of [...chords, ...braces]) for (const p of [a, b]) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); maxX = Math.max(maxX, Math.abs(p.x)); }
  assert.equal(minY, 0);
  assert.ok(maxY >= 275 && maxY <= 277);
  assert.ok(maxX > 55 && maxX < 65, 'base ~125 m wide');
  const box = new THREE.Box3().setFromObject(buildEiffel());
  assert.ok(box.max.y > 325 && box.max.y < 335, 'total height ~330 m');
});

test('ECEF frame maps origin to zero, north to -z, up to +y', () => {
  const lat = 48.85837, lon = 2.294481, r = Math.PI / 180, m = frameFor(WGS84_ELLIPSOID, lat, lon);
  const at = (la, lo, h) => WGS84_ELLIPSOID.getCartographicToPosition(la * r, lo * r, h, new THREE.Vector3()).applyMatrix4(m);
  const o = at(lat, lon, 0);
  assert.ok(o.length() < 0.01);
  const n = at(lat + 0.001, lon, 0);
  assert.ok(n.z < -110 && n.z > -112 && Math.abs(n.x) < 0.5);
  const e = at(lat, lon + 0.001, 0);
  assert.ok(e.x > 72 && e.x < 75 && Math.abs(e.z) < 0.5);
  const u = at(lat, lon, 100);
  assert.ok(Math.abs(u.y - 100) < 0.01);
});
