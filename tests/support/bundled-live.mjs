import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/pos-live-snapshot.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {liveEnvelope,validateLiveSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
export async function checkBundledLive(db,owner,waiter,kitchen,cashier){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261115153130_bundled_pos_live_snapshot.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('begin');
 try{
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=any($1::uuid[])',[[owner,waiter,kitchen,cashier]]);
 await db.query("update profiles set role='thu_ngan' where id=$1",[cashier]);
 for(const id of [owner,waiter,kitchen,cashier]){
  await as(id);const b=(await one('select get_pos_live_snapshot(true,false) b')).b;validateLiveSnapshot(liveEnvelope(b),true,false);
  const old=(await one('select get_linked_table_snapshot() b')).b;assert.deepEqual(b.snapshot.sessions,old.sessions);assert.deepEqual(b.snapshot.links,old.links);assert.equal(b.access.live_snapshot,true);
  const expected=(await one("select count(*)::int n from orders where status='cooking' and kitchen_relevant")).n;assert.equal(b.snapshot.kitchen.length,expected);
  const c=(await one('select get_pos_live_snapshot(true,true) b')).b;validateLiveSnapshot(c,true,true);assert.equal(c.snapshot,null);
  assert.equal((await one('select get_pos_live_snapshot(false,false) b')).b.catalog,null);
 }
 await db.exec('reset role');assert.equal((await one("select prosecdef from pg_proc where oid='get_pos_live_snapshot(boolean,boolean)'::regprocedure")).prosecdef,false);
 assert.equal((await one("select has_function_privilege('anon','get_pos_live_snapshot(boolean,boolean)','execute') ok")).ok,false);
 for(const condition of ['is_active=false','must_change_password=true']){
  await db.exec('reset role;savepoint disabled');await db.query('update profiles set '+condition+' where id=$1',[waiter]);await as(waiter);const b=(await one('select get_pos_live_snapshot(true,false) b')).b;assert.equal(b.snapshot,null);assert.equal(b.catalog,null);await db.exec('reset role;rollback to disabled');
 }
 }finally{await db.exec('rollback;reset role');}
 console.log('PASS bundled live SQL: invoker/RLS, owner/waiter/kitchen parity, catalog-only, inactive/password gate, anonymous denied.');
}
