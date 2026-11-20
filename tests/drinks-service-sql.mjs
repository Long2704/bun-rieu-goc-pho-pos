import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const waiter=uuid(1),admin=uuid(2),cashier=uuid(3),kitchen=uuid(4);
const order=uuid(11),closedOrder=uuid(12),drink=uuid(21),meal=uuid(22),legacy=uuid(23),paid=uuid(24),cancelled=uuid(25);
const one=async (sql,params=[])=>(await db.query(sql,params)).rows[0];
async function signIn(user){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.exec('set role authenticated');
}
const list=async history=>(await one('select list_drink_tickets($1) as tickets',[history])).tickets;
const complete=(orderId,items)=>db.query('select complete_drink_ticket($1,$2)',[orderId,JSON.stringify(items)]);

try{
 await db.exec(`
 create role anon;
 create role authenticated;
 create schema auth;
 grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,is_active boolean default true,must_change_password boolean default false);
 insert into profiles(id,role) values ('${waiter}','phuc_vu'),('${admin}','admin'),('${cashier}','thu_ngan'),('${kitchen}','bep');
 create function public.staff_session_current() returns boolean language sql stable as $$select true$$;
 create table restaurant_tables(id int primary key,name text);
 create table table_sessions(id uuid primary key,table_id int,closed_at timestamptz);
 create table orders(id uuid primary key,session_id uuid,status text,kitchen_relevant boolean,service_label text,ordered_by_name text);
 create table order_items(id uuid primary key,order_id uuid,category text,name text,qty int,note text,
   is_takeaway boolean,paid boolean,cancelled_at timestamptz,kitchen_position int);
 insert into restaurant_tables values(5,'Bàn 5'),(6,'Bàn 6');
 insert into table_sessions values('${uuid(31)}',5,null),('${uuid(32)}',6,now());
 insert into orders values('${order}','${uuid(31)}','cooking',true,'','Lan'),('${closedOrder}','${uuid(32)}','done',false,'','Lan');
 insert into order_items values('${legacy}','${order}','do_uong','Nước cũ',1,'',false,false,null,1);
 `);
 const permissions=migration('20261116141839_admin_role_and_self_password.sql');
 for(const name of ['has_permission','current_staff_role']){
  await db.exec(permissions.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'[\\s\\S]*?\\$function\\$;'))[0]);
 }
 await db.exec(`
 grant select on order_items,orders,table_sessions,restaurant_tables to authenticated;
 alter table order_items enable row level security;
 create policy items_staff_read on order_items for select to authenticated using ((select public.has_permission('orders.read')));
 `);
 await db.exec(migration('20261119140222_drinks_notifications.sql'));
 await db.exec(migration('20261119140804_drinks_staff_roles.sql'));
 await db.exec(`
 alter table table_sessions enable row level security;
 create policy sessions_staff_read on table_sessions for select to authenticated using ((select public.has_permission('orders.read')));
 create policy cashier_session_scope on table_sessions as restrictive for select to authenticated
  using ((select public.current_staff_role()) is distinct from 'thu_ngan' or closed_at is null);
 `);
 await db.exec(`
 insert into order_items(id,order_id,category,name,qty,note,is_takeaway,paid,cancelled_at,kitchen_position) values
 ('${drink}','${order}','do_uong','Trà đá',2,'Ít đá',true,false,null,2),
 ('${meal}','${order}','bun','Bún riêu',1,'',false,false,null,3),
 ('${paid}','${closedOrder}','do_uong','Nước suối',1,'',false,true,null,1),
 ('${cancelled}','${order}','do_uong','Nước hủy',1,'',false,false,now(),4);
 -- Simulate queued items for the completion/read tests. The notification
 -- integration is exercised through the real POS order RPCs.
 update order_items set drink_queued_at=now() where id in ('${drink}','${paid}','${cancelled}');
 `);
 await signIn(waiter);
 const active=await list(false);
 assert.deepEqual(active.flatMap(ticket=>ticket.items.map(item=>item.id)).sort(),[drink,paid]);
 assert.equal(active.find(ticket=>ticket.id===order).place,'Bàn 5');
 assert.equal(active.find(ticket=>ticket.id===order).items[0].note,'Ít đá');
 assert.equal(active.find(ticket=>ticket.id===order).items[0].is_takeaway,true);
 assert.deepEqual(await list(true),[]);
 await complete(order,[{id:drink,qty:2},{id:meal,qty:1},{id:paid,qty:1},{id:cancelled,qty:1}]);
 assert.equal((await list(false))[0].id,closedOrder);
 const finished=(await list(true))[0];
 assert.equal(finished.items[0].qty,2);
 await complete(order,[{id:drink,qty:2}]);
 assert.equal((await list(true))[0].done_at,finished.done_at);
 assert.equal((await one('select status from orders where id=$1',[order])).status,'cooking');
 await assert.rejects(db.query('update order_items set drink_done_qty=9 where id=$1',[drink]),/permission denied/);

 await db.exec('reset role');
 await db.query('update order_items set qty=3 where id=$1',[drink]);
 await signIn(waiter);
 await complete(order,[{id:drink,qty:2}]);
 const added=(await list(false)).find(ticket=>ticket.id===order);
 assert.equal(added.items[0].qty,1);
 await complete(order,[{id:drink,qty:3}]);
 await signIn(cashier);
 assert.equal((await one('select count(*)::integer as n from table_sessions where closed_at is not null')).n,0);
 assert.equal((await list(false))[0].id,closedOrder);
 await complete(closedOrder,[{id:paid,qty:1}]);
 assert.deepEqual(await list(false),[]);
 assert.equal((await list(true)).find(ticket=>ticket.id===order).items[0].qty,3);

 for(const user of [cashier,kitchen,admin,waiter]){
  await signIn(user);
  const history=await list(true);
  assert.equal(history.length,2);
  assert.ok(history.some(ticket=>ticket.id===closedOrder));
  assert.ok(history.every(ticket=>ticket.items.every(item=>!('price' in item))));
  await complete(order,[{id:drink,qty:3}]);
 }
 await db.exec('reset role');
 await db.query('update profiles set is_active=false where id=$1',[kitchen]);
 for(const user of [kitchen,'']){
  await signIn(user);
  await assert.rejects(list(false),/không có quyền/);
  await assert.rejects(complete(order,[{id:drink,qty:3}]),/không có quyền/);
 }
 await db.exec(`
 reset role;
 alter table orders add column is_draft boolean not null default false,
  add column request_id uuid, add column created_by uuid, add column submitted_table_id int;
 alter table order_items add column menu_item_id uuid;
 create table menu_groups(id text primary key,name text not null);
 create table menu_item_groups(item_id uuid primary key,group_id text references menu_groups);
 insert into menu_groups values ('m1',' KhÁc '),('m2','Đồ uống');
 insert into menu_item_groups values ('${uuid(81)}','m1'),('${uuid(82)}','m2');
 create function public.submit_order(integer,uuid,jsonb) returns uuid language plpgsql as $$
 declare new_order uuid;
 begin
  select id into new_order from public.orders where request_id=$2;
  if found then return new_order;end if;
  insert into public.orders(id,session_id,request_id,created_by,submitted_table_id)
   values(gen_random_uuid(),'${uuid(31)}',$2,auth.uid(),$1) returning id into new_order;
  insert into public.order_items(id,order_id,menu_item_id,category,name,qty,paid)
   select gen_random_uuid(),new_order,i.item_id,'do_uong',i.name,1,false
   from jsonb_to_recordset($3) as i(item_id uuid,name text);
  return new_order;
 end;$$;
 create function public.send_saved_menu_selections(integer,uuid,uuid[],uuid,jsonb) returns uuid language sql as $$
  update public.orders set is_draft=false where id=any($3) returning id
 $$;
 `);
 await db.exec(migration('20261120002342_exclude_other_group_from_drinks.sql'));
 await signIn(waiter);
 const ordered=JSON.stringify([{item_id:uuid(81),name:'Khăn lạnh'},{item_id:uuid(82),name:'Trà đá'}]);
 const notified=(await one('select notify_service_order(5,$1,$2) as id',[uuid(91),ordered])).id;
 assert.deepEqual((await list(false)).find(t=>t.id===notified).items.map(i=>i.name),['Trà đá']);
 assert.equal((await one('select count(*)::integer as n from order_items where order_id=$1',[notified])).n,2);
 await one('select notify_service_order(5,$1,$2)',[uuid(91),ordered]);
 assert.equal((await one('select count(*)::integer as n from order_items where order_id=$1',[notified])).n,2);
 await db.exec('reset role');
 const draft=(await one('select submit_order(5,$1,$2) as id',[uuid(92),ordered])).id;
 await db.query('update orders set is_draft=true where id=$1',[draft]);
 await signIn(waiter);
 await one('select notify_service_order(5,$1,$2,$3,$4)',[uuid(93),'[]',uuid(31),[draft]]);
 assert.deepEqual((await list(false)).find(t=>t.id===draft).items.map(i=>i.name),['Trà đá']);
 assert.equal((await one('select count(*)::integer as n from order_items where order_id=$1',[draft])).n,2);
 await db.exec('reset role;set role anon');
 await assert.rejects(list(false),/permission denied/);
 console.log('PASS drink queue SQL: mixed orders, paid drinks, exclusions, exact completion, replay, added quantities, history, permissions, and exclusion of Khác for notifications');
}finally{await db.close();}
