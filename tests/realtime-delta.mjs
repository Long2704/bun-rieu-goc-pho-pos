import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/realtime-delta.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {mergeRealtimeDelta}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const order=(id,s,note='')=>({id,session_id:s,created_at:'2026-11-11T00:00:00Z',status:'cooking',kitchen_relevant:true,order_items:[{id:'i-'+id,note,qty:1,price:58000,paid:false}],table_sessions:{table_id:s===a?1:3,closed_at:null}});
const session=(id,table_id,note='')=>({id,table_id,orders:[order('o-'+id,id,note)]});
const previous={sessions:[{...session(a,1),member_table_ids:[1,2]}, {...session(a,2),member_table_ids:[1,2]},session(b,3)],kitchen:[order('oa',a),order('ob',b)]};
const unrelated=previous.sessions[2],unrelatedKitchen=previous.kitchen[1];
const delta={session_ids:[a],sessions:[session(a,1,'Không hành')],links:[{session_id:a,table_id:1},{session_id:a,table_id:2}],kitchen:[order('oa',a,'Không hành')]};
let next=mergeRealtimeDelta(previous,[a],delta);
assert.equal(next.sessions.length,3);assert.equal(next.sessions.find(s=>s.id===b),unrelated);assert.equal(next.kitchen.find(o=>o.session_id===b),unrelatedKitchen);assert.ok(next.sessions.filter(s=>s.id===a).every(s=>s.orders[0].order_items[0].note==='Không hành'));assert.equal(previous.sessions[0].orders[0].order_items[0].note,'');
// Paid/closed sessions leave service, while their unfinished tickets remain.
next=mergeRealtimeDelta(previous,[a],{session_ids:[a],sessions:[],links:[],kitchen:[{...order('oa',a),table_sessions:{table_id:1,closed_at:'2026-11-11T01:00:00Z'}}]});assert.deepEqual(next.sessions,[unrelated]);assert.equal(next.kitchen.length,2);
next=mergeRealtimeDelta(next,[a],{session_ids:[a],sessions:[],links:[],kitchen:[]});assert.deepEqual(next.kitchen,[unrelatedKitchen]);
for(const bad of [{...delta,session_ids:[]},{...delta,session_ids:[b]},{...delta,sessions:[session(b,1)]},{...delta,kitchen:[order('x',b)]},{...delta,sessions:[session(a,3)],links:[]},{...delta,sessions:[session(a,1),session(a,1)]}])assert.throws(()=>mergeRealtimeDelta(previous,[a],bad));
console.log('PASS scoped merge: replace linked aliases once, preserve unrelated sessions/tickets by reference, exact note/amount, no mutation, paid cooking retention, final removal, strict scope/collision/malformed-response rejection.');
