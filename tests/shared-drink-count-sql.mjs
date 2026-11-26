import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Set POS_PGLITE_MODULE to an installed @electric-sql/pglite ESM entry.
const {PGlite}=await import(process.env.POS_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
try{
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; create schema pos_sync;
 grant usage on schema auth,pos_sync to authenticated;
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function public.has_permission(text) returns boolean language sql stable as
 $$ select coalesce(current_setting('test.allowed',true),'no')='yes' $$;
 create function public.current_staff_role() returns text language sql stable as
 $$ select current_setting('test.role',true) $$;
 create function public.get_my_access() returns jsonb language sql stable as
 $$ select jsonb_build_object('is_active',true) $$;
 create function public.get_active_table_links() returns jsonb language sql stable as $$select '[]'::jsonb $$;
 create table public.table_sessions(id uuid primary key, table_id int, table_path int[], opened_at timestamptz, closed_at timestamptz);
 create table public.orders(id uuid primary key, session_id uuid not null references public.table_sessions, status text, kitchen_relevant bool, created_at timestamptz, ordered_by_name text, service_label text);
 create table public.order_items(id int primary key,order_id uuid not null references public.orders, category text, qty int, drink_done_qty int, drink_queued_at timestamptz, drink_done_at timestamptz, cancelled_at timestamptz, name text, note text, kitchen_position int, is_takeaway bool, paid bool);
 create table public.menu_items(id text,name text,price int,category text,is_active bool,is_out bool,sort int);
 create table public.restaurant_tables(id int,name text,service_type text,is_active bool,display_order int);
 grant select on all tables in schema public to authenticated;
 alter table public.table_sessions enable row level security;
 create policy open_only on public.table_sessions to authenticated using (closed_at is null);
 insert into public.table_sessions(id,table_id,closed_at) values
  ('00000000-0000-0000-0000-000000000001',1,null),('00000000-0000-0000-0000-000000000002',2,now());
 insert into public.orders(id,session_id,status,kitchen_relevant,created_at) values
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','cooking',true,now()),
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','cooking',true,now()),
  ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000002','done',false,now());
 insert into public.order_items(id,order_id,category,qty,drink_done_qty,drink_queued_at,cancelled_at,paid) values
  (1,'00000000-0000-0000-0000-000000000011','do_uong',2,1,now(),null,false),
  (2,'00000000-0000-0000-0000-000000000011','do_uong',1,0,now(),null,false),
  (3,'00000000-0000-0000-0000-000000000012','do_uong',1,1,now(),null,false),
  (4,'00000000-0000-0000-0000-000000000012','do_uong',1,0,now(),now(),false),
  (5,'00000000-0000-0000-0000-000000000012','do_uong',1,0,null,null,false),
  (6,'00000000-0000-0000-0000-000000000012','bun',1,0,now(),null,false),
  (7,'00000000-0000-0000-0000-000000000022','do_uong',2,0,now(),null,true);
 `);
 const original=migration('20261119140222_drinks_notifications.sql');
 const list=original.slice(original.indexOf('create function public.list_drink_tickets'),original.indexOf('-- Clients acknowledge')).replace('security invoker','security definer').replace("'phuc_vu','chu'","'phuc_vu','thu_ngan','bep','chu'").replace('join public.table_sessions s on s.id=o.session_id','join public.table_sessions s on s.id=o.session_id and (not p_history or s.closed_at is null)');
 await db.exec(list);
 await db.exec(migration('20261112092721_expose_table_session_opened_time.sql'));
 await db.exec(migration('20261115153130_bundled_pos_live_snapshot.sql'));
 await db.exec(migration('20261126110000_share_pending_drink_counts.sql'));
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 const sql=async(query,params)=>(await db.query(query,params)).rows[0].value;
 await db.exec("set role authenticated; set test.uid='00000000-0000-0000-0000-000000000099'; set test.allowed='yes'; set test.role='thu_ngan'");
 const full=()=>sql("select public.get_pos_live_snapshot()->'snapshot' as value");
 const delta=ids=>sql('select public.get_pos_sync_delta($1::uuid[]) as value',[ids]);
 const initial=await full(),legacy=await sql('select public.list_drink_tickets(false) as value');
 assert.deepEqual(initial.drink_counts,{[a]:1,[b]:1});
 assert.equal(Object.values(initial.drink_counts).reduce((x,y)=>x+y,0),legacy.length);
 assert.equal(initial.sessions.length,1);assert.equal(initial.kitchen.length,2);
 let partial=await delta([b]);assert.deepEqual(partial.drink_counts,{[b]:1});
 assert.deepEqual(partial.sessions,[]);assert.deepEqual(partial.kitchen,[]);
 assert.equal(await sql("select public.get_pos_live_snapshot(false,true)->'snapshot' as value"),null);
 for(const role of ['phuc_vu','bep','chu']){
  await db.exec("set test.role='"+role+"'");assert.deepEqual((await full()).drink_counts,{[a]:1,[b]:1});
 }
 await db.exec("set test.role='other'");
 assert.equal((await full()).drink_counts,null);
 assert.equal((await delta([b])).drink_counts,null);
 await db.exec("set test.allowed='no'");
 assert.equal(await sql('select pos_sync.pending_drink_counts(null) as value'),null);
 await assert.rejects(delta([b]));
 await db.exec("reset role; update public.order_items set drink_done_qty=qty where id=7; set role authenticated; set test.allowed='yes'; set test.role='thu_ngan'");
 assert.deepEqual((await delta([b])).drink_counts,{});
 assert.deepEqual((await full()).drink_counts,{[a]:1});
 assert.equal(await sql("select has_function_privilege('anon','pos_sync.pending_drink_counts(uuid[])','EXECUTE') as value"),false);
 console.log('PASS PostgreSQL shared drink counts: same distinct pending tickets as legacy, paid closed sessions, partial quantity, exclusions, scoped removal, permissions, and kitchen preserved.');
}finally{await db.close();}
