import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkTableOpenedTime(db,waiter,food){
 const rows=async(q,p=[])=>(await db.query(q,p)).rows,one=async(q,p=[])=>(await rows(q,p))[0];
 const as=async(id=waiter)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.exec('reset role');
 const before=await rows('select id,opened_at,closed_at from table_sessions order by id');
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261112092721_expose_table_session_opened_time.sql',import.meta.url),'utf8'));
 assert.deepEqual(await rows('select id,opened_at,closed_at from table_sessions order by id'),before,'installing metadata must not alter sessions');
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1',[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(98101,'Bàn giờ',true,'dine_in',98101),(98102,'Bàn ghép giờ',true,'dine_in',98102)");
 await as();
 const save=async()=>one('select save_menu_selection(98101,gen_random_uuid(),$1::jsonb) id',[JSON.stringify([{menu_item_id:food,qty:1,note:''}])]);
 const order=(await save()).id,sid=(await one('select session_id from orders where id=$1',[order])).session_id;
 const expected=(await one('select opened_at from table_sessions where id=$1',[sid])).opened_at.toISOString();
 const snap=async()=>(await one('select get_linked_table_snapshot() value')).value;
 const delta=async()=>(await one('select get_pos_sync_delta($1::uuid[]) value',[[sid]])).value;
 assert.equal(new Date((await snap()).sessions.find(s=>s.id===sid).opened_at).toISOString(),expected);
 assert.equal(new Date((await delta()).sessions[0].opened_at).toISOString(),expected);
 await save();assert.equal(new Date((await delta()).sessions[0].opened_at).toISOString(),expected,'adding another batch retains opening time');
 await one("select link_dining_tables(gen_random_uuid(),98101,98102,$1,null,'same_bill')",[sid]);
 const grouped=await delta();assert.equal(grouped.links.length,2);assert.equal(new Date(grouped.sessions[0].opened_at).toISOString(),expected);
 await as(null);await assert.rejects(delta(),/không có quyền/);
 await db.exec('reset role;set role anon');await assert.rejects(snap(),/permission denied/);await assert.rejects(delta(),/permission denied/);await db.exec('reset role');
 assert.equal((await one("select has_function_privilege('anon','get_linked_table_snapshot()','execute') value")).value,false);
 console.log('PASS table opening time SQL: migration changes no sessions, full/scoped snapshots return exact session opening time, additional orders and linked empty table retain it, existing scope/auth/anon restrictions preserved. Local database only.');
}
