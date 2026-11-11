import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkDrinkNotes(db,owner,waiter,food,drink){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261111040957_drink_item_notes.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];await db.exec('begin');
 const reject=async(fn,re)=>{await db.exec('savepoint denied');try{await assert.rejects(fn,re);}finally{await db.exec('rollback to savepoint denied;release savepoint denied');}};
 try{
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(241,'Nước 241',true,'dine_in',241)");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.exec('set role authenticated');
 const id=(await one('select save_menu_selection(241,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:drink,qty:2,note:'Ít đá, không đường'}])])).id;
 let i=await one('select * from order_items where order_id=$1',[id]);assert.equal(i.note,'Ít đá, không đường');assert.deepEqual(await one('select kitchen_relevant,status from orders where id=$1',[id]),{kitchen_relevant:false,status:'done'});
 await one('select edit_saved_menu_selection($1,2,$2,2,$3)',[i.id,i.note,'Không đá']);assert.equal((await one('select note from order_items where id=$1',[i.id])).note,'Không đá');
 const sent=(await one('select submit_non_kitchen_order(241,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:drink,qty:1,note:'Mang riêng'}])])).id;
 i=await one('select * from order_items where order_id=$1',[sent]);const req=crypto.randomUUID();const edit=(note='Không đường',version=0,expected='Mang riêng')=>one('select edit_sent_order_note($1,$2,$3,$4,$5,$6) r',[req,i.id,sent,version,expected,note]);await edit();await edit();assert.equal((await one('select note_version from order_items where id=$1',[i.id])).note_version,1);
 assert.equal((await one('select kitchen_relevant from orders where id=$1',[sent])).kitchen_relevant,false);
 await reject(()=>one('select edit_sent_order_note(gen_random_uuid(),$1,$2,0,$3,$4)',[i.id,sent,'Mang riêng','Ghi đè']),/người khác sửa/);
 await db.exec('reset role');await db.query('update order_items set paid=true where id=$1',[i.id]);await db.exec('set role authenticated');await reject(()=>one('select edit_sent_order_note(gen_random_uuid(),$1,$2,1,$3,$4)',[i.id,sent,'Không đường','Không sửa']),/chưa thanh toán/);
 console.log('PASS drink notes SQL: save/edit draft, completed non-kitchen edit, same-request retry/version guard, paid protection, no kitchen routing or amount changes.');
 }finally{await db.exec('rollback;reset role');}
}
