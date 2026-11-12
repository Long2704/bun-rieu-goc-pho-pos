import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkItemTakeaway(db,waiter,food,drink,kitchen){
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0],rows=async(q,p=[])=>(await db.query(q,p)).rows;
 const as=async(id=waiter)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.exec('reset role');await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(581,'Bàn 581',true,'dine_in',581),(582,'Mang về 4',true,'dine_in',582),(-583,'ABCD',true,'takeaway',583),(584,'Bàn 584',true,'dine_in',584)");
 await as();const save=async(table=581)=>(await one('select save_menu_selection($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify([{menu_item_id:food,qty:1,note:'Ăn tại chỗ'},{menu_item_id:food,qty:1,note:'Không hành'},{menu_item_id:drink,qty:1,note:'Ít đá'}])])).id;
 const before=await save();await db.exec('reset role');const oldPaid=await rows('select id,name,qty,price,note from bill_items order by id');
await db.exec(readFileSync(new URL('../../supabase/migrations/20261112022156_item_takeaway_markers.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261112050851_lock_takeaway_after_kitchen_completion.sql',import.meta.url),'utf8'));
 assert.deepEqual(await rows('select id,name,qty,price,note from bill_items order by id'),oldPaid);await as();
 const lines=await rows('select * from order_items where order_id=$1 order by kitchen_position,id',[before]);assert.ok(lines.every(i=>i.is_takeaway===false&&i.takeaway_version===0));
 const takeaway=lines.find(i=>i.note==='Không hành'),eat=lines.find(i=>i.note==='Ăn tại chỗ');
 const mark=(item,value,version=0,expected=false,request=crypto.randomUUID())=>one('select set_order_item_takeaway($1,$2,$3,$4,$5) value',[request,item,version,expected,value]);
 const req=crypto.randomUUID();const first=(await mark(takeaway.id,true,0,false,req)).value;assert.equal(first.version,1);assert.deepEqual((await mark(takeaway.id,true,0,false,req)).value,first);
 await assert.rejects(mark(takeaway.id,false,0,false,req),/Mã chỉnh sửa/);await assert.rejects(mark(takeaway.id,false,0,false),/thiết bị khác/);
 await one('select edit_saved_menu_selection($1,1,$2,2,$2)',[takeaway.id,'Không hành']);assert.equal((await one('select is_takeaway from order_items where id=$1',[takeaway.id])).is_takeaway,true);
 const sid=(await one('select session_id from orders where id=$1',[before])).session_id;
 await one('select send_saved_menu_selections(581,$1,$2::uuid[],gen_random_uuid(),$3::jsonb)',[sid,[before],'[]']);
 await mark(takeaway.id,false,1,true);await mark(takeaway.id,true,2,false);
 const split=(await one("select move_bill_items($1,gen_random_uuid(),1,0,$2::uuid[],'') bill",[sid,[takeaway.id]])).bill;await one("select move_bill_items($1,gen_random_uuid(),$3,1,$2::uuid[],'')",[sid,[takeaway.id],split]);
 await one("select link_dining_tables(gen_random_uuid(),581,584,$1,null,'same_bill')",[sid]);await one('select unlink_dining_table(gen_random_uuid(),581,584,$1)',[sid]);
 const after=await one('select * from order_items where id=$1',[takeaway.id]);assert.equal(after.qty,2);assert.equal(after.price,takeaway.price);assert.equal(after.note,takeaway.note);assert.equal(after.kitchen_position,takeaway.kitchen_position);assert.equal(after.order_id,takeaway.order_id);assert.equal(after.takeaway_version,3);
 // Kitchen completion freezes both selected and unselected meal markers.
 await as(kitchen);await one('select complete_kitchen_order($1)',[before]);await as();
 const frozen=await rows('select id,is_takeaway,takeaway_version,qty,price,note from order_items where order_id=$1 order by id',[before]);
 await db.exec('reset role');const editCount=(await one('select count(*)::int n from pos_sync.takeaway_edits')).n;await as();
 await assert.rejects(mark(takeaway.id,false,3,true),/Bếp đã ra món/);
 await assert.rejects(mark(eat.id,true,0,false),/Bếp đã ra món/);
 assert.deepEqual((await mark(takeaway.id,true,0,false,req)).value,first,'acknowledged old requests remain replayable after completion');
 assert.deepEqual(await rows('select id,is_takeaway,takeaway_version,qty,price,note from order_items where order_id=$1 order by id',[before]),frozen);
 await db.exec('reset role');assert.equal((await one('select count(*)::int n from pos_sync.takeaway_edits')).n,editCount);await as();
 // Drinks are not kitchen dishes, even when their storage status is done.
 const drinkOrder=(await one('select submit_non_kitchen_order(581,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:drink,qty:1,note:'Không đá'}])])).id;
 const drinkLine=await one('select * from order_items where order_id=$1',[drinkOrder]);
 assert.equal((await one('select status from orders where id=$1',[drinkOrder])).status,'done');
 await mark(drinkLine.id,true);assert.equal((await one('select is_takeaway from order_items where id=$1',[drinkLine.id])).is_takeaway,true);
 const dest=await save(582),destSid=(await one('select session_id from orders where id=$1',[dest])).session_id;assert.ok((await rows('select is_takeaway from order_items where order_id=$1',[dest])).every(i=>i.is_takeaway));
 // Bill/table transfers move the original row; destination defaults cannot overwrite it.
 await db.exec('reset role');await db.query('update order_items set bill_no=2 where id=$1',[eat.id]);await as();
 await one('select transfer_bill_to_table($1,581,2,582,gen_random_uuid(),$2::uuid[],$3)',[sid,[eat.id],destSid]);assert.equal((await one('select is_takeaway from order_items where id=$1',[eat.id])).is_takeaway,false);
 const ids=(await rows('select i.id from order_items i join orders o on o.id=i.order_id where o.session_id=$1 and i.bill_no=1 and not i.paid and i.cancelled_at is null',[sid])).map(i=>i.id);
 const bill=(await one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1) id",[sid,ids])).id;
 const snapshot=await rows('select source_item_id,is_takeaway,qty,price from bill_items where bill_id=$1',[bill]);assert.equal(snapshot.find(i=>i.source_item_id===takeaway.id).is_takeaway,true);
 await assert.rejects(mark(takeaway.id,false,3,true),/thanh toán/);await mark(takeaway.id,true,0,false,req);assert.deepEqual(await rows('select source_item_id,is_takeaway,qty,price from bill_items where bill_id=$1',[bill]),snapshot);
 const fresh=await save(),newItem=(await one('select id from order_items where order_id=$1 limit 1',[fresh])).id;await mark(newItem,true);await one("select cancel_order_item($1,'')",[newItem]);assert.equal((await one('select is_takeaway from order_items where id=$1',[newItem])).is_takeaway,true);await assert.rejects(mark(newItem,false,1,true),/chưa hủy/);
 const custom=await save(-583);assert.ok((await rows('select is_takeaway from order_items where order_id=$1',[custom])).every(i=>i.is_takeaway));
 await as(null);await assert.rejects(mark(newItem,false,1,true),/không có quyền/);await db.exec('reset role;set role anon');await assert.rejects(mark(newItem,false,1,true),/permission denied/);await db.exec('reset role');
 for(const condition of ['is_active=false','must_change_password=true']){await db.exec('begin');await db.query('update profiles set '+condition+' where id=$1',[waiter]);await as();await db.exec('savepoint denied');await assert.rejects(mark(newItem,false,1,true),/không có quyền/);await db.exec('rollback to denied;reset role;rollback');}
 assert.equal((await one("select has_table_privilege('authenticated','pos_sync.takeaway_edits','select') ok")).ok,false);
 console.log('PASS item takeaway SQL: default/backfill by table, separate same-dish lines, version/replay/no-op protection, completed meals frozen in both directions, completed-request replay, non-kitchen drink still editable, notes/qty/FIFO retained, sent edits, moved original flag retained, paid receipt snapshot immutable, canceled/paid/anonymous/locked/password denied, custom takeaway table default, no financial RPC changes. Local data only.');
}
