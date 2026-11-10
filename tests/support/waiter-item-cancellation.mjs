import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkWaiterItemCancellation(db,owner,waiter,kitchen,food,drink){
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(id=owner)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const snapshot=async()=> {await db.exec('reset role');return (await db.query("select jsonb_build_object('items',(select jsonb_agg(to_jsonb(t) order by id) from order_items t),'bills',(select jsonb_agg(to_jsonb(t) order by id) from bills t),'audit',(select jsonb_agg(to_jsonb(t) order by id) from audit_log t)) v")).rows[0].v;};
 await db.exec('reset role');const beforeInstall=await snapshot();await db.exec(readFileSync(new URL('../../releases/waiter_item_cancellation.sql',import.meta.url),'utf8'));assert.deepEqual(await snapshot(),beforeInstall);
 await db.exec('begin');
 const reject=async(fn,re)=>{await db.exec('savepoint denied');try{await assert.rejects(fn,re);}finally{await db.exec('rollback to savepoint denied;release savepoint denied');}};
 const cancel=id=>one("select public.cancel_order_item($1,'')",[id]);
 async function place(){await as();const id=(await one('select public.submit_order(1,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:2,note:'Ít bún'},{menu_item_id:drink,qty:1}])])).id;return{id,items:(await db.query('select * from order_items where order_id=$1 order by kitchen_position',[id])).rows};}
 try{
  await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);
  await as(waiter);assert.equal((await one("select has_permission('orders.cancel') ok")).ok,true);assert.equal((await one('select get_my_access() a')).a.permissions.includes('orders.cancel'),true);
  for(const permission of ['payments.discount','employees.manage','reports.read'])assert.equal((await one('select has_permission($1) ok',[permission])).ok,false);
  await as(kitchen);assert.equal((await one("select has_permission('orders.cancel') ok")).ok,false);
  const cooking=await place(),item=cooking.items.find(i=>i.category!=='do_uong');
  const queueBefore=await one('select created_at,status,kitchen_relevant from orders where id=$1',[cooking.id]);
  await as(kitchen);await reject(()=>cancel(item.id),/không có quyền/);
  await as(waiter);await cancel(item.id);await cancel(item.id);
  const cancelled=await one('select * from order_items where id=$1',[item.id]);assert.equal(cancelled.cancelled_by,waiter);assert.ok(cancelled.cancelled_at);assert.equal(cancelled.note,'Ít bún');assert.equal(cancelled.kitchen_position,item.kitchen_position);assert.equal(cancelled.qty,2);assert.deepEqual(await one('select created_at,status,kitchen_relevant from orders where id=$1',[cooking.id]),queueBefore);
  await db.exec('reset role');assert.equal((await one("select count(*)::int n from audit_log where type='cancel_item' and extra->>'item_id'=$1",[item.id])).n,1);
  const served=await place();await as(kitchen);await one('select public.complete_kitchen_order($1)',[served.id]);await as(waiter);await cancel(served.items[0].id);await cancel(served.items[1].id);assert.ok((await one('select cancelled_at from order_items where id=$1',[served.items[0].id])).cancelled_at);
  const paid=await place();await db.exec('reset role');await db.query('update order_items set bill_no=97 where order_id=$1',[paid.id]);await as();const session=(await one('select session_id from orders where id=$1',[paid.id])).session_id;await one("select public.pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],97,'amount',0,null)",[session,paid.items.map(i=>i.id)]);const paidSnapshot=await snapshot();await as(waiter);await reject(()=>cancel(paid.items[0].id),/đã thanh toán/);assert.deepEqual(await snapshot(),paidSnapshot);
  const check=await place();for(const patch of ['is_active=false','must_change_password=true','staff_sessions_revoked_before=clock_timestamp()']){await db.exec('reset role');await db.query('update profiles set '+patch+' where id=$1',[waiter]);await as(waiter);await reject(()=>cancel(check.items[0].id),/không có quyền/);await db.exec('reset role');await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);}
  await db.exec('reset role;set role anon');await reject(()=>cancel(check.items[0].id),/permission denied/);await db.exec('reset role');assert.equal((await one("select has_table_privilege('authenticated','order_items','UPDATE') ok")).ok,false);
  console.log('PASS waiter item cancellation SQL: permission reflected in access, cooking/served/drinks cancellation, actor and exactly-one audit on retry, original quantity/note/FIFO preserved, kitchen denied, paid snapshots unchanged, locked/password/revoked/anon denied; installation changes no sales data.');
 }finally{await db.exec('rollback;reset role');}
 assert.deepEqual(await snapshot(),beforeInstall);
}
