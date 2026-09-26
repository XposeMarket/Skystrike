import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILES, speedStep, landingGrade} from '../flightmodel.mjs';
import {runwayHit, tileKey, haversine} from '../airports.mjs';
import {compileAirports, parseCSV} from '../airports-data.mjs';

const cfgs = {rafale:{maxSpeed:690},globalhawk:{maxSpeed:175},shuttle:{maxSpeed:2100}};
function level(key, throttle, secs=600){let v=0;for(let i=0;i<secs*20;i++)v=speedStep(v,.05,PROFILES[key],cfgs[key],{throttle,boost:false,pitch:0,gearDown:false,onGround:false,brakes:false});return v;}

test('full dry throttle converges near each aircraft max speed', () => {
  for (const k of Object.keys(cfgs)) { const v = level(k, 1, 900); assert.ok(v > cfgs[k].maxSpeed * .9 && v <= cfgs[k].maxSpeed * 1.01, `${k} ${v}`); }
});
test('each aircraft reaches rotate speed on a 3 km runway at full power', () => {
  for (const k of ['rafale','globalhawk']) { const p=PROFILES[k];let v=0,x=0;while(v<p.vr&&x<5000){v=speedStep(v,.05,p,cfgs[k],{throttle:1,boost:false,pitch:0,gearDown:true,onGround:true,brakes:false,onRunway:true});x+=v*.05;} assert.ok(x<3000,`${k} rolled ${x}`); }
});
test('brakes stop a landing roll far faster than rolling friction', () => {
  const p=PROFILES.rafale;const roll=b=>{let v=75,x=0;while(v>1&&x<20000){v=speedStep(v,.05,p,cfgs.rafale,{throttle:0,boost:false,pitch:0,gearDown:true,onGround:true,brakes:b,onRunway:true});x+=v*.05;}return x;};
  assert.ok(roll(true) < roll(false) / 2.5);
});
test('climbing costs speed', () => {
  const s={throttle:.5,boost:false,gearDown:false,onGround:false,brakes:false};
  assert.ok(speedStep(200,1,PROFILES.rafale,cfgs.rafale,{...s,pitch:.4}) < speedStep(200,1,PROFILES.rafale,cfgs.rafale,{...s,pitch:0}));
});
test('landing grades', () => { assert.equal(landingGrade(80),'BUTTER'); assert.equal(landingGrade(700),'HARD'); });
test('runway hit geometry', () => {
  const rw={x1:0,z1:0,x2:0,z2:-3000,w:45};
  assert.ok(runwayHit(rw,0,-1500)!=null); assert.ok(runwayHit(rw,20,-10)!=null); assert.equal(runwayHit(rw,60,-1500),null); assert.equal(runwayHit(rw,0,500),null);
});
test('tiles and distances', () => { assert.equal(tileKey(39.4,-77.4),'12_10'); assert.ok(Math.abs(haversine(0,0,0,1)-111195)<50); });
test('csv compile keeps paved runways only', () => {
  const ap='"id","ident","type","name","latitude_deg","longitude_deg","municipality","iata_code"\n1,"KXXX","small_airport","Test ""Field""",39,-77,"Town","TST"\n';
  const rw='"airport_ident","length_ft","width_ft","surface","closed","le_ident","le_latitude_deg","le_longitude_deg","he_ident","he_latitude_deg","he_longitude_deg"\n"KXXX",5000,100,"ASPH",0,"05",39,-77,"23",39.01,-76.99\n"KXXX",3000,100,"TURF",0,"09",39,-77,"27",39,-76.99\n';
  assert.equal(parseCSV(ap)[0].name,'Test "Field"');
  const {tiles,count}=compileAirports(ap,rw); assert.equal(count,1); assert.equal(tiles['12_10'].KXXX.r[0][5],'05');
});
