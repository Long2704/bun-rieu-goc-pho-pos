import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkSaveSelectionSnapshot(db,waiter,food){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261113020000_save_selection_snapshot.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 await db.exec('begin');
 try{
  await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);
  await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(551,'Fast 551',true,'dine_in',551)");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.exec('set role authenticated');
  const request=crypto.randomUUID(),items=[{menu_item_id:food,qty:1,note:'Ít bún'}];
  const save=(req=request,value=items)=>one('select save_menu_selection_snapshot(551,$1,$2::jsonb) result',[req,JSON.stringify(value)]);
  const first=(await save()).result;assert.equal(first.request_id,request);assert.equal(first.table_id,551);assert.deepEqual(first.snapshot.session_ids,[first.session_id]);
  const order=first.snapshot.sessions[0].orders.find(o=>o.id===first.order_id);assert.equal(order.is_draft,true);assert.equal(order.kitchen_relevant,false);assert.equal(order.order_items[0].note,'Ít bún');assert.equal(first.snapshot.kitchen.length,0);
  const replay=(await save()).result;assert.equal(replay.order_id,first.order_id);assert.equal((await one('select count(*)::int n from orders where request_id=$1',[request])).n,1);
  await db.exec('reset role');assert.equal((await one("select has_function_privilege('anon','public.save_menu_selection_snapshot(integer,uuid,jsonb)','execute') allowed")).allowed,false);
  await db.exec('savepoint fail_snapshot');
  await db.exec("create or replace function public.get_pos_sync_delta(p_session_ids uuid[]) returns jsonb language plpgsql as $$begin raise exception 'Test snapshot failure';end;$$;");
  await db.exec('set role authenticated');const failed=crypto.randomUUID();await db.exec('savepoint failed_call');await assert.rejects(save(failed),/Test snapshot failure/);await db.exec('rollback to savepoint failed_call');assert.equal((await one('select count(*)::int n from orders where request_id=$1',[failed])).n,0,'read failure rolls back write atomically');
  await db.exec('rollback to savepoint fail_snapshot');
  await db.query('update profiles set is_active=false where id=$1',[waiter]);await db.exec('set role authenticated;savepoint denied');await assert.rejects(save(),/không có quyền/);await db.exec('rollback to savepoint denied');
  console.log('PASS atomic save: scoped exact snapshot, unchanged draft/kitchen semantics, same-UUID replay, ACL, disabled staff, rollback on snapshot failure');
 }finally{await db.exec('rollback;reset role');}
}
