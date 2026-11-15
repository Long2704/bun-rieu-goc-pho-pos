import assert from 'node:assert/strict';
import {createManualSync} from '../src/manual-sync.ts';
const run=createManualSync();let calls=0,release;
const read=async()=>{calls++;await new Promise(r=>release=r);};
const a=run('user',read),b=run('user',read);assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);release();await a;
const c=run('user',read);await Promise.resolve();assert.equal(calls,2);release();await c;
await assert.rejects(run('user',async()=>{throw Error('failed');}));await run('user',async()=>calls++);assert.equal(calls,3,'failed batch unlocks');
const old=run('old',read);await Promise.resolve();const oldRelease=release;await run('new',async()=>calls++);oldRelease();await old;assert.equal(calls,5,'new identity never shares old promise');
console.log('PASS manual sync: overlapping clicks share one batch, later click fresh, errors unlock, identity isolation.');
