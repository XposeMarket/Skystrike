const CORE_CACHE='flight-universe-core-v12-experience';
const ASSET_CACHE='flight-universe-assets-v7';
const CORE=['./','./index.html','./styles-v10.css','./bootstrap-v10.js','./manifest.webmanifest','./icon.svg'];
const CACHEABLE_EXTERNAL=new Set(['cdn.jsdelivr.net','raw.githubusercontent.com','assets.science.nasa.gov','threejs.org']);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CORE_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![CORE_CACHE,ASSET_CACHE].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
async function networkFirst(request){
  const cache=await caches.open(CORE_CACHE);
  try{const response=await fetch(request);if(response?.ok)cache.put(request,response.clone()).catch(()=>{});return response;}
  catch{const hit=await cache.match(request);if(hit)return hit;if(request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();return Response.error();}
}
async function staleWhileRevalidate(request){
  const cache=await caches.open(CORE_CACHE),hit=await cache.match(request);
  const fresh=fetch(request).then(response=>{if(response?.ok)cache.put(request,response.clone()).catch(()=>{});return response;}).catch(()=>null);
  return hit||(await fresh)||Response.error();
}
async function cacheExternal(request){
  const cache=await caches.open(ASSET_CACHE),hit=await cache.match(request);if(hit)return hit;
  try{const response=await fetch(request);if(response&&(response.ok||response.type==='opaque'))cache.put(request,response.clone()).catch(()=>{});return response;}catch{return Response.error();}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),sameOrigin=url.origin===self.location.origin;
  if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request));return;}
  if(sameOrigin){event.respondWith(staleWhileRevalidate(event.request));return;}
  if(CACHEABLE_EXTERNAL.has(url.hostname))event.respondWith(cacheExternal(event.request));
});
