import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {checkCashierImageUpload} from './support/cashier-image-upload.mjs';
const db=new PGlite();
const migration=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const admin='00000000-0000-0000-0000-000000000001';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key references auth.users(id),name text,role text,is_active boolean default true,must_change_password boolean default false);
 create function public.staff_session_current() returns boolean language sql stable as $$select coalesce(current_setting('test.session_current',true),'true')<>'false'$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;alter table storage.buckets enable row level security;grant all on storage.buckets to authenticated,anon;create policy broad_buckets on storage.buckets for all to authenticated,anon using(true) with check(true);grant usage on schema storage to authenticated,anon;grant all on storage.objects to authenticated,anon;
 -- Existing broad policy must not bypass this feature's restrictive guards.
 create policy existing_broad on storage.objects for all to authenticated,anon using(true) with check(true);
 create table public.orders(id int primary key,amount int);insert into public.orders values(1,100);
 create table public.bills(id int primary key,amount int);insert into public.bills values(1,100);`);

 await db.exec('alter table profiles add column username text');
 await db.query('insert into auth.users(id) values($1)',[admin]);
 await db.query("insert into profiles(id,name,role,is_active,must_change_password) values($1,'Admin','admin',true,false)",[admin]);
 await db.exec(migration('034_kitchen_image_tickets.sql'));
 await db.exec(migration('035_temporary_kitchen_images.sql'));
 const permission=migration('20261116141839_admin_role_and_self_password.sql').match(/CREATE OR REPLACE FUNCTION public\.has_permission[\s\S]*?\$function\$;/)[0];
 await db.exec(permission);
 await checkCashierImageUpload(db,admin);
 await db.exec('reset role');const ticket=(await db.query('select * from kitchen_image_tickets limit 1')).rows[0];
 await db.query('update profiles set is_active=true where id=$1',[ticket.created_by]);
 await db.exec(migration('20261117075552_cashier_kitchen_completion.sql'));
 await db.query("insert into storage.objects(bucket_id,name) values('kitchen-ticket-images',$1),('kitchen-ticket-images',$2)",[ticket.image_path,ticket.preview_path]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ticket.created_by]);await db.exec('set role authenticated');
 const started=(await db.query('select begin_kitchen_image_completion($1) r',[ticket.id])).rows[0].r;assert.equal(started.paths.length,2);
 await assert.rejects(db.query('select complete_kitchen_image_ticket($1)',[ticket.id]),/Chưa xóa xong/);
 assert.equal((await db.query("delete from storage.objects where bucket_id='kitchen-ticket-images' returning id")).rows.length,2);
 await db.query('select complete_kitchen_image_ticket($1)',[ticket.id]);assert.equal((await db.query('select * from kitchen_image_tickets')).rows.length,0);
 console.log('PASS Cashier photo completion: begin, storage RLS deletion and final purge; rejects premature completion.');
}finally{await db.close();}
