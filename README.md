# Skystrike: Mountain Front

A Three.js browser flight-combat game with three aircraft eras, runway takeoff and landing, terrain-aware physics, AI dogfighting, cockpit/chase cameras, synthesized sound, persistent best score, and a hidden in-game event.

## Run

Because the game uses JavaScript modules, serve the folder through a local web server rather than double-clicking the HTML file.

- **Windows:** double-click `start-game.bat`.
- **macOS:** double-click `start-game.command` (you may need to approve it in Privacy & Security the first time).
- **Any OS:** run `python3 launch.py`.

### Python

```bash
cd Skystrike
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome, Edge, Firefox, or Safari.

### Node

```bash
npx serve .
```

The game loads Three.js from jsDelivr, so an internet connection is needed when launching it.

## Controls

- W / S: throttle up or down
- Mouse: pitch and directional turn
- A / D: bank and roll
- Space + A/D: accelerated barrel roll
- Shift: fire
- R: reload
- C: chase/cockpit camera
- Escape: pause

## Performance

The optimized build dynamically adjusts its internal 3D render scale. Use the in-game sensitivity setting and reduce the browser window size only if additional performance is needed.

## Control Fix Update

This build corrects the default horizontal/vertical mouse steering, A/D bank direction, and runway spawn/collision height.


## Control correction v2
Vertical mouse flight input has been reversed so moving the mouse upward pitches the aircraft upward and moving it downward pitches downward. The script URL is cache-busted to prevent an older game.js from being reused.


## Performance-optimized build

This build defaults to a lower internal render scale designed for a 4 GB graphics card while keeping the browser HUD at full resolution. It dynamically adjusts 3D resolution based on measured frame rate.

Additional changes:
- Mouse sensitivity doubled.
- Shadow resolution reduced and shadow maps update at a controlled rate.
- Runway lights and clouds are instanced to cut draw calls.
- Vegetation density and terrain subdivisions are reduced moderately.
- Rapid-fire weapon audio reuses a shared noise buffer.
- Bullet geometry and explosion geometry are reused.
- HUD and radar updates are throttled independently from flight physics.
- Airport rendering is culled when far outside the combat area.

## Repository build

The menu artwork is embedded as a compressed WebP data asset inside `style.css`, reducing the initial asset size and keeping deployment self-contained.
