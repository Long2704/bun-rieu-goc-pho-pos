import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkSavedMenuSelections(db,owner,waiter,kitchen,food,drink){
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(id=owner)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261110161606_saved_menu_batches.sql',import.meta.url),'utf8'));
 await db.exec('begin');
 const denied=async(fn,re)=>{await db.exec('savepoint denied');try{await assert.rejects(fn,re);}finally{await db.exec('rollback to savepoint denied;release savepoint denied');}};
 try{
 await db.query("update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(211,'Menu 211',true,'dine_in',211),(212,'Menu 212',true,'dine_in',212)");
 await as(waiter);const request=crypto.randomUUID();
 const save=async(items,req=crypto.randomUUID(),table=211,session)=>one('select save_menu_selection($1,$2,$3::jsonb) id',[table,req,JSON.stringify(items.map(i=>({...i,...(session!==undefined?{expected_session_id:session}:{})})))]);
 const a=await save([{menu_item_id:food,qty:1,note:'Ít bún'}],request,211,null),original=await one('select * from orders where id=$1',[a.id]),sid=original.session_id;
 assert.equal(original.is_draft,true);assert.equal(original.kitchen_relevant,false);assert.equal(original.status,'cooking');await as(kitchen);await one('select complete_kitchen_order($1)',[a.id]);assert.equal((await one('select status from orders where id=$1',[a.id])).status,'cooking');await as(waiter);
 assert.equal((await save([{menu_item_id:food,qty:1,note:'Ít bún'}],request)).id,a.id);
 const b=await save([{menu_item_id:food,qty:2,note:'Không hành'},{menu_item_id:drink,qty:1,note:'Bỏ ghi chú nước'}],undefined,211,sid);
 const rowA=await one('select * from order_items where order_id=$1',[a.id]);
 assert.equal((await one("select count(*)::int n from orders where session_id=$1 and kitchen_relevant and status='cooking'",[sid])).n,0);
 await denied(async()=>one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1)",[sid,(await db.query('select i.id from order_items i join orders o on o.id=i.order_id where o.session_id=$1 and i.bill_no=1 and not i.paid and i.cancelled_at is null',[sid])).rows.map(i=>i.id)]),/chưa gửi bếp/);
 await denied(()=>save([{menu_item_id:food,qty:1}],undefined,211,null),/Phiên bàn đã thay đổi/);
 await one('select edit_saved_menu_selection($1,1,$2,3,$3)',[rowA.id,'Ít bún','Ít bún hơn']);await one('select edit_saved_menu_selection($1,1,$2,3,$3)',[rowA.id,'Ít bún','Ít bún hơn']);
 await denied(()=>one('select edit_saved_menu_selection($1,1,$2,4,$3)',[rowA.id,'Ít bún','Khác']),/thiết bị khác/);
 assert.equal((await one("select note from order_items where order_id=$1 and category='do_uong'",[b.id])).note,'');
 const notify=async(ids,req=crypto.randomUUID())=>one('select send_saved_menu_selections(211,$1,$2::uuid[],$3) id',[sid,ids,req]);
 const first=crypto.randomUUID();await notify([a.id],first);assert.equal((await one('select is_draft from orders where id=$1',[a.id])).is_draft,false);
 const c=await save([{menu_item_id:food,qty:1,note:'Lượt mới'}],undefined,211,sid);await notify([a.id],first);assert.equal((await one('select is_draft from orders where id=$1',[c.id])).is_draft,true);
 await denied(()=>one('select edit_saved_menu_selection($1,3,$2,4,$3)',[rowA.id,'Ít bún hơn','Không đổi món đã gửi']),/đã gửi bếp/);
 // Split a pending batch: both fragments stay pending and invisible to the kitchen.
 const split=(await one("select id from order_items where order_id=$1 and category='bun'",[b.id])).id;
 await db.exec('reset role');await db.query('update order_items set bill_no=2 where id=$1',[split]);await as(waiter);
 const moved=(await one('select transfer_bill_to_table($1,211,2,212,gen_random_uuid(),$2::uuid[],null) r',[sid,[split]])).r;
 const fragment=await one('select o.* from orders o join order_items i on i.order_id=o.id where i.id=$1',[split]);assert.equal(fragment.is_draft,true);assert.equal(fragment.kitchen_relevant,false);
 await denied(()=>one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1)",[moved.session_id,[split]]),/chưa gửi bếp/);
 const water=await save([{menu_item_id:drink,qty:1}],undefined,211,sid),waterItem=await one('select * from order_items where order_id=$1',[water.id]);await db.exec('reset role');await db.query('update order_items set bill_no=3 where id=$1',[waterItem.id]);await as(waiter);await one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],3)",[sid,[waterItem.id]]);
 await as(kitchen);assert.equal((await one("select has_function_privilege('anon','public.save_menu_selection(integer,uuid,jsonb)','execute') ok")).ok,false);
 await as(null);await denied(()=>save([{menu_item_id:food,qty:1}]),/không có quyền/);
 console.log('PASS saved menu selections SQL: persisted separate batches and notes, replay, stale session/optimistic edit conflicts, only captured batches notified, no kitchen exposure before send, payment guard, non-kitchen payment and partial bill-transfer pending state, anon denial.');
 }finally{await db.exec('rollback;reset role');}
}
