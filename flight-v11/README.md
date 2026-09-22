# Flight Universe v11

This is an upgrade of the existing simulator, not a replacement game. Use the `flight-universe-pwa` lineage, not the unrelated repository `main` branch.

## Run

Node.js 22 is used by CI. From the repository root:

```sh
npm install
npm run build
npm test
npm run serve
```

Open http://localhost:4173. The output is a static site in `dist/`; do not serve the old root index.html. Building requires access to the pinned legacy source, NASA/JPL/PDS datasets and the existing Rafale model source. Aircraft, Three.js, Draco and the Mars/Moon surface assets are then served first-party; Earth terrain continues streaming its original providers.

Browser integration validation:

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

## What changed

- **Aircraft:** NASA Shuttle and Global Hawk GLBs require `KHR_draco_mesh_compression`. The loader now attaches a matching, locally hosted Draco decoder. Local models, aircraft-specific previews, a 15-second load timeout, explicit failure status, retry, stale-load cancellation and resource cleanup replace the invisible/generic fallback path. Shuttle axes are corrected.
- **Buildings:** Footprints remain OpenStreetMap data. Generated brick, concrete, glass and industrial facade atlases have metre-scaled windows, sills, roughness and bump detail; wall mapping respects diagonal footprints. Roofs have separate materials. These are not photos of the individual buildings. Shared textures are not disposed when one tile unloads.
- **Planets:** Mars and Moon have independent terrain frames and real global colour/elevation data, not reused Earth tiles. Approach from orbit, select a named surface region, return to orbit, or climb above 90 km AGL. Terrain collision clearance, floating-origin rebasing and date-line/polar coordinate tests are included. Solar-system scale and spacecraft handling remain arcade-oriented.

## How to explore

Launch the simulator, open the flight computer menu and select **Solar**. The mapped-surface destinations appear first. Select Mars/Valles Marineris, Olympus Mons or Jezero, or Moon/Tycho, Apollo 11 region or Copernicus. These buttons enter a regional terrain frame. To fly in from orbit instead, scroll down to the orbital destination grid, select Mars or Moon, then use **Approach current orbit target** or steer toward the globe yourself. Steering cancels the approach assist. Press **O / ORBIT** to leave a surface.

## Resolution limits

The first implementation uses global reconnaissance maps, not Google Earth-like close-up imagery. Mars colour is 1440x720 Viking; Moon colour is a 4K NASA LROC composite. DEMs are 8 pixels/degree, derived from 16-pixel/degree MOLA/LOLA products. Close views are visibly coarse. No procedural craters are presented as measured terrain. High-resolution regional imagery and elevation streaming is a follow-up, not part of this build. Other planets are orbital flybys only.

See `ATTRIBUTION.md` for provenance, units and dataset credits. Deployed assets include a SHA-256 provenance manifest.

## Deployment

`vercel.json` builds into `dist/`. This project's historical Vercel deployment was not automatically Git-linked; merely merging a PR must not be represented as a production deployment. A configured Vercel project can deploy this branch with `npm run build` and output directory `dist`. Confirm the live HUD reads **BUILD V11** and test aircraft switching and a Mars/Moon round trip before promoting a preview.

## Scope of validation

CI runs nine deterministic unit/data tests and a Chromium integration suite covering all real aircraft models, switch races, simulated asset outage/retry, Mars/Moon terrain, collision clearance, rebasing, pause, orbit return, swept planet entry, building atlas contracts and mobile-layout controls. This is not a physical iPhone/Safari performance certification.
