import {checkItemTakeaway} from './support/item-takeaway.mjs';
import {checkScopedRealtime} from './support/scoped-realtime.mjs';
import {checkPrivateRealtime} from './support/private-realtime-sync.mjs';
import {checkDrinkNotes} from './support/drink-item-notes.mjs';
import {checkCombinedPendingKitchen} from './support/combine-pending-kitchen.mjs';
import {checkSavedMenuSelections} from './support/saved-menu-selections.mjs';
import {checkLinkedDiningTables} from './support/linked-dining-tables.mjs';
import {checkWaiterItemCancellation} from './support/waiter-item-cancellation.mjs';
import {checkSentNoteEditing} from './support/sent-note-editing.mjs';
import {checkKitchenImageIsolation} from './support/kitchen-image-sales-isolation.mjs';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const food = '10000000-0000-0000-0000-000000000001';
const drink = '10000000-0000-0000-0000-000000000002';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asUser = async n => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? uid(n) : '']);
  await db.exec('set role authenticated');
};
const submit = (request = crypto.randomUUID(), items = [{menu_item_id: food, qty: 2, expected_price: 58000, price: 1}]) =>
  one('select public.submit_order(1,$1,$2::jsonb) id', [request, JSON.stringify(items)]);
const permission = async key => (await one('select public.has_permission($1) allowed', [key])).allowed;

