-- TEST BRANCH ONLY. Apply to local/test database after existing migrations and menu group releases.
-- Does not change any employee role, prices or sales. No production schedule is enabled.
begin;
set local lock_timeout='5s';
create schema pos_cashier;
revoke all on schema pos_cashier from public,anon,authenticated;
grant usage on schema pos_cashier to authenticated;
CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with role_permissions(role, permissions) as (
    values
      ('thu_ngan', array['orders.read','orders.create','orders.cancel','payments.collect','payments.discount','tables.transfer','tables.cancel','bills.split','menu.manage','tables.manage','reports.operations','receipts.read_own']::text[]),
      ('chu', array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount',
        'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload', 'tables.transfer', 'tables.cancel', 'bills.split',
        'menu.manage', 'tables.manage', 'reports.read', 'reports.operations', 'audit.read',
        'employees.manage', 'settings.manage',
        'receipts.read_own', 'receipts.read_all'
      ]::text[]),
      ('phuc_vu', array[
        'orders.read', 'orders.create', 'orders.cancel', 'payments.collect',
        'tables.transfer', 'tables.cancel', 'bills.split', 'receipts.read_own'
      ]::text[]),
      ('bep', array[
        'orders.read', 'orders.create', 'payments.collect',
        'tables.transfer', 'tables.cancel', 'bills.split', 'receipts.read_own',
        'kitchen.complete', 'kitchen_images.read'
      ]::text[])
  )
  select exists (
    select 1
    from public.profiles p
    join role_permissions r on r.role = p.role
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.must_change_password = false
      and (select public.staff_session_current())
      and p_permission = any(r.permissions)
  );
$function$;
CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('saved_menu_selections',true,'linked_tables',true,
    'data_epoch',(select data_epoch from public.pos_runtime_settings where id),'name', p.name, 'role', p.role, 'is_active', p.is_active and (select public.staff_session_current()),
    'session_invalid',not (select public.staff_session_current()),
    'must_change_password', p.must_change_password,
    'permissions', (
      select coalesce(jsonb_agg(permission), '[]'::jsonb)
      from unnest(array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount', 'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload',
        'tables.transfer', 'tables.cancel', 'bills.split', 'menu.manage', 'tables.manage',
        'reports.read', 'reports.operations', 'audit.read', 'employees.manage', 'settings.manage',
        'receipts.read_own', 'receipts.read_all'
      ]::text[]) as permission
      where public.has_permission(permission)
    )
  )
  from public.profiles p where p.id = (select auth.uid());
$function$;
-- Existing role constraint is extended only for the employee-request ledger.
alter table public.employee_creation_requests drop constraint employee_creation_requests_role_check;
alter table public.employee_creation_requests add constraint employee_creation_requests_role_check check(role in ('phuc_vu','bep','thu_ngan'));
-- Keep all Owner identity, session, lock, replay and last-Owner protections.
-- Patch ONLY the staff lifecycle functions, never reporting/authorization functions.
do $upgrade_staff$
declare r record;v text;
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
 'prepare_employee_creation','prepare_employee_account','update_employee','update_employee_account',
 'list_employees','guard_pending_password_reset','begin_employee_password_reset',
 'finish_initial_password_setup','finish_employee_password_reset','begin_employee_deletion','finish_employee_deletion'
 ]) loop
  v:=pg_get_functiondef(r.oid);
  v:=regexp_replace(v, $re$'phuc_vu'\s*,\s*'bep'$re$, $replace$'phuc_vu','bep','thu_ngan'$replace$, 'g');
  execute v;
 end loop;
end $upgrade_staff$;
-- Legacy menu/table RPCs checked Owner directly. Delegate to their existing permissions.
do $upgrade_management$
declare r record;v text;v_permission text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['list_menu_management','save_menu_item','list_table_management','save_restaurant_table','reorder_restaurant_tables']) loop
  v_permission:=case when r.proname in ('list_menu_management','save_menu_item') then 'menu.manage' else 'tables.manage' end;
  v:=pg_get_functiondef(r.oid);
  v:=replace(v, $old$coalesce(public.current_staff_role(),'')<>'chu'$old$, format('not public.has_permission(%L)',v_permission));
  execute v;
 end loop;
end $upgrade_management$;
create policy cashier_menu_read on public.menu_items for select to authenticated using((select public.current_staff_role())='thu_ngan' and (select public.has_permission('menu.manage')));
create policy cashier_tables_read on public.restaurant_tables for select to authenticated using((select public.current_staff_role())='thu_ngan' and (select public.has_permission('tables.manage')));

-- One recent receipt is sufficient for confirming/reprinting the last payment.
-- This helper reveals only the caller's latest bill UUID, never money or other staff's IDs.
create function pos_cashier.latest_receipt() returns uuid language sql stable security definer set search_path='' as $$
 select b.id from public.bills b where public.current_staff_role()='thu_ngan'
 and public.has_permission('receipts.read_own') and b.cashier_id=auth.uid()
 order by b.paid_at desc,b.id desc limit 1;
