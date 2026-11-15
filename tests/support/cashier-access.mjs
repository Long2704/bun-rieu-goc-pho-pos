import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
export async function checkCashierAccess(db,owner,cashier,waiter,kitchen,food){
 const row=async(q,p=[])=>{await db.exec('savepoint cashier_check');try{const value=(await db.query(q,p)).rows[0];await db.exec('release savepoint cashier_check');return value;}catch(e){await db.exec('rollback to savepoint cashier_check;release savepoint cashier_check');throw e;}},rows=async(q,p=[])=>(await db.query(q,p)).rows;
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const before=new Map();for(const id of [owner,waiter,kitchen]){await as(id);before.set(id,(await db.query('select get_my_access() a')).rows[0].a.permissions.filter(p=>p!=='reports.operations').sort());}
 await db.exec('reset role');
 const file=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).find(n=>n.endsWith('_cashier_operational_access.sql'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('begin');
 try{
 for(const id of [owner,waiter,kitchen]){await as(id);assert.deepEqual((await row('select get_my_access() a')).a.permissions.filter(p=>p!=='reports.operations').sort(),before.get(id),'existing role permissions preserved');}await db.exec('reset role');
 await db.query("update profiles set role='thu_ngan',is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[cashier]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(601,'Cashier thử 601',true,'dine_in',601),(602,'Mang về 602',true,'dine_in',602)");
 await as(cashier);
 const access=(await row('select get_my_access() a')).a;
 for(const permission of ['orders.read','orders.create','orders.cancel','payments.collect','payments.discount','tables.transfer','tables.cancel','bills.split','menu.manage','tables.manage','reports.operations','receipts.read_own'])assert.ok(access.permissions.includes(permission),permission);
 for(const permission of ['reports.read','receipts.read_all','employees.manage','audit.read','settings.manage','kitchen.complete'])assert.equal((await row('select has_permission($1) ok',[permission])).ok,false,permission);
 await assert.rejects(row('select revenue_report(current_date,current_date)'),/quyền/);
 // No financial rows from another cashier, even by a direct table query.
 assert.equal((await row('select count(*)::int n from bills')).n,0);
 assert.equal((await row('select count(*)::int n from bill_items')).n,0);
 await assert.rejects(row('select list_employees()'),/quyền|Owner/);
 await assert.rejects(row("select prepare_employee_account(gen_random_uuid(),'forbidden','No','chu')"),/quyền|Owner/);
 assert.ok(Array.isArray((await row('select list_menu_management() m')).m));
 const item=crypto.randomUUID();await row("select save_menu_item(gen_random_uuid(),$1,0,'Cashier món thử',42000,'bun',true,false,991)",[item]);
 await row("select save_menu_item(gen_random_uuid(),$1,1,'Cashier món đổi giá',43000,'bun',true,false,991)",[item]);
 const group=(await row("select create_menu_group(gen_random_uuid(),'Nhóm thu ngân thử','bun') g")).g;
 assert.ok(group);await row('select list_table_management()');
 const day=(await row("select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text d")).d;
 const report=async()=> (await row('select cashier_operations_report($1,$1) r',[day])).r;
 const baseline=await report();
 const pay=async(table,qty,lines=[{menu_item_id:item,qty}])=>{
  const order=(await row('select submit_order($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify(lines)])).id;
  const session=(await row('select session_id from orders where id=$1',[order])).session_id;
  const ids=(await rows('select id from order_items where order_id=$1',[order])).map(i=>i.id);
  const bill=(await row("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[]) id",[session,ids])).id;
  return {bill,order,session,ids};
 };
 const first=await pay(601,2);
 assert.equal((await row('select id from bills where id=$1',[first.bill])).id,first.bill);
 await db.exec('reset role');await db.query("update bills set paid_at=clock_timestamp()-interval '2 seconds' where id=$1",[first.bill]);await as(cashier);
 const second=await pay(602,3);
 assert.equal((await row('select count(*)::int n from bills')).n,1,'latest receipt only');
 assert.equal((await row('select count(*)::int n from bills where id=$1',[first.bill])).n,0,'old own receipt hidden');
 assert.equal((await row('select count(*)::int n from bill_items where bill_id=$1',[first.bill])).n,0,'old own item money hidden');
 const gift=crypto.randomUUID(),extra=crypto.randomUUID();
 await row("select save_menu_item(gen_random_uuid(),$1,0,'Chả ốc (Tặng)',0,'an_them',true,false,992)",[gift]);
 await row("select save_menu_item(gen_random_uuid(),$1,0,'Bún thêm thử',10000,'an_them',true,false,993)",[extra]);
 const nonMain=await pay(601,0,[{menu_item_id:gift,qty:1},{menu_item_id:extra,qty:4}]);
 const cancelled=(await row('select submit_order(601,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:item,qty:2}])])).id;
 const cancelledItem=await row('select id from order_items where order_id=$1',[cancelled]);
 await row("select cancel_order_item($1,'Khách đổi ý')",[cancelledItem.id]);
 const result=await report();assert.deepEqual(Object.keys(result).sort(),['from','to','main_qty','takeaway_qty','gift_qty','cancelled_qty','slots'].sort());
 assert.equal(result.main_qty-baseline.main_qty,5);assert.equal(result.gift_qty-baseline.gift_qty,1);assert.equal(result.cancelled_qty-baseline.cancelled_qty,2);assert.equal(result.takeaway_qty-baseline.takeaway_qty,3);
 assert.equal(result.slots.reduce((n,s)=>n+s.main_qty,0),result.main_qty);
 assert.equal(result.slots.reduce((n,s)=>n+s.takeaway_qty,0),result.takeaway_qty);
 assert.equal(/price|total|gross|discount|cash|invoice|product|name/.test(JSON.stringify(result)),false,'response contains no financial or per-product fields');
 await assert.rejects(row('select cashier_operations_report(current_date,current_date+31)'),/31 ngày/);
 await assert.rejects(row('select complete_kitchen_order($1)',[second.order]),/quyền/);
 await as(kitchen);await row('select complete_kitchen_order($1)',[first.order]);await row('select complete_kitchen_order($1)',[second.order]);
 await as(cashier);
 assert.equal((await row('select count(*)::int n from orders where id=any($1::uuid[])',[[first.order,second.order]])).n,0,'closed completed order money hidden');
 assert.equal((await row('select count(*)::int n from order_items where id=any($1::uuid[])',[[...first.ids,...second.ids]])).n,0);
 // Backend validation permits Owner to create/edit/reset/remove the cashier role.
 await as(owner);
 const req=crypto.randomUUID();await row("select prepare_employee_account($1,'cashier-new','Thu ngân mới','thu_ngan')",[req]);
 const newId=crypto.randomUUID();await db.exec('reset role');const email=`employee_${req.replaceAll('-','')}@staff.pos.invalid`;
 // Use the actual prepared email rather than guessing the internal format.
 const prepared=await row('select email from employee_creation_requests where request_id=$1',[req]);
 await db.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4)',[newId,prepared.email,'test-only-hash',{pos_employee_request:req}]);
 assert.equal((await row('select role from profiles where id=$1',[newId])).role,'thu_ngan');
 await as(owner);let employee=await row('select staff_version from profiles where id=$1',[newId]);
 await row("select update_employee_account(gen_random_uuid(),$1,$2,'Thu ngân sửa','cashier-new','thu_ngan',true)",[newId,employee.staff_version]);
 employee=await row('select staff_version from profiles where id=$1',[newId]);
 await row('select begin_employee_password_reset(gen_random_uuid(),$1,$2)',[newId,employee.staff_version]);
 const currentCashier=await row('select staff_version from profiles where id=$1',[cashier]);
 await row('select begin_employee_deletion(gen_random_uuid(),$1,$2)',[cashier,currentCashier.staff_version]);
 await db.exec('reset role');await db.query("update profiles set is_active=false where id=$1",[cashier]);await as(cashier);
 assert.equal((await row("select has_permission('reports.operations') ok")).ok,false);await assert.rejects(report(),/quyền/);
 await as(waiter);assert.equal((await row("select has_permission('reports.operations') ok")).ok,false);await assert.rejects(report(),/quyền/);
 await db.exec('reset role;set role anon');assert.equal((await row("select has_function_privilege('anon','public.cashier_operations_report(date,date)','execute') ok")).ok,false);
 }finally{await db.exec('rollback;reset role');}
 console.log('PASS cashier SQL: operating/menu/group/table permissions; Owner-only staff administration; quantity-only report; money/history RLS including old own receipts and closed order items; real payment receipt; role provisioning/edit/reset; disabled/anonymous/other-role denial.');
}
