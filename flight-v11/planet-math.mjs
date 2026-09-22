// Body-fixed coordinates: +X = lon 0, +Y = north, -Z = lon 90E.
// Kept independent of the renderer so seams, poles and elevation units are testable.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (v, n) => ((v % n) + n) % n;
export const radians = d => d * Math.PI / 180;
export const degrees = r => r * 180 / Math.PI;
export function unitAt(lat, lon) {
  const a=radians(lat), b=radians(lon), c=Math.cos(a);
  return [c*Math.cos(b), Math.sin(a), -c*Math.sin(b)];
}
export function geoAt(v) {
  const r=Math.hypot(...v);
  if (!(r>0)) throw new Error('Invalid planetary position');
  return {lat:degrees(Math.asin(clamp(v[1]/r,-1,1))),lon:degrees(Math.atan2(-v[2],v[0]))};
}
export function frameAt(lat,lon) {
  const a=radians(lat),b=radians(lon);
  return {up:unitAt(lat,lon),east:[-Math.sin(b),0,-Math.cos(b)],north:[-Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)]};
}
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function localToGeo(origin, position, radius) {
  const f=frameAt(origin.lat,origin.lon),p=f.up.map((v,i)=>v*(radius+position.y)+f.east[i]*position.x-f.north[i]*position.z);
  return {...geoAt(p),altitude:Math.hypot(...p)-radius};
}
export function geoToLocal(origin,geo,height,radius) {
  const f=frameAt(origin.lat,origin.lon),p=unitAt(geo.lat,geo.lon).map(v=>v*(radius+height));
  return {x:dot(p,f.east),y:dot(p,f.up)-radius,z:-dot(p,f.north)};
}
export function travelGeo(origin,east,south,radius) {
  const d=Math.hypot(east,south)/radius;
  if(d===0)return {...origin};
  const b=Math.atan2(east,-south),a=radians(origin.lat),l=radians(origin.lon);
  const a2=Math.asin(clamp(Math.sin(a)*Math.cos(d)+Math.cos(a)*Math.sin(d)*Math.cos(b),-1,1));
  const l2=l+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(a),Math.cos(d)-Math.sin(a)*Math.sin(a2));
  return {lat:degrees(a2),lon:wrap(degrees(l2)+180,360)-180};
}
// Pixel-centre registration; longitude wraps, latitude clamps. Data are real metres.
export function sampleHeight(data,width,height,lat,lon,west=-180) {
  const x=wrap((lon-west)/360*width-.5,width),y=clamp((90-lat)/180*height-.5,0,height-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=(x0+1)%width,y1=Math.min(height-1,y0+1),fx=x-x0,fy=y-y0;
  const a=data[y0*width+x0]*(1-fx)+data[y0*width+x1]*fx;
  const b=data[y1*width+x0]*(1-fx)+data[y1*width+x1]*fx;
  return a*(1-fy)+b*fy;
}
export function segmentSphereEntry(a,b,center,radius) {
  const d=b.map((v,i)=>v-a[i]),o=a.map((v,i)=>v-center[i]);
  const aa=dot(d,d),bb=2*dot(o,d),cc=dot(o,o)-radius*radius;
  if(cc<=0)return 0;
  if(aa<1e-12)return null;
  const disc=bb*bb-4*aa*cc;
  if(disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);
  return t>=0&&t<=1?t:null;
}
