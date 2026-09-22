import fs from 'node:fs/promises';
await fs.mkdir('dist/assets/draco',{recursive:true});
for(const name of ['draco_decoder.js','draco_wasm_wrapper.js','draco_decoder.wasm'])await fs.copyFile(`node_modules/three/examples/jsm/libs/draco/gltf/${name}`,`dist/assets/draco/${name}`);
await fs.copyFile('node_modules/three/LICENSE','dist/assets/draco/THREE-LICENSE.txt');
console.log('Matching Draco JS/WASM decoder packaged locally.');
