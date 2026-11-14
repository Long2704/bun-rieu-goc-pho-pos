import {liveReadDue} from '../src/sync-policy.ts';
import assert from 'node:assert/strict';
const ready={orders:true,catalog:true};
for(let t=5000;t<60000;t+=5000)assert.equal(liveReadDue(ready,true,1000,true,1000+t),false);
assert.equal(liveReadDue(ready,true,1000,true,61000),true);
assert.equal(liveReadDue({...ready,orders:false},true,1000,true,6000),true);
assert.equal(liveReadDue(ready,false,1000,true,6000),true);
assert.equal(liveReadDue({orders:false,catalog:false},false,0,false,120000),false);
console.log('PASS idle policy: no 5s reads with healthy Realtime; 60s safety, immediate fallback and no hidden reads');
