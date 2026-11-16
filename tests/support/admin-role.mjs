import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkAdminRole(db,owner,cashier,waiter,kitchen){
 await db.exec('reset role');
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=any($1::uuid[])',[[owner,cashier,waiter,kitchen]]);
 await db.query("update profiles set role='thu_ngan' where id=$1",[cashier]);
 const before=new Map();for(const id of [owner,cashier,waiter,kitchen]){await as(id);before.set(id,(await db.query('select get_my_access() a')).rows[0].a);}
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261116141839_admin_role_and_self_password.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select role from profiles where id=$1',[owner])).rows[0].role,'admin');
 for(const id of [owner,cashier,waiter,kitchen]){
  await as(id);const a=(await db.query('select get_my_access() a')).rows[0].a;
  assert.equal(a.actual_role,id===owner?'admin':before.get(id).role);assert.equal(a.role,before.get(id).role);
  assert.deepEqual(a.permissions.sort(),before.get(id).permissions.sort(),'no permissions lost or gained');
  assert.equal(a.is_active,true);for(const flag of ['dashboard_aggregates','catalog_versions','live_snapshot','saved_menu_selections','linked_tables'])assert.equal(a[flag],true);
 }
 await as(owner);assert.equal((await db.query("select current_staff_role() r,has_permission('employees.manage') ok")).rows[0].r,'chu');
 for(const filter of ['admin','chu']){const list=(await db.query('select list_employees(p_role:=$1) r',[filter])).rows[0].r;assert.ok(list.items.some(p=>p.id===owner&&p.role==='admin'));}
 const req=crypto.randomUUID();assert.ok((await db.query("select prepare_employee_account($1,'admin-cashier-test','Test cashier','thu_ngan') r",[req])).rows[0].r);
 await db.exec('reset role');const newId=crypto.randomUUID(),prepared=(await db.query('select email from employee_creation_requests where request_id=$1',[req])).rows[0];
 await db.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4)',[newId,prepared.email,'local-test-hash',{pos_employee_request:req}]);
 assert.equal((await db.query('select role from profiles where id=$1',[newId])).rows[0].role,'thu_ngan');
 await as(owner);let employee=(await db.query('select staff_version from profiles where id=$1',[newId])).rows[0];
 await db.query("select update_employee_account(gen_random_uuid(),$1,$2,'Cashier edited','admin-cashier-test','thu_ngan',true)",[newId,employee.staff_version]);
 employee=(await db.query('select staff_version from profiles where id=$1',[newId])).rows[0];
 await db.query('select begin_employee_password_reset(gen_random_uuid(),$1,$2)',[newId,employee.staff_version]);
 const waiterVersion=(await db.query('select staff_version from profiles where id=$1',[waiter])).rows[0].staff_version;
 await db.query('select begin_employee_deletion(gen_random_uuid(),$1,$2)',[waiter,waiterVersion]);
 for(const id of [cashier,waiter,kitchen]){await as(id);await assert.rejects(db.query('select list_employees()'),/Admin|quyền/);await assert.rejects(db.query("select prepare_employee_account(gen_random_uuid(),'forbidden-admin','No','admin')"),/Admin|quyền/);}
 await db.exec('reset role');
 for(const q of ["update profiles set is_active=false where id=$1","update profiles set role='thu_ngan' where id=$1",'delete from profiles where id=$1'])await assert.rejects(db.query(q,[owner]),/Admin.*cuối cùng/);
 await assert.rejects(db.query("update profiles set role='chu' where id=$1",[cashier]),/profiles_role_check/);
 await assert.rejects(db.query('update profiles set must_change_password=true where id=$1',[owner]),/profiles_owner_password_ready/);
 await db.query('update profiles set is_active=false where id=$1',[cashier]);await as(cashier);assert.equal((await db.query("select has_permission('menu.manage') ok")).rows[0].ok,false);
 await db.exec('reset role;set role anon');assert.equal((await db.query("select has_function_privilege('anon','public.list_employees(text,text,boolean,integer,integer)','execute') ok")).rows[0].ok,false);await db.exec('reset role');
 console.log('PASS canonical Admin migration: account identity retained, exact role permissions, legacy compatibility, flags, staff provisioning, last Admin protection, retired Owner role rejected, locked/anonymous denial.');
}
