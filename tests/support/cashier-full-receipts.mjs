import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkCashierFullReceipts(db,owner,cashier,waiter,kitchen,food){
 const row=async(q,p=[])=>{await db.exec('savepoint check_receipt');try{const r=(await db.query(q,p)).rows[0];await db.exec('release savepoint check_receipt');return r;}catch(e){await db.exec('rollback to savepoint check_receipt;release savepoint check_receipt');throw e;}};
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261115165922_cashier_full_receipt_access.sql',import.meta.url),'utf8'));
 await db.exec('begin');
 try{
 await db.query("update profiles set role='thu_ngan',is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[cashier]);
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=any($1::uuid[])',[[owner,waiter,kitchen]]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(881,'Receipt 881',true,'dine_in',881),(882,'Receipt 882',true,'dine_in',882)");
 const pay=async(id,table)=>{await as(id);const o=(await row('select submit_order($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify([{menu_item_id:food,qty:1}])])).id;const session=(await row('select session_id from orders where id=$1',[o])).session_id;const ids=(await db.query('select id from order_items where order_id=$1',[o])).rows.map(i=>i.id);return(await row("select pay_bill($1,gen_random_uuid(),'cash',$2::uuid[]) id",[session,ids])).id;};
 const ownerBill=await pay(owner,881),oldCashier=await pay(cashier,882),newCashier=await pay(cashier,882);
 await as(cashier);assert.equal((await row("select has_permission('receipts.read_all') ok")).ok,true);assert.equal((await row("select has_permission('reports.read') ok")).ok,false);
 for(const id of [ownerBill,oldCashier,newCashier]){assert.equal((await row('select id from bills where id=$1',[id])).id,id);assert.ok((await row('select count(*)::int n from bill_items where bill_id=$1',[id])).n>0);}
 const cashierCount=(await row('select count(*)::int n from bills')).n;await as(owner);assert.equal((await row('select count(*)::int n from bills')).n,cashierCount);
 await as(cashier);await assert.rejects(row('select revenue_report(current_date,current_date)'),/quyền/);
 for(const id of [waiter,kitchen]){await as(id);assert.equal((await row("select has_permission('receipts.read_all') ok")).ok,false);assert.equal((await row('select count(*)::int n from bills where id=$1',[ownerBill])).n,0);}
 for(const condition of ['is_active=false','must_change_password=true',"staff_sessions_revoked_before=clock_timestamp()+interval '1 day'"]){
  await db.exec('reset role;savepoint disabled_receipt');await db.query('update profiles set '+condition+' where id=$1',[cashier]);await as(cashier);assert.equal((await row("select has_permission('receipts.read_all') ok")).ok,false);assert.equal((await row('select count(*)::int n from bills')).n,0);await db.exec('reset role;rollback to disabled_receipt');
 }
 }finally{await db.exec('rollback;reset role');}
 console.log('PASS cashier full receipts: owner/cashier invoice+item parity, older own and other staff receipts, financial report denial, waiter/kitchen isolation, inactive/password/session denial. Local database only.');
}
