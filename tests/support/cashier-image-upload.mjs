import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkCashierImageUpload(db,admin){
 await db.exec('reset role');
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const users={};for(const role of ['thu_ngan','phuc_vu','bep']){const id=crypto.randomUUID();users[role]=id;await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,name,role,is_active,must_change_password,username) values($1,$2,$2,true,false,$3)',[id,role,'image_'+id.slice(0,12)]);}
 const access=new Map();for(const id of [admin,...Object.values(users)]){await as(id);access.set(id,(await db.query('select get_my_access() a')).rows[0].a.permissions.sort());}
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261117045941_cashier_kitchen_image_upload.sql',import.meta.url),'utf8'));
 for(const id of [admin,...Object.values(users)]){await as(id);const actual=(await db.query('select get_my_access() a')).rows[0].a.permissions.sort();assert.deepEqual(actual,id===users.thu_ngan?[...access.get(id),'kitchen_images.read','kitchen_images.upload'].sort():access.get(id));}
 await as(users.thu_ngan);
 const epoch=(await db.query('select get_kitchen_image_epoch() e')).rows[0].e;
 const request=epoch.slice(0,8)+'-'+epoch.slice(8)+'-'+crypto.randomUUID().slice(14);
 const job=(await db.query('select reserve_kitchen_image_upload($1,$2) j',[request,'a'.repeat(64)])).rows[0].j;assert.ok(job.upload_id);
 await db.exec('reset role;set role service_role');await db.query('select verify_kitchen_image_upload($1,1000,100,100)',[job.upload_id]);
 await as(users.thu_ngan);const ticket=(await db.query('select finalize_kitchen_image_upload($1) t',[job.upload_id])).rows[0].t;
 assert.equal(ticket.created_by,users.thu_ngan);assert.ok((await db.query('select id from kitchen_image_tickets where id=$1',[ticket.id])).rows.length);
 await assert.rejects(db.query('select begin_kitchen_image_completion($1)',[ticket.id]),/không có quyền/);
 await assert.rejects(db.query('select complete_kitchen_image_ticket($1)',[ticket.id]),/không có quyền/);
 await as(users.bep);await assert.rejects(db.query('select reserve_kitchen_image_upload($1,$2)',[crypto.randomUUID(),'b'.repeat(64)]),/không có quyền/);
 await as(users.phuc_vu);await assert.rejects(db.query('select get_kitchen_image_epoch()'),/không có quyền/);
 await db.exec('reset role');await db.query('update profiles set is_active=false where id=$1',[users.thu_ngan]);await as(users.thu_ngan);assert.equal((await db.query("select has_permission('kitchen_images.upload') ok")).rows[0].ok,false);await db.exec('reset role');
 console.log('PASS cashier images: exact permission delta read/upload only; actual reserve/verify/finalize captures cashier; private image read allowed; completion/purge denied; other roles and disabled staff protected.');
}
