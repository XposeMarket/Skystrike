# Flight Universe — Three.js Mobile PWA

A landscape-first mobile flight simulator prototype that lets you fly over streamed real-world Earth imagery/elevation, transition into orbital flight, and navigate a compressed but ephemeris-anchored solar system.

## Included now

- Landscape mobile PWA shell with fullscreen touch controls and installable manifest.
- Three.js r185 WebGL renderer.
- Earth flight over Esri World Imagery draped on decoded AWS Terrarium elevation.
- Continuous moving Earth tile streamer instead of a fixed local patch.
- Live latitude/longitude tracking and floating-origin rebasing for longer flights.
- Terrain-height sampling for collision and true AGL readout.
- Streamed OpenStreetMap 3D building tiles around the aircraft, with fallback Overpass endpoints, tagged heights, footprint-based height estimates, material classes, and batched per-tile geometry.
- Place presets, direct `lat, lon` entry, and Nominatim place search.
- HUD, chase/cockpit/orbit cameras, pitch/roll stick, rudder buttons, vertical throttle, and afterburner.
- Three selectable real-source vehicle assets: Dassault Rafale B, NASA Global Hawk, and NASA Space Shuttle. A procedural emergency fallback only appears if a remote model host fails.
- Atmospheric-to-space transition; orbital mode uses the Space Shuttle.
- Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto.
- The eight planets use JPL approximate Keplerian elements to place them from the device's current date; distances and radii are visually compressed for playable travel times.
- Planet navigation/warp panel and orbit-line display.
- Mobile performance controls for pixel density, FOV, terrain radius, clouds, buildings, and orbit lines.
- Service worker that caches the app shell plus finite library/model/planet assets after first successful online use.

## Run locally

```bash
node server.js
```

Then open `http://localhost:8080` from a browser on the same machine. For actual phone installation, serve it over HTTPS (for example with Vercel, Netlify, Cloudflare Pages, or your own HTTPS host).

The detailed Earth layers and place/building search require internet access because their datasets are streamed at runtime.

## Controls

### Mobile landscape

- Left stick: pitch + roll
- RUD ◀ / ▶: rudder / yaw
- Right vertical slider: throttle
- AB: afterburner / boost
- CAM: chase → cockpit → orbit camera
- ORBIT: switch to the Space Shuttle if needed and enter orbital mode
- EARTH: return to your last live Earth position
- ☰: aircraft, Earth places, solar navigation, and graphics/system settings

### Keyboard fallback

- W/S: pitch
- A/D: roll
- Q/E: yaw
- Shift: boost
- V: camera
- O: Earth/orbit toggle

## Architectural limits of this build

This is a serious playable vertical slice, not a browser clone of Microsoft Flight Simulator. The largest remaining steps for a full production simulator are:

- physically richer aerodynamic/engine models per aircraft;
- airport/runway/nav-aid databases and landing systems;
- weather, winds, clouds, time-of-day, and atmospheric scattering;
- photorealistic 3D city/landmark tiles from a licensed 3D-tiles provider;
- planetary surface terrain so Mars, the Moon, etc. can be descended onto rather than only visited in orbital space;
- persistent bounded IndexedDB tile caching and a smarter quadtree/LOD terrain scheduler;
- cockpit interiors, landing gear, control surfaces, sound, damage, missions, and multiplayer.

## Data / asset attribution and usage notes

- Three.js — MIT.
- JPL Solar System Dynamics — approximate planetary-position formulae/elements used for current planetary placement.
- Esri World Imagery — streamed at runtime; usage remains subject to Esri terms and attribution requirements.
- AWS Terrain Tiles / Mapzen Terrarium — elevation stream.
- OpenStreetMap contributors — building footprints/tags and Nominatim place search; OSM data is subject to ODbL and service usage policies.
- Solar System Scope texture set — CC BY 4.0 where applicable; based on NASA imagery/elevation and artistic gap filling for some bodies.
- Three.js Moon example texture.
- Rafale model source — OpenSkyFlight repository / its documented original model attribution.
- NASA Global Hawk and Space Shuttle — NASA Science 3D Resources; follow NASA Images and Media Usage Guidelines.

For a commercial release, review every upstream imagery/model/API license and replace any provider whose terms do not match the intended business use.

## Repository deployment layout

The production branch stores the large flight module in `app-part-*.txt` chunks. `bootstrap.js` concatenates them byte-for-byte at runtime and imports the resulting ES module. This keeps the connected Git/Vercel upload path reliable without changing game behavior.
