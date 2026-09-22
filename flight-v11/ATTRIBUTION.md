# Flight Universe v11 data and limitations

Earth imagery: Esri World Imagery. Elevation: Mapzen/AWS Terrarium. Building footprints and navigation: OpenStreetMap contributors, ODbL. Building facades, roof patterns, preview aircraft, and landmark silhouettes are procedural artwork placed at published coordinates. They are recognizable shapes, not photogrammetry or photographic replicas of the real monuments.

NASA Global Hawk: NASA / Michael D. Carbajal, https://science.nasa.gov/3d-resources/global-hawk/
NASA Space Shuttle (D): NASA / Johnson Space Center, https://science.nasa.gov/3d-resources/space-shuttle-d/
Rafale model: existing OpenSkyFlight asset, https://github.com/jeanjerome/OpenSkyFlight/tree/main/assets/models/rafale ; inherited from the simulator's previous model attribution. See repository ATTRIBUTION.md for original credits.

Moon color: NASA Scientific Visualization Studio, Ernie Wright, Noah Petro; LROC camera team. CGI Moon Kit 2019 4K version. Elevation: LRO LOLA 16 pixels/degree unsigned half-metre TIFF, averaged to 8 pixels/degree. Decode unsigned value * 0.5 - 10000 metres relative to radius 1737.4 km. Map is centred on longitude zero. https://svs.gsfc.nasa.gov/4720/

Mars color: Viking, Caltech/JPL/USGS, 1440x720 global map. https://maps.jpl.nasa.gov/tmaps/mars.html
Mars elevation: NASA MGS MOLA MEGDR, 16 pixels/degree, averaged to 8 pixels/degree. Signed big-endian metres, longitude 0 to 360 east; elevations relative to the areoid, not a grayscale interpretation of a color map. https://pds-geosciences.wustl.edu/missions/mgs/megdr.html

Planet surfaces are global regional-scale reconnaissance maps, NOT Google Earth-level close-up imagery. No artificial craters or measured building facades are represented as real observations. Mars and Moon are the only new surface destinations in this version. Other bodies are orbit-only. Flight on Mars/Moon uses arcade spacecraft reaction controls, not a physically realistic Shuttle landing simulation. Solar-system distances/radii remain compressed for gameplay. The local surface frame uses each body's radius, true metre elevations, floating-origin rebasing and terrain collision clearance.

Downloaded build inputs and SHA-256 digests are recorded in assets/provenance.json. Asset providers are not contacted to load the game runtime, NASA models or planet surface maps after deployment. Earth map streaming still requires its external providers.
