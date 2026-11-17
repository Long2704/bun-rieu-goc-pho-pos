import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkCashierKitchenCompletion(db,admin,food){
 await db.exec('reset role');const cashier=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[cashier]);await db.query("insert into profiles(id,name,role,is_active,must_change_password,username) values($1,'Cashier complete','thu_ngan',true,false,'completion_test')",[cashier]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261117045941_cashier_kitchen_image_upload.sql',import.meta.url),'utf8'));
 await as(cashier);const before=(await db.query('select get_my_access() a')).rows[0].a.permissions.sort();
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261117075552_cashier_kitchen_completion.sql',import.meta.url),'utf8'));
 await as(cashier);assert.deepEqual((await db.query('select get_my_access() a')).rows[0].a.permissions.sort(),[...before,'kitchen.complete'].sort());
 await db.exec("reset role;insert into restaurant_tables(id,name,is_active,service_type,display_order) values(2011,'Test completion',true,'dine_in',2011)");await as(cashier);
 const order=(await db.query('select submit_order(2011,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:1}])])).rows[0].id;
 const original=(await db.query('select * from order_items where order_id=$1',[order])).rows[0];
 await db.query('select complete_kitchen_order($1)',[order]);const done=(await db.query('select status,done_at from orders where id=$1',[order])).rows[0];assert.equal(done.status,'done');assert.ok(done.done_at);
 await db.query('select complete_kitchen_order($1)',[order]);assert.deepEqual((await db.query('select status,done_at from orders where id=$1',[order])).rows[0],done);
 await assert.rejects(db.query("select cancel_order_item($1,'')",[original.id]),/Chỉ Admin/);
 const session=(await db.query('select session_id from orders where id=$1',[order])).rows[0].session_id;await assert.rejects(db.query('select cancel_table_session($1,gen_random_uuid(),$2::uuid[])',[session,[original.id]]),/Chỉ Admin/);
 assert.deepEqual((await db.query('select * from order_items where id=$1',[original.id])).rows[0],original);
 for(const permission of ['reports.read','employees.manage','settings.manage'])assert.equal((await db.query('select has_permission($1) ok',[permission])).rows[0].ok,false);
 await db.exec('reset role');await db.query('update profiles set is_active=false where id=$1',[cashier]);await as(cashier);await assert.rejects(db.query('select complete_kitchen_order($1)',[order]),/không có quyền/);await db.exec('reset role');
 console.log('PASS Cashier kitchen completion: exact permission delta, actual completion/replay, served cancellations still denied, no item/payment changes, financial/staff/disabled access protections retained.');
}