try {
  // Giả lập schema nền chưa được lưu trong repository và auth.uid(), không dùng Auth thật.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles(
      id uuid primary key references auth.users(id) on delete cascade,
      name text not null,
      role text not null default 'phuc_vu' check(role in ('chu','phuc_vu','bep','thu_ngan')),
      created_at timestamptz not null default now()
    );
    create function public.current_staff_role() returns text language sql stable
      security definer set search_path='' as
      $$ select role from public.profiles where id=auth.uid() $$;
    alter table public.profiles enable row level security;
    grant select on public.profiles to authenticated;
    create policy profiles_read on public.profiles for select to authenticated
      using(id=(select auth.uid()) or (select public.current_staff_role())='chu');
    create table public.menu_items(
      id uuid primary key default gen_random_uuid(), name text not null,
      price integer not null, category text not null,
      is_active boolean default true, is_out boolean default false, sort integer default 0
    );
    create table public.restaurant_tables(id integer primary key, name text not null, is_active boolean default true);
    grant select on public.menu_items, public.restaurant_tables to authenticated;
    insert into public.restaurant_tables values(1,'Bàn thử 1',true),(2,'Bàn thử 2',true);
    insert into public.menu_items(id,name,price,category) values
      ('${food}','Bún riêu thử',58000,'bun'),('${drink}','Trà thử',3000,'do_uong');
  `);
  for (let n = 1; n <= 5; n++) await db.query('insert into auth.users values($1)', [uid(n)]);
  for (const [n, role] of [[1,'chu'],[2,'phuc_vu'],[3,'bep'],[4,'thu_ngan']]) {
    await db.query('insert into public.profiles(id,name,role) values($1,$2,$3)', [uid(n), role, role]);
  }
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter(f => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0,3)) <= 20).sort();
  for (const file of files) {
    if (file.startsWith('019_')) {
      // Tái hiện quyền mặc định quá rộng đã phát hiện trên project thử nghiệm.
      await db.exec('grant all on all tables in schema public to anon, authenticated');
    }
    await db.exec(migration(file));
  }
  await db.query("update public.profiles set staff_code='TEST-W01' where id=$1", [uid(2)]);
  await assert.rejects(db.query("update public.profiles set staff_code=' test-w01 ' where id=$1",[uid(3)]), /duplicate key/);
  await assert.rejects(db.query('update public.profiles set is_active=false where id=$1',[uid(1)]), /Owner hoạt động cuối cùng/);
  await assert.rejects(db.query("update public.profiles set role='phuc_vu' where id=$1",[uid(1)]), /Owner hoạt động cuối cùng/);
  await assert.rejects(db.query('delete from public.profiles where id=$1',[uid(1)]), /Owner hoạt động cuối cùng/);


  // Giả lập các cột Auth được trigger dùng, không đọc password/hash thật.
  await db.exec(`alter table auth.users add column encrypted_password text,add column raw_user_meta_data jsonb not null default '{}';
    create role supabase_auth_admin;
    grant usage on schema auth to supabase_auth_admin;
    grant select,update(encrypted_password,raw_user_meta_data) on auth.users to supabase_auth_admin;
    update auth.users set encrypted_password='test-hash-before';`);
  for(const file of ['021_central_permissions.sql','022_payment_permissions.sql','023_kitchen_service_access.sql','024_management_reports_audit.sql','025_employee_directory.sql'])await db.exec(migration(file));
  await asUser(1);const order=await submit();
  const session=(await one('select session_id from public.orders where id=$1',[order.id])).session_id;
  const ids=(await db.query('select id from public.order_items where order_id=$1',[order.id])).rows.map(r=>r.id);
  const bill=await one("select public.pay_bill($1,gen_random_uuid(),'cash',$2::uuid[]) id",[session,ids]);
  await db.exec('reset role');
  const beforeProfile=(await db.query('select * from public.profiles order by id')).rows;
  const beforeBill=await one('select * from public.bills where id=$1',[bill.id]);
  await db.exec(migration('026_initial_password_gate.sql'));

  await db.exec("alter table auth.users add column email text unique, add column raw_app_meta_data jsonb not null default '{}'; create role service_role;");
  await db.exec(migration('027_employee_creation.sql'));

  await db.exec(migration('028_employee_management.sql'));
  await db.query("update auth.users set email='owner@example.test' where id=$1",[uid(1)]);

  await db.exec(migration('029_username_accounts.sql'));
  await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now());
   create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;`);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[uid(101),uid(2)]);
  const beforeAuth=(await db.query('select * from auth.users order by id')).rows;
  await db.exec(migration('030_employee_password_reset.sql'));
  assert.deepEqual((await db.query('select * from auth.users order by id')).rows,beforeAuth);


  await db.exec(migration('031_auth_profile_provisioning.sql'));
  await db.exec('alter table auth.users add column deleted_at timestamptz');
  await db.exec(migration('032_employee_deletion.sql'));

  await db.exec('reset role');
  const snapshot=async table=>(await db.query('select * from public.'+table+' order by id')).rows;
  const oldBills=await snapshot('bills'),oldItems=await snapshot('bill_items'),oldOrders=await snapshot('orders'),oldLines=await snapshot('order_items');
  await db.exec(migration('033_staff_table_cancellation.sql'));
  assert.deepEqual(await snapshot('bills'),oldBills);assert.deepEqual(await snapshot('bill_items'),oldItems);assert.deepEqual(await snapshot('orders'),oldOrders);assert.deepEqual(await snapshot('order_items'),oldLines);
  const cancel=(sessionId,requestId,ids)=>one('select public.cancel_table_session($1,$2,$3::uuid[])',[sessionId,requestId,ids]);
  for(const n of [1,2,3]){await asUser(n);assert.equal(await permission('tables.cancel'),true);const access=(await one('select public.get_my_access() result')).result;assert.ok(access.permissions.includes('tables.cancel'));if(n!==1){assert.equal(await permission('orders.cancel'),false);assert.equal(await permission('payments.discount'),false);assert.equal(await permission('reports.read'),false);await assert.rejects(one("select public.cancel_order_item($1,'')",[ids[0]]),/không có quyền/);}}
  for(const n of [4,5]){await asUser(n);assert.equal(await permission('tables.cancel'),false);await assert.rejects(cancel(session,crypto.randomUUID(),ids),/không có quyền hủy bàn/);}
  await db.exec('reset role');assert.equal((await one("select has_function_privilege('anon','public.cancel_table_session(uuid,uuid,uuid[])','execute') ok")).ok,false);

  await db.exec('reset role');await db.exec(readFileSync(new URL('../releases/kitchen_cancelled_items.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../releases/bill_table_transfer.sql',import.meta.url),'utf8'));
  await asUser(2);const placed=await submit(crypto.randomUUID(),[{menu_item_id:food,qty:1},{menu_item_id:food,qty:2},{menu_item_id:drink,qty:1}]);
  const sourceSession=(await one('select session_id from public.orders where id=$1',[placed.id])).session_id;
  const rows=(await db.query('select * from public.order_items where order_id=$1 order by kitchen_position',[placed.id])).rows;
  await db.exec('reset role');await db.query('update public.order_items set bill_no=2 where id=$1',[rows[1].id]);await asUser(2);
  const request=crypto.randomUUID();const transfer=(session=sourceSession,from=1,bill=2,to=2,ids=[rows[1].id],req=request,target=null)=>one('select public.transfer_bill_to_table($1,$2,$3,$4,$5,$6::uuid[],$7) result',[session,from,bill,to,req,ids,target]);
  const initialCreated=(await one("select count(*)::int n from public.audit_log where type='order_created'")).n;
  const result=(await transfer()).result;assert.equal(result.table_id,2);assert.equal(result.bill_no,1);assert.deepEqual((await transfer()).result,result);
  assert.equal((await one("select count(*)::int n from public.audit_log where type='order_created'")).n,initialCreated,'no fake new-food audit when splitting ticket');
  assert.equal((await one('select count(*)::int n from public.order_items')).n,rows.length+1,'existing paid setup item plus original items, no copies');
  const destination=(await one('select * from public.orders where session_id=$1',[result.session_id]));assert.equal(destination.status,'cooking');assert.equal(destination.bill_transfer_origin,placed.id);assert.equal(destination.created_at.getTime(),(await one('select created_at from public.orders where id=$1',[placed.id])).created_at.getTime());assert.deepEqual(destination.table_path,[1,2]);
  assert.equal((await one('select session_id from public.orders where id=$1',[placed.id])).session_id,sourceSession);assert.equal((await one('select count(*)::int n from public.order_items where order_id=$1',[placed.id])).n,2);
  assert.equal((await one('select kitchen_position from public.order_items where id=$1',[rows[1].id])).kitchen_position,rows[1].kitchen_position);
  await assert.rejects(transfer(sourceSession,1,2,2,[rows[0].id],crypto.randomUUID(),result.session_id),/đã thay đổi/);
  await assert.rejects(transfer(sourceSession,1,1,2,[rows[0].id],crypto.randomUUID(),null),/Bàn đích đã thay đổi/);
  const remaining=[rows[0].id,rows[2].id];const intoOccupied=(await transfer(sourceSession,1,1,2,remaining,crypto.randomUUID(),result.session_id)).result;assert.equal(intoOccupied.bill_no,2);assert.equal((await one('select closed_at from public.table_sessions where id=$1',[sourceSession])).closed_at!==null,true);
  const untouched=(await one('select count(*)::int n from public.order_items where id=any($1::uuid[])',[rows.map(i=>i.id)])).n;assert.equal(untouched,3);
  await asUser(3);const closedOrder=(await one('select id from public.orders where session_id=$1 and bill_transfer_origin=$2 limit 1',[result.session_id,placed.id])).id;await one('select public.complete_kitchen_order($1)',[closedOrder]);
  await asUser(1);const allTarget=(await db.query('select i.id from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=$1 and i.bill_no=1',[result.session_id])).rows.map(i=>i.id);
  await one("select public.pay_bill($1,gen_random_uuid(),'cash',$2::uuid[],1) id",[result.session_id,allTarget]);await assert.rejects(transfer(result.session_id,2,1,1,allTarget,crypto.randomUUID()),/đã thay đổi/);
  await asUser(2);const drinkSource=await submit(crypto.randomUUID(),[{menu_item_id:food,qty:1},{menu_item_id:drink,qty:1}]);const drinkSession=(await one('select session_id from public.orders where id=$1',[drinkSource.id])).session_id;const drinkOnly=(await one("select id from public.order_items where order_id=$1 and category='do_uong'",[drinkSource.id])).id;await db.exec('reset role');await db.query('update public.order_items set bill_no=2 where id=$1',[drinkOnly]);await asUser(2);const drinkResult=(await transfer(drinkSession,1,2,2,[drinkOnly],crypto.randomUUID(),result.session_id)).result;assert.deepEqual(await one('select status,kitchen_relevant from public.orders where session_id=$1 and id=(select order_id from public.order_items where id=$2)',[drinkResult.session_id,drinkOnly]),{status:'done',kitchen_relevant:false});assert.equal((await one('select status from public.orders where id=$1',[drinkSource.id])).status,'cooking');
  await asUser(3);await one('select public.complete_kitchen_order($1)',[drinkSource.id]);await asUser(2);const finishedIds=(await db.query('select id from public.order_items where order_id=$1 and not paid and cancelled_at is null',[drinkSource.id])).rows.map(i=>i.id);const completedResult=(await transfer(drinkSession,1,1,2,finishedIds,crypto.randomUUID(),result.session_id)).result;assert.equal((await one('select status from public.orders where session_id=$1 and id=(select order_id from public.order_items where id=$2)',[completedResult.session_id,finishedIds[0]])).status,'done');
  await db.exec('reset role');assert.equal((await one("select has_table_privilege('authenticated','public.bill_table_transfers','select') ok")).ok,false);assert.equal((await one("select has_function_privilege('anon','public.transfer_bill_to_table(uuid,integer,integer,integer,uuid,uuid[],uuid)','execute') ok")).ok,false);
  await asUser(3);await assert.rejects(transfer(),/Mã chuyển bill đã được sử dụng/);await db.exec('reset role');await db.query('update public.profiles set is_active=false where id=$1',[uid(2)]);await asUser(2);await assert.rejects(transfer(),/không có quyền/);await asUser(4);await assert.rejects(transfer(),/không có quyền/);
  await checkSentNoteEditing(db,uid(1),uid(2),uid(3),food,drink);
  await checkWaiterItemCancellation(db,uid(1),uid(2),uid(3),food,drink);
  await checkLinkedDiningTables(db,uid(1),uid(2),uid(3),food,drink);
  await checkSavedMenuSelections(db,uid(1),uid(2),uid(3),food,drink);
  await checkCombinedPendingKitchen(db,uid(2),food,drink);
  await checkDrinkNotes(db,uid(1),uid(2),food,drink);
  await checkPrivateRealtime(db,uid(2),food);
  await checkScopedRealtime(db,uid(2),food,drink);
  await checkItemTakeaway(db,uid(2),food,drink);
  console.log('PASS bill transfer SQL: staff permissions, exact whole-bill snapshot, empty/occupied target and target-session guard, partial kitchen-ticket split without copied items/new-food audit, same status/time/path/position, untouched source bills, close last source bill, request replay, paid protection, kitchen completion, private ledger.');
} finally {await db.close();}
