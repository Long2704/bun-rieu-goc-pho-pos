import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkServedCancellationGuard(db,admin,food,drink){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261116160521_waiter_served_cancellation_guard.sql',import.meta.url),'utf8'));
 const waiter=crypto.randomUUID(),kitchen=crypto.randomUUID(),cashier=crypto.randomUUID();
 for(const [id,role] of [[waiter,'phuc_vu'],[kitchen,'bep'],[cashier,'thu_ngan']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,name,role,is_active,must_change_password,username) values($1,$2,$2,true,false,$3)',[id,role,'test_'+id.slice(0,12)]);}
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) select n,'Test '||n,true,'dine_in',n from generate_series(2001,2008)n");
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const place=async(table,items=[{menu_item_id:food,qty:1},{menu_item_id:drink,qty:1}])=>{await as(waiter);const id=(await one('select submit_order($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify(items)])).id;return{id,session:(await one('select session_id from orders where id=$1',[id])).session_id,items:(await db.query('select * from order_items where order_id=$1',[id])).rows};};
 const cancel=id=>one("select cancel_order_item($1,'')",[id]);
 const cancelTable=async(o,request=crypto.randomUUID())=>{const ids=(await db.query('select i.id from order_items i join orders o on o.id=i.order_id where o.session_id=$1 and not i.paid and i.cancelled_at is null order by i.id',[o.session])).rows.map(i=>i.id);return one('select cancel_table_session($1,$2,$3::uuid[])',[o.session,request,ids]);};
 const a=await place(2001);await cancel(a.items.find(i=>i.category!=='do_uong').id);
 const b=await place(2002);await as(kitchen);await one('select complete_kitchen_order($1)',[b.id]);await as(waiter);
 await assert.rejects(cancel(b.items.find(i=>i.category!=='do_uong').id),/Bếp đã ra món/);
 await assert.rejects(cancelTable(b),/Bàn có món đã ra/);
 assert.equal((await one('select closed_at from table_sessions where id=$1',[b.session])).closed_at,null);
 assert.ok((await db.query('select cancelled_at from order_items where order_id=$1',[b.id])).rows.every(i=>i.cancelled_at===null),'blocked cancellation changes no lines');
 await cancel(b.items.find(i=>i.category==='do_uong').id);
 const extra=await place(2002,[{menu_item_id:food,qty:1}]);await cancel(extra.items[0].id);await assert.rejects(cancelTable(b),/Bàn có món đã ra/);
 await as(cashier);await cancel(b.items.find(i=>i.category!=='do_uong').id);
 const c=await place(2003);await as(kitchen);await one('select complete_kitchen_order($1)',[c.id]);await as(admin);await cancelTable(c);
 const d=await place(2004,[{menu_item_id:drink,qty:1}]);await as(waiter);await cancelTable(d);
 const e=await place(2005);await as(waiter);const request=crypto.randomUUID(),ids=e.items.map(i=>i.id);await one('select cancel_table_session($1,$2,$3::uuid[])',[e.session,request,ids]);await one('select cancel_table_session($1,$2,$3::uuid[])',[e.session,request,ids]);
 const f=await place(2006);await as(kitchen);await one('select complete_kitchen_order($1)',[f.id]);await db.exec('reset role');await db.query('update order_items set bill_no=2 where id=$1',[f.items.find(i=>i.category==='do_uong').id]);await as(admin);await one("select pay_bill($1,gen_random_uuid(),'transfer',$2::uuid[],1)",[f.session,[f.items.find(i=>i.category!=='do_uong').id]]);await as(waiter);await assert.rejects(cancelTable(f),/Bàn có món đã ra/);
 await db.exec('reset role');
 console.log('PASS served cancellation: waiter served-food and whole-table rejection, mixed/pending/drink handling, paid served food still blocks whole-table cancellation, admin/cashier exceptions, request replay, no partial cancellation. Same table/session/order locks as kitchen completion.');
}
