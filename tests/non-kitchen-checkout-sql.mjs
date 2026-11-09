import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
create table public.profiles(id uuid primary key references auth.users(id), name text not null, role text not null);
create table public.menu_items(id uuid primary key default gen_random_uuid(),name text not null,price integer not null,category text not null,is_active boolean default true,is_out boolean default false,sort integer default 0);
create table public.restaurant_tables(id integer primary key, name text not null,is_active boolean default true);
create function public.current_staff_role() returns text language sql stable security definer set search_path='' as $$ select role from public.profiles where id=auth.uid() $$;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.profiles values ('00000000-0000-0000-0000-000000000001','Owner','chu'),('00000000-0000-0000-0000-000000000002','Service','phuc_vu'),('00000000-0000-0000-0000-000000000003','Kitchen','bep');
insert into public.restaurant_tables(id,name) values (1,'Bàn 1'),(2,'Bàn 2');
insert into public.menu_items(id,name,price,category) values ('10000000-0000-0000-0000-000000000001','Bún riêu',58000,'bun'),('10000000-0000-0000-0000-000000000002','Trà đá',3000,'do_uong');
`);
for(const file of ['003_ordering.sql','004_payments.sql','005_cancellations_audit.sql','006_revenue_report.sql','007_table_transfer.sql','008_menu_management.sql','009_split_bills.sql','010_optional_transfer_reason.sql','011_cancellations_kitchen_history.sql','012_table_actions_merge.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await db.exec("insert into auth.users values('00000000-0000-0000-0000-000000000004');insert into public.profiles values('00000000-0000-0000-0000-000000000004','Cashier','thu_ngan');");

await db.exec("create function public.has_permission(p text) returns boolean language sql stable security definer set search_path='' as $$select coalesce(public.current_staff_role()='chu' or (public.current_staff_role() in ('phuc_vu','bep') and p='orders.read'),false)$$;");
await db.exec(readFileSync(new URL('../releases/menu_groups_setup.sql',import.meta.url),'utf8'));

await db.exec(readFileSync(new URL('../releases/non_kitchen_checkout.sql',import.meta.url),'utf8'));
const user=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[`00000000-0000-0000-0000-00000000000${n}`]);await db.exec('set role authenticated');};
await user(1);
const food='10000000-0000-0000-0000-000000000001',drink='10000000-0000-0000-0000-000000000002';
const submit=(req,items)=>db.query('select public.submit_non_kitchen_order(1,$1,$2::jsonb) id',[req,JSON.stringify(items)]);
const req='40000000-0000-0000-0000-000000000001',items=[{menu_item_id:drink,qty:2,expected_price:3000,note:'Không đá'}];
const id=(await submit(req,items)).rows[0].id;assert.equal((await submit(req,items)).rows[0].id,id);
assert.equal((await db.query('select status,kitchen_relevant from public.orders where id=$1',[id])).rows[0].status,'done');
assert.equal((await db.query('select status,kitchen_relevant from public.orders where id=$1',[id])).rows[0].kitchen_relevant,false);
assert.equal((await db.query('select note from public.order_items where order_id=$1',[id])).rows[0].note,'Không đá');
await assert.rejects(submit('40000000-0000-0000-0000-000000000002',[...items,{menu_item_id:food,qty:1,expected_price:58000}]),/Đơn có món cần gửi bếp/);
assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,1,'mixed rejection leaves no partial order');
await db.query('select public.save_menu_item(gen_random_uuid(),$1,1,$2,3000,$3,true,false,0)',[drink,'Trà phải nấu','bun']);
assert.equal((await submit(req,items)).rows[0].id,id,'replay survives routing changes');
await assert.rejects(submit('40000000-0000-0000-0000-000000000003',items),/Đơn có món cần gửi bếp/);
await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon;");await assert.rejects(submit(req,items),/permission denied/);
await db.exec('reset role;');
await db.exec(readFileSync('releases/menu_group_kitchen_settings.sql','utf8'));
await db.exec(readFileSync('releases/non_kitchen_checkout.sql','utf8'));
await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);set role authenticated;");
const catalog=(await db.query('select public.menu_group_catalog() c')).rows[0].c;assert.equal(catalog.kitchen_settings,true);assert.equal(catalog.non_kitchen_checkout,true);
console.log('PASS non-kitchen SQL: drink/other order saved done, mixed rejected atomically, note and request replay preserved, routing change guarded, anonymous denied.');
}finally{await db.close();}
