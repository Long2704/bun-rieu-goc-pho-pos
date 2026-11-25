import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkCatalogDeletion(db,admin){
 const one=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.exec('reset role');
 const before=(await db.query('select * from bills order by id')).rows;
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261125170800_catalog_soft_delete.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select * from bills order by id')).rows,before);
 const identities={};for(const role of ['admin_phu','thu_ngan','phuc_vu','bep']){const id=crypto.randomUUID();identities[role]=id;await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,name,role,username) values($1,$2,$2,$3)',[id,role,'delete_'+role]);}
 const food=crypto.randomUUID(),keep=crypto.randomUUID(),cashItem=crypto.randomUUID();
 for(const id of [food,keep,cashItem])await db.query("insert into menu_items(id,name,price,category) values($1,$2,58000,'bun')",[id,'Test '+id]);
 await db.query("insert into menu_item_groups(item_id,group_id) values($1,'bun')",[food]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(9101,'Delete paid table',true,'dine_in',9101),(9102,'Delete busy table',true,'dine_in',9102),(9103,'Delete empty table',true,'dine_in',9103),(9104,'Rename reuse',true,'dine_in',9104)");
 const del=(kind,id,version=1,request=crypto.randomUUID())=>one('select delete_catalog_entry($1,$2,$3,$4,$5) r',[request,kind,version,kind==='menu'?id:null,kind==='table'?id:null]);
 await as(admin);
 const order=(await one('select submit_order(9101,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:2,note:'Giữ nguyên'}])])).id;
 const item=(await one('select * from order_items where order_id=$1',[order]));const session=(await one('select session_id from orders where id=$1',[order])).session_id;
 await one('select complete_kitchen_order($1)',[order]);const bill=(await one("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1) id",[session,[item.id]])).id;
 const receipt=await one('select * from bills where id=$1',[bill]),receiptItems=(await db.query('select * from bill_items where bill_id=$1',[bill])).rows;
 const liveOrder=(await one('select submit_order(9102,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:1,note:'Đơn còn làm'}])])).id;
 const activeBefore=(await db.query('select * from order_items where order_id=$1',[liveOrder])).rows;
 const request=crypto.randomUUID();const result=(await del('menu',food,1,request)).r;
 assert.equal(result.ok,true);assert.deepEqual((await del('menu',food,1,request)).r,result,'same UUID replay returns exact result');
 await assert.rejects(del('menu',keep,1,request),/đã được sử dụng/);
 assert.ok(!(await one('select list_menu_management() r')).r.some(x=>x.id===food));
 assert.deepEqual((await db.query('select * from order_items where order_id=$1',[liveOrder])).rows,activeBefore,'deletion is not cancellation');
 assert.deepEqual(await one('select * from bills where id=$1',[bill]),receipt);assert.deepEqual((await db.query('select * from bill_items where bill_id=$1',[bill])).rows,receiptItems);
 assert.equal((await one('select is_active from menu_items where id=$1',[food])).is_active,false);
 assert.equal((await one('select count(*)::int n from menu_item_groups where item_id=$1',[food])).n,0);
 await assert.rejects(one("select save_menu_item(gen_random_uuid(),$1,2,'Restore',58000,'bun',true,false,0)",[food]),/đã bị xóa/);
 await assert.rejects(one('select submit_order(9103,gen_random_uuid(),$1::jsonb)',[JSON.stringify([{menu_item_id:food,qty:1}])]),/không còn bán|không hoạt động|thay đổi|Không tìm|không tồn tại|hết/);
 const snapshot=(await one('select list_menu_management() r')).r.map(x=>({id:x.id,version:x.version,sort:x.sort}));
 await one('select reorder_menu_items(gen_random_uuid(),$1::jsonb,$2::uuid[])',[JSON.stringify(snapshot),snapshot.map(x=>x.id).reverse()]);
 await assert.rejects(del('table',9102),/đang có khách/);
 await db.exec('reset role');const linkedSession=(await one('select session_id from orders where id=$1',[liveOrder])).session_id;await db.query('insert into active_table_links(table_id,session_id) values(9103,$1)',[linkedSession]);await as(admin);assert.equal((await one('select list_table_management() r')).r.find(t=>t.id===9103).busy,true);await assert.rejects(del('table',9103),/đang gộp/);await db.exec('reset role');await db.exec('delete from active_table_links where table_id=9103');await as(admin);
 const tableReq=crypto.randomUUID();await del('table',9101,1,tableReq);await del('table',9101,1,tableReq);
 assert.ok(!(await one('select list_table_management() r')).r.some(x=>x.id===9101));
 assert.deepEqual(await one('select * from bills where id=$1',[bill]),receipt);
 await assert.rejects(one("select save_restaurant_table(gen_random_uuid(),9101,2,'Restore',true)"),/đã bị xóa/);
 const ids=(await one('select list_table_management() r')).r.map(x=>x.id);await one('select reorder_restaurant_tables(gen_random_uuid(),$1::integer[],$2::integer[])',[ids,ids.slice().reverse()]);
 // Secondary Admin has all catalog permissions, while dish cancellation remains denied.
 await as(identities.admin_phu);await del('table',9103);assert.equal((await one("select has_permission('orders.cancel') ok")).ok,false);
 await as(identities.thu_ngan);await del('menu',cashItem,Number((await one('select version from menu_items where id=$1',[cashItem])).version));await del('table',9104);
 await as(admin);await one("select save_restaurant_table(gen_random_uuid(),null,0,'Rename reuse',true)");
 for(const role of ['phuc_vu','bep']){await as(identities[role]);await assert.rejects(del('menu',keep),/không có quyền/);await assert.rejects(del('table',9102),/không có quyền/);}
 await db.exec('reset role');await db.query('update profiles set is_active=false where id=$1',[identities.thu_ngan]);await as(identities.thu_ngan);await assert.rejects(del('menu',keep),/không có quyền/);
 await db.exec('reset role;set role anon');await assert.rejects(del('menu',keep),/permission denied/);await db.exec('reset role');
 assert.equal((await one("select count(*)::int n from audit_log where type='menu_deleted' and extra->>'item_id'=$1",[food])).n,1);
 assert.equal((await one("select count(*)::int n from audit_log where type='table_deleted' and extra->>'table_id'='9101'")).n,1);
 // Reject stale menu versions and don't change the item on rejection.
 await as(admin);const version=(await one('select version from menu_items where id=$1',[keep])).version;
 await assert.rejects(del('menu',keep,Number(version)+1),/đã thay đổi/);await db.exec('reset role');
 console.log('PASS catalog deletion: permission matrix, active/paid snapshots untouched, blocked busy table, historical labels/receipts, replay/audit-once, stale-version denial, retired-entry save denial, reorder after deletion, cashier/deputy allowed, waiter/kitchen/locked/anonymous denied.');
}
