import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkDeputyAdmin(db,admin,food){
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261125155336_deputy_admin_no_cancellation.sql',import.meta.url),'utf8'));
 const deputy=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[deputy]);await db.query("insert into profiles(id,name,role,username) values($1,'Admin phụ','admin_phu','admin2_test')",[deputy]);
 await as(admin);const main=(await db.query('select get_my_access() a')).rows[0].a;
 await as(deputy);let access=(await db.query('select get_my_access() a')).rows[0].a;
 assert.equal(access.actual_role,'admin_phu');assert.equal(access.role,'chu');assert.equal(access.is_active,true);
 assert.deepEqual(access.permissions.toSorted(),main.permissions.filter(p=>!['orders.cancel','tables.cancel'].includes(p)).toSorted());
 assert.ok(access.permissions.includes('employees.manage'));assert.ok(access.permissions.includes('settings.manage'));assert.ok(access.permissions.includes('reports.read'));
 assert.ok((await db.query("select list_employees(p_role:='admin_phu') r")).rows[0].r.items.some(p=>p.id===deputy));
 const request=crypto.randomUUID();await db.query("select prepare_employee_account($1,'deputy_staff_test','Staff by deputy','thu_ngan')",[request]);
 await db.exec('reset role');const employee=crypto.randomUUID(),email=(await db.query('select email from employee_creation_requests where request_id=$1',[request])).rows[0].email;
 await db.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4)',[employee,email,'local-test-password',{pos_employee_request:request}]);
 await as(deputy);const version=(await db.query('select staff_version from profiles where id=$1',[employee])).rows[0].staff_version;
 await db.query("select update_employee_account(gen_random_uuid(),$1,$2,'Updated by deputy','deputy_staff_test','thu_ngan',true)",[employee,version]);
 await db.exec("reset role;insert into restaurant_tables(id,name,is_active,service_type,display_order) values(2099,'Deputy test',true,'dine_in',2099)");await as(deputy);
 const order=(await db.query('select submit_order(2099,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:2}])])).rows[0].id;
 const item=(await db.query('select * from order_items where order_id=$1',[order])).rows[0];const session=(await db.query('select session_id from orders where id=$1',[order])).rows[0].session_id;
 for(const completed of [false,true]){
  if(completed)await db.query('select complete_kitchen_order($1)',[order]);
  await assert.rejects(db.query("select cancel_order_item($1,'')",[item.id]),/không có quyền/);
  await assert.rejects(db.query('select cancel_table_session($1,gen_random_uuid(),$2::uuid[])',[session,[item.id]]),/không có quyền/);
  assert.deepEqual((await db.query('select * from order_items where id=$1',[item.id])).rows[0],item);
 }
 // The saved-draft editor is a separate cancellation path. It must not bypass the role.
 await db.exec('reset role');await db.query('update orders set is_draft=true where id=$1',[order]);await as(deputy);
 for(const qty of [0,1])await assert.rejects(db.query('select edit_saved_menu_selection($1,2,$2,$3,$2)',[item.id,item.note,qty]),/không có quyền hủy hoặc giảm/);
 await db.query('select edit_saved_menu_selection($1,2,$2,3,$2)',[item.id,item.note]);
 await db.exec('reset role');await db.query('update orders set is_draft=false where id=$1',[order]);
 // Self-service initial password change unlocks deputy access without granting cancellations.
 await db.query('update profiles set must_change_password=true where id=$1',[deputy]);await as(deputy);assert.deepEqual((await db.query('select get_my_access() a')).rows[0].a.permissions,[]);
 await db.exec('reset role');await db.query('update auth.users set encrypted_password=$2 where id=$1',[deputy,'changed-local-test-hash']);await as(deputy);access=(await db.query('select get_my_access() a')).rows[0].a;assert.equal(access.must_change_password,false);assert.ok(access.permissions.includes('employees.manage'));assert.ok(!access.permissions.includes('orders.cancel'));
 await as(admin);assert.equal((await db.query("select has_permission('orders.cancel') ok")).rows[0].ok,true);await db.query("select cancel_order_item($1,'Main Admin retains cancellation')",[item.id]);
 await db.exec('reset role');await db.query('update profiles set is_active=false where id=$1',[deputy]);await as(deputy);assert.equal((await db.query("select has_permission('reports.read') ok")).rows[0].ok,false);await db.exec('reset role');
 console.log('PASS deputy Admin: exact Admin-minus-cancellation permissions; staff provision/update, served/unserved cancellation denied, saved-quantity bypass blocked, self password change, disabled denial, main Admin retains cancellation.');
}
