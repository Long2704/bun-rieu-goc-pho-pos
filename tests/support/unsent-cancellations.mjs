import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitchenLines} from '../../src/order-model.ts';
import {kitchenFulfillmentTitle} from '../../src/item-fulfillment.ts';
export async function checkUnsentCancellations(db,waiter,food){
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0],rows=async(q,p=[])=>(await db.query(q,p)).rows;
 const as=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.exec('set role authenticated');};
 await db.exec('reset role');await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(681,'Bàn 681',true,'dine_in',681),(682,'Bàn 682',true,'dine_in',682)");await as();
 const save=async(table=681,notes=['Hủy trước gửi','Giữ mang về','Hủy sau gửi'])=>(await one('select save_menu_selection($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify(notes.map(note=>({menu_item_id:food,qty:1,note})))])).id;
 // Reproduce the reported bug on the old schema: cancel one line in the batch
 // that will later become the anchor kitchen ticket.
 const legacy=await save(),legacySid=(await one('select session_id from orders where id=$1',[legacy])).session_id;
 let lines=await rows('select * from order_items where order_id=$1 order by kitchen_position',[legacy]);await one("select cancel_order_item($1,'')",[lines[0].id]);
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261112031554_distinguish_unsent_cancellations.sql',import.meta.url),'utf8'));await as();
 const send=async(ids,sid=legacySid,table=681)=>one('select send_saved_menu_selections($1,$2,$3::uuid[],gen_random_uuid(),$4::jsonb)',[table,sid,ids,'[]']);
 await send([legacy]);lines=await rows('select * from order_items where order_id=$1 order by kitchen_position',[legacy]);assert.equal(lines[0].cancelled_before_kitchen,true);assert.equal(lines[0].order_id,legacy);assert.equal(kitchenLines({order_items:lines}).length,2);
 await one("select cancel_order_item($1,'')",[lines[2].id]);lines=await rows('select * from order_items where order_id=$1 order by kitchen_position',[legacy]);assert.equal(lines[2].cancelled_before_kitchen,false);assert.deepEqual(kitchenLines({order_items:lines}).map(i=>i.id),[lines[1].id,lines[2].id]);assert.ok(kitchenLines({order_items:lines})[1].cancelled_at);
 // New cancellations are classified immediately, including non-anchor batches.
 const fresh=await save(681,['Trước gửi mới','Món còn']),another=await save(681,['Lượt khác']);let freshLines=await rows('select * from order_items where order_id=$1 order by kitchen_position',[fresh]);const original={id:freshLines[0].id,qty:freshLines[0].qty,price:freshLines[0].price,note:freshLines[0].note,kitchen_position:freshLines[0].kitchen_position};
 await one("select cancel_order_item($1,'')",[freshLines[0].id]);assert.equal((await one('select cancelled_before_kitchen from order_items where id=$1',[freshLines[0].id])).cancelled_before_kitchen,true);await send([fresh,another]);
 const retained=await one('select id,qty,price,note,kitchen_position from order_items where id=$1',[freshLines[0].id]);assert.deepEqual(retained,original);
 const ticket=await one('select * from orders where id=$1',[fresh]);ticket.order_items=await rows('select * from order_items where order_id=$1 order by kitchen_position',[fresh]);assert.ok(!kitchenLines(ticket).some(i=>i.id===freshLines[0].id));
 // A previously sent cancellation remains visible even with an earlier timestamp;
 // use locked order state, not transaction-start clock ordering.
 await db.exec('reset role');const active=ticket.order_items.find(i=>!i.cancelled_at);await db.query("update order_items set cancelled_at=(select created_at-interval '1 second' from orders where id=order_id),cancelled_by=$2,cancel_reason='' where id=$1",[active.id,waiter]);assert.equal((await one('select cancelled_before_kitchen from order_items where id=$1',[active.id])).cancelled_before_kitchen,false);await as();
 const all=await save(682,['Hủy hết']);const allSid=(await one('select session_id from orders where id=$1',[all])).session_id,only=(await one('select id from order_items where order_id=$1',[all])).id;await one("select cancel_order_item($1,'')",[only]);await assert.rejects(send([all],allSid,682),/Phiên bàn/);assert.equal((await one('select count(*)::int n from orders where session_id=$1 and kitchen_relevant',[allSid])).n,0);
 // Hidden dine-in cancellation cannot turn an all-takeaway ticket into mixed.
 const visible={...lines[1],is_takeaway:true},hidden={...lines[0],is_takeaway:false};assert.equal(kitchenFulfillmentTitle({order_items:[hidden,visible]},'Bàn 681'),'Bàn 681 (Mang về)');
 console.log('PASS unsent cancellations: reproduce/fix legacy anchor, classify fresh draft cancellation, keep original line/audit data, preserve sent cancellation and FIFO, combined batches, all-canceled batch creates no ticket, timestamp race classification, takeaway title ignores hidden lines. Local PostgreSQL only.');
 await db.exec('reset role');
}
