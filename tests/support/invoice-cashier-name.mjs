import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkInvoiceCashierName(db,admin,food){
 await db.exec('reset role');const old=(await db.query('select b.id,b.total,b.invoice_no,p.name from bills b join profiles p on p.id=b.cashier_id limit 1')).rows[0];
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261116154458_invoice_cashier_name.sql',import.meta.url),'utf8'));
 if(old){const b=(await db.query('select cashier_name,total,invoice_no from bills where id=$1',[old.id])).rows[0];assert.equal(b.cashier_name,old.name.trim()||'Nhân viên');assert.equal(b.total,old.total);assert.equal(b.invoice_no,old.invoice_no);}
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(1991,'Bàn test 1991',true,'dine_in',1991)");
 await db.query("update profiles set name='Admin thanh toán' where id=$1",[admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
 const order=(await db.query('select submit_order(1991,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:1}])])).rows[0].id;
 const session=(await db.query('select session_id from orders where id=$1',[order])).rows[0].session_id;
 const ids=(await db.query('select id from order_items where order_id=$1',[order])).rows.map(r=>r.id);
 const bill=(await db.query("select pay_bill($1,gen_random_uuid(),'transfer',$2::uuid[]) id",[session,ids])).rows[0].id;
 assert.equal((await db.query('select cashier_name from bills where id=$1',[bill])).rows[0].cashier_name,'Admin thanh toán');
 await db.exec('reset role');await db.query("update profiles set name='Tên mới' where id=$1",[admin]);
 assert.equal((await db.query('select cashier_name from bills where id=$1',[bill])).rows[0].cashier_name,'Admin thanh toán');
 assert.equal((await db.query("select has_function_privilege('authenticated','pos_cashier.capture_bill_cashier_name()','execute') allowed")).rows[0].allowed,false);
 console.log('PASS payer snapshot: historical name backfill, unchanged money/numbers, actual pay RPC captures payer, account rename retains receipt name, private trigger ACL.');
}
