import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkScopedRealtime(db,waiter,food,drink){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261111161135_scoped_realtime_snapshots.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(id=waiter)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 const delta=async ids=>(await one('select get_pos_sync_delta($1::uuid[]) value',[ids])).value;
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(431,'Scope 431',true,'dine_in',431),(432,'Scope 432',true,'dine_in',432),(433,'Scope 433',true,'dine_in',433)");
 await as();const save=async(table,note)=>(await one('select save_menu_selection($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify([{menu_item_id:food,qty:1,note},{menu_item_id:drink,qty:1,note:'Ít đá'}])])).id;
 const a=await save(431,'Ít bún'),b=await save(432,'Bàn khác');
 const sid=(await one('select session_id from orders where id=$1',[a])).session_id,other=(await one('select session_id from orders where id=$1',[b])).session_id;
 const snapshot=await delta([sid]);assert.deepEqual(snapshot.session_ids,[sid]);assert.equal(snapshot.sessions.length,1);assert.equal(snapshot.sessions[0].table_id,431);assert.equal(snapshot.kitchen.length,0);assert.equal(snapshot.sessions[0].orders[0].order_items.length,2);
 const id=(await one("select id from order_items where order_id=$1 and category='bun'",[a])).id;
 await db.exec('reset role');const before=(await one('select count(*)::int n from realtime.messages')).n;await as();
 await one('select edit_saved_menu_selection($1,1,$2,2,$3)',[id,'Ít bún','Không hành']);
 await db.exec('reset role');const after=(await one('select count(*)::int n from realtime.messages')).n;assert.equal(after-before,1);const event=(await one("select payload from realtime.messages where payload->>'version'='2' and payload->>'session_id'=$1 limit 1",[sid])).payload;assert.deepEqual(event,{version:2,session_id:sid});await as();
 assert.equal((await delta([sid])).sessions[0].orders[0].order_items.find(i=>i.id===id).note,'Không hành');assert.equal((await delta([other])).sessions[0].orders[0].order_items[0].qty,1);
 await one('select send_saved_menu_selections(431,$1,$2::uuid[],gen_random_uuid(),$3::jsonb)',[sid,[a],'[]']);
 let current=await delta([sid]);assert.equal(current.kitchen.length,1);assert.equal(current.kitchen[0].id,a);assert.equal(current.kitchen[0].table_sessions.table_id,431);
 const itemIds=current.sessions[0].orders[0].order_items.filter(i=>!i.paid&&!i.cancelled_at).map(i=>i.id);
 await one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1)",[sid,itemIds]);current=await delta([sid]);assert.equal(current.sessions.length,0);assert.equal(current.kitchen.length,1,'paid/closed table still has its cooking ticket');assert.ok(current.kitchen[0].order_items.every(i=>i.paid));
 await db.exec('reset role');const kitchen=(await one("select id from profiles where role='bep' and is_active and not must_change_password limit 1")).id;await as(kitchen);await one('select complete_kitchen_order($1)',[a]);assert.equal((await delta([sid])).kitchen.length,0);
 await as();await one("select link_dining_tables(gen_random_uuid(),432,433,$1,null,'same_bill')",[other]);current=await delta([other]);assert.equal(current.sessions.length,1);assert.equal(current.links.length,2);assert.ok(current.links.every(l=>l.session_id===other));
 await one('select unlink_dining_table(gen_random_uuid(),432,433,$1)',[other]);assert.equal((await delta([other])).links.length,0);
 for(const invalid of [null,[],Array(31).fill(sid),[null]])await assert.rejects(delta(invalid),/Phạm vi/);
 await as(null);await assert.rejects(delta([sid]),/không có quyền/);
 await db.exec('reset role;set role anon');await assert.rejects(delta([sid]),/permission denied/);await db.exec('reset role');
 assert.equal((await one("select has_function_privilege('anon','get_pos_sync_delta(uuid[])','execute') ok")).ok,false);
 for(const condition of ['is_active=false','must_change_password=true']){await db.exec('begin');await db.query('update profiles set '+condition+' where id=$1',[waiter]);await as();await db.exec('savepoint denied');await assert.rejects(delta([other]),/không có quyền/);await db.exec('rollback to denied;reset role;rollback');}
 // Bulk maintenance cannot produce an unbounded message fan-out.
 await db.exec('begin');const bulkBefore=(await one('select count(*)::int n from realtime.messages')).n;
 await db.exec("create temporary table orders(id uuid,session_id uuid);create trigger probe after insert on pg_temp.orders for each row execute function pos_sync.invalidate('orders');insert into pg_temp.orders select gen_random_uuid(),gen_random_uuid() from generate_series(1,40)");
 assert.equal((await one('select count(*)::int n from realtime.messages')).n-bulkBefore,31,'30 scopes plus one full signal, remaining scopes suppressed');await db.exec('rollback');
 console.log('PASS scoped SQL: real save/edit/send/pay/complete/group/unlink RPCs, one signal per affected session/transaction, exact scope, no unrelated table data, paid cooking retained, table closure/removal, links, bounded requests/bulk notification fan-out, inactive/password/anonymous denial. Local database only.');
}