$$;
revoke all on function pos_cashier.latest_receipt() from public,anon;
grant execute on function pos_cashier.latest_receipt() to authenticated;
create policy cashier_receipt_scope on public.bills as restrictive for select to authenticated
 using((select public.current_staff_role()) is distinct from 'thu_ngan' or (cashier_id=(select auth.uid()) and id=(select pos_cashier.latest_receipt())));

-- Block raw historical sales reads through orders/items as well as bills.
-- Open tables and outstanding kitchen tickets remain visible for operations.
create function pos_cashier.live_session(p_session_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('orders.read') and public.current_staff_role()='thu_ngan' and (
 exists(select 1 from public.table_sessions s where s.id=p_session_id and s.closed_at is null)
 or exists(select 1 from public.orders o where o.session_id=p_session_id and o.status='cooking' and o.kitchen_relevant));
$$;
revoke all on function pos_cashier.live_session(uuid) from public,anon;
grant execute on function pos_cashier.live_session(uuid) to authenticated;
create policy cashier_session_scope on public.table_sessions as restrictive for select to authenticated
 using((select public.current_staff_role()) is distinct from 'thu_ngan' or pos_cashier.live_session(id));
create policy cashier_order_scope on public.orders as restrictive for select to authenticated
 using((select public.current_staff_role()) is distinct from 'thu_ngan' or pos_cashier.live_session(session_id));
create policy cashier_item_scope on public.order_items as restrictive for select to authenticated
 using((select public.current_staff_role()) is distinct from 'thu_ngan' or exists(select 1 from public.orders o where o.id=order_id));

-- Dedicated quantity-only API; never loads financial rows into the browser.
create function pos_cashier.operations_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_start timestamptz;v_end timestamptz;v_result jsonb;
begin
 if auth.uid() is null or not public.has_permission('reports.operations') then raise exception 'Bạn không có quyền xem báo cáo vận hành.';end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>30 then raise exception 'Chọn khoảng ngày hợp lệ, tối đa 31 ngày.';end if;
 v_start:=p_from::timestamp at time zone 'Asia/Ho_Chi_Minh';v_end:=(p_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
 with bands(idx,label,h1,h2) as (values (1,'06:00–09:00',6,9),(2,'09:00–11:00',9,11),(3,'11:00–13:00',11,13),(4,'13:00–15:00',13,15),(5,'15:00–17:00',15,17),(6,'17:00–19:00',17,19),(7,'19:00–22:00',19,22),(8,'Ngoài khung giờ',0,0)),
 sales as materialized (
 select bi.qty,bi.category,lower(bi.name) in ('chả ốc (tặng)','chả ốc tặng') as gift,
 coalesce(bi.is_takeaway,false) or lower(coalesce(b.service_label,'')) ~ '^mang[[:space:]]+về' as takeaway,
 extract(hour from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int as h
 from public.bills b join public.bill_items bi on bi.bill_id=b.id where b.paid_at>=v_start and b.paid_at<v_end
 ), slots as (
 select x.idx,x.label,coalesce(sum(s.qty) filter(where s.category='bun'),0) as main_qty,
 coalesce(sum(s.qty) filter(where s.category='bun' and s.takeaway),0) as takeaway_qty,
 coalesce(sum(s.qty) filter(where s.gift),0) as gift_qty
 from bands x left join sales s on (x.idx<>8 and s.h>=x.h1 and s.h<x.h2) or (x.idx=8 and (s.h<6 or s.h>=22)) group by x.idx,x.label
 )
 select jsonb_build_object('from',p_from,'to',p_to,
 'main_qty',(select coalesce(sum(main_qty),0) from slots),
 'takeaway_qty',(select coalesce(sum(takeaway_qty),0) from slots),
 'gift_qty',(select coalesce(sum(gift_qty),0) from slots),
 'cancelled_qty',(select coalesce(sum(i.qty),0) from public.order_items i where i.cancelled_at>=v_start and i.cancelled_at<v_end),
 'slots',(select jsonb_agg(jsonb_build_object('slot',label,'main_qty',main_qty,'takeaway_qty',takeaway_qty,'gift_qty',gift_qty) order by idx) from slots)
 ) into v_result;
 return v_result;
end;$$;
revoke all on function pos_cashier.operations_report(date,date) from public,anon;
grant execute on function pos_cashier.operations_report(date,date) to authenticated;
-- Public API is invoker-only; privileged implementation stays in an unexposed schema.
create function public.cashier_operations_report(p_from date,p_to date) returns jsonb
language sql stable security invoker set search_path='' as $api$
 select pos_cashier.operations_report(p_from,p_to);
$api$;
revoke all on function public.cashier_operations_report(date,date) from public,anon;
grant execute on function public.cashier_operations_report(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
