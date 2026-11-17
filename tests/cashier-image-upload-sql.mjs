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
}finally{await db.close();}
