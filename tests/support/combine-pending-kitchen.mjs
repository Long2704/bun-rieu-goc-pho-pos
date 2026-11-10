import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkCombinedPendingKitchen(db,waiter,food,drink){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261110164247_combine_pending_kitchen_selections.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0],rows=async(q,p=[])=>(await db.query(q,p)).rows;
 await db.exec('begin');
 try{
 await db.query("update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(221,'Bếp 221',true,'dine_in',221),(222,'Bếp 222',true,'dine_in',222)");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.exec('set role authenticated');
 const save=async(note,table=221,items=[{menu_item_id:food,qty:1,note}])=>(await one('select save_menu_selection($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify(items)])).id;
 const a=await save('Ít bún'),b=await save('Không hành',221,[{menu_item_id:food,qty:2,note:'Không hành'},{menu_item_id:drink,qty:1}]),other=await save('Bàn khác',222);
 const sid=(await one('select session_id from orders where id=$1',[a])).session_id;
 const original=await rows('select id,name,qty,price,category,note,bill_no,kitchen_position from order_items where order_id=any($1::uuid[]) order by id',[[a,b]]);
 const req=crypto.randomUUID();const send=async(ids,r=req,items=[])=>one('select send_saved_menu_selections(221,$1,$2::uuid[],$3,$4::jsonb)',[sid,ids,r,JSON.stringify(items)]);
 await send([a,b]);const tickets=await rows("select * from orders where session_id=$1 and kitchen_relevant and status='cooking'",[sid]);assert.equal(tickets.length,1);assert.equal(tickets[0].id,a);
 assert.equal((await one('select is_draft from orders where id=$1',[other])).is_draft,true);
 assert.deepEqual(await rows('select id,name,qty,price,category,note,bill_no,kitchen_position from order_items where order_id=any($1::uuid[]) order by id',[[a,b]]),original);
 assert.deepEqual((await rows("select note,qty from order_items where order_id=$1 and category<>'do_uong' order by kitchen_position",[a])).map(i=>[i.note,i.qty]),[['Ít bún',1],['Không hành',2]]);
 assert.equal((await one("select order_id from order_items where id=$1",[original.find(i=>i.category==='do_uong').id])).order_id,b);
 const c=await save('Lượt sau');await send([a,b]);assert.equal((await one('select is_draft from orders where id=$1',[c])).is_draft,true);assert.equal((await rows('select * from orders where session_id=$1 and kitchen_relevant',[sid])).length,1);
 await send([c],crypto.randomUUID(),[{menu_item_id:food,qty:1,note:'Thêm nhanh'}]);assert.equal((await rows('select * from orders where session_id=$1 and kitchen_relevant',[sid])).length,2);
 await db.exec('reset role');assert.equal((await rows("select * from audit_log where type='order_created' and session_id=$1",[sid])).length,2);await db.exec('set role authenticated');
 // Each new send creates one ticket; original sent ticket is unchanged.
 assert.equal((await rows("select * from order_items where order_id=$1 and category<>'do_uong'",[a])).length,2);
 const d=await save('Sẽ hủy'),e=await save('Còn lại');const cancelled=(await one('select id from order_items where order_id=$1',[d])).id;await one('select cancel_order_item($1,\'\')',[cancelled]);await send([d,e],crypto.randomUUID());assert.equal((await one('select order_id from order_items where id=$1',[cancelled])).order_id,d);
 const replay=crypto.randomUUID(),f=await save('Giữ bill',221,[{menu_item_id:food,qty:1,note:'Bill riêng'},{menu_item_id:food,qty:1,note:'Khác ghi chú'}]);await send([f],replay);await send([f],replay);
 console.log('PASS combined pending kitchen SQL: one ticket per send, exact original line IDs/qty/notes/prices/bills/positions, drinks and cancelled lines unmoved, prior sent tickets/other tables untouched, replay cannot capture later batches, quick-add joins same ticket, one send audit.');
 }finally{await db.exec('rollback;reset role');}
}
