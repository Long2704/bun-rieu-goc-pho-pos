import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function checkPrivateRealtime(db,waiter,food){
 await db.exec('reset role');
 // Stub only the platform transport; all POS RPCs, triggers, permissions and
 // RLS execute as PostgreSQL. No production Auth accounts or sales are touched.
 await db.exec(`create schema realtime;
 create table realtime.messages(id uuid default gen_random_uuid(),topic text,event text,payload jsonb,private boolean,extension text);
 alter table realtime.messages enable row level security;
 grant usage on schema realtime to authenticated,anon;
 grant select,insert on realtime.messages to authenticated,anon;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(payload jsonb,event text,topic text,private boolean default true) returns void language sql as $$insert into realtime.messages(topic,event,payload,private,extension) values(topic,event,payload,private,'broadcast')$$;`);
 await db.exec(readFileSync(new URL('../../releases/menu_groups_setup.sql',import.meta.url),'utf8'));
 await db.exec('create table if not exists public.kitchen_image_tickets(id uuid default gen_random_uuid());create table if not exists public.pos_runtime_settings(id boolean);');
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261111153908_private_realtime_sync.sql',import.meta.url),'utf8'));
 const rows=async(q,p=[])=>(await db.query(q,p)).rows,one=async(q,p=[])=>(await rows(q,p))[0];
 const messages=()=>rows('select topic,event,payload,private from realtime.messages order by topic');
 await db.exec('begin');
 try{
 await db.query("update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[waiter]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(321,'Realtime thử',true,'dine_in',321)");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.exec('set role authenticated');
 const request=crypto.randomUUID();const saved=(await one('select save_menu_selection(321,$1,$2::jsonb) id',[request,JSON.stringify([{menu_item_id:food,qty:1,note:'Ít bún'},{menu_item_id:food,qty:2,note:'Không hành'}])])).id;
 await one('select save_menu_selection(321,$1,$2::jsonb) id',[request,JSON.stringify([{menu_item_id:food,qty:1,note:'Ít bún'},{menu_item_id:food,qty:2,note:'Không hành'}])]);
 await db.exec('reset role');
 const first=await messages();assert.deepEqual(first.map(m=>m.topic),['pos:catalog','pos:orders']);assert.ok(first.every(m=>m.private&&m.event==='invalidate'&&JSON.stringify(m.payload)==='{"version":1}'));
 // Authenticated staff receive order/catalog invalidations; image topic is
 // denied to waiters. Anonymous/inactive/forced-password sessions are denied.
 for(const [who,topic,expected] of [[waiter,'pos:orders',1],[waiter,'pos:catalog',1],[waiter,'pos:images',0]]){
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.query("select set_config('realtime.topic',$1,false)",[topic]);await db.exec('set role authenticated');
 assert.equal((await one('select count(*)::int n from realtime.messages where topic=$1',[topic])).n,expected);
 await db.exec('savepoint denied');await assert.rejects(db.query("insert into realtime.messages(topic,extension) values('pos:orders','broadcast')"),/row-level security/);await db.exec('rollback to denied;reset role');
 }
 await db.exec('set role anon');assert.equal((await one('select count(*)::int n from realtime.messages')).n,0);await db.exec('reset role');
 assert.equal((await one("select has_function_privilege('authenticated','pos_sync.invalidate()','execute') ok")).ok,false);
 // A genuine image event is readable only by kitchen/owner, not the waiter.
 await db.exec('savepoint images');await db.exec('insert into kitchen_image_tickets default values');
 await db.query("select set_config('realtime.topic','pos:images',false)");await db.exec('set role authenticated');
 assert.equal((await one("select count(*)::int n from realtime.messages where topic='pos:images'")).n,0);await db.exec('reset role');
 const kitchen=(await one("select id from profiles where role='bep' and is_active and not must_change_password limit 1")).id;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[kitchen]);await db.exec('set role authenticated');assert.equal((await one("select count(*)::int n from realtime.messages where topic='pos:images'")).n,1);await db.exec('reset role;rollback to images');
 for(const condition of ['is_active=false','must_change_password=true']){
 await db.exec('savepoint disabled');await db.query('update profiles set '+condition+' where id=$1',[waiter]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[waiter]);await db.query("select set_config('realtime.topic','pos:orders',false)");await db.exec('set role authenticated');assert.equal((await one('select count(*)::int n from realtime.messages')).n,0);await db.exec('reset role;rollback to disabled');
 }
 // Rollback also removes notifications, so failed actions cannot be broadcast.
 await db.exec('savepoint rt');await db.exec("insert into kitchen_image_tickets default values");assert.equal((await messages()).length,3);await db.exec('rollback to rt');assert.equal((await messages()).length,2);
 }finally{await db.exec('rollback;reset role');}
 assert.equal((await messages()).length,0);
 // New transaction starts a new notification budget; no-op updates emit none.
 await db.exec('begin');await db.exec("update menu_items set price=price where id='"+food+"'");assert.equal((await messages()).length,0);await db.exec("update menu_items set price=price+1 where id='"+food+"'");assert.equal((await messages()).length,1);await db.exec('rollback');
 console.log('PASS private Realtime SQL: real save RPC/replay, coalesced multi-table transactions, generic payload only, anonymous/waiter topic restrictions, no client publishing/function access, rollback and no-op behavior.');
}
