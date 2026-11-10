-- Allow active serving staff to cancel unpaid dishes, including served dishes.
-- Preserve the current role matrix, locks, cancellation history, kitchen queue and payment guards.
begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with role_permissions(role, permissions) as (
    values
      ('chu', array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount',
        'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload', 'tables.transfer', 'tables.cancel', 'bills.split',
        'menu.manage', 'tables.manage', 'reports.read', 'audit.read',
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

CREATE OR REPLACE FUNCTION public.cancel_order_item(p_item_id uuid, p_reason text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid(); v_session uuid; v_table integer;
 v_item public.order_items%rowtype;
begin
 if v_user is null or not public.has_permission('orders.cancel') then
  raise exception 'Bạn không có quyền hủy món.';
 end if;
 if length(btrim(coalesce(p_reason,'')))>500 then
  raise exception 'Ghi chú hủy tối đa 500 ký tự.';
 end if;
 select o.session_id,s.table_id into v_session,v_table from public.order_items i
 join public.orders o on o.id=i.order_id join public.table_sessions s on s.id=o.session_id where i.id=p_item_id;
 if not found then raise exception 'Không tìm thấy món.'; end if;
 -- Cùng thứ tự khóa với gửi đơn và thanh toán.
 perform 1 from public.restaurant_tables where id=v_table for update;
 perform 1 from public.table_sessions where id=v_session for update;
 if not exists(select 1 from public.table_sessions where id=v_session and table_id=v_table) then
  raise exception 'Bàn vừa được chuyển. Đồng bộ và thử lại.';
 end if;
 -- Khóa đơn trước dòng món, cùng thứ tự với hoàn thành bếp.
 perform 1 from public.orders o join public.order_items i on i.order_id=o.id where i.id=p_item_id for update of o;
 select * into v_item from public.order_items where id=p_item_id for update;
 if v_item.cancelled_at is not null then return; end if;
 if v_item.paid then raise exception 'Không thể hủy món đã thanh toán.'; end if;
 if exists(select 1 from public.table_sessions where id=v_session and closed_at is not null) then
  raise exception 'Phiên bàn đã đóng.';
 end if;
 update public.order_items set cancelled_at=now(),cancelled_by=v_user,cancel_reason=btrim(coalesce(p_reason,'')) where id=p_item_id;
 if not exists(select 1 from public.order_items where order_id=v_item.order_id and category<>'do_uong' and cancelled_at is null) then
  update public.orders set kitchen_relevant=false,status='done',done_at=coalesce(done_at,now()) where id=v_item.order_id;
 end if;
 if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=v_session and not i.paid and i.cancelled_at is null) then
  update public.table_sessions set closed_at=now() where id=v_session;
 end if;
 insert into public.audit_log(type,table_no,session_id,user_id,extra)
 values('cancel_item',v_table,v_session,v_user,jsonb_build_object('item_id',v_item.id,'order_id',v_item.order_id,
 'name',v_item.name,'qty',v_item.qty,'price',v_item.price,'reason',btrim(coalesce(p_reason,'')),'kitchen_status',
 (select status from public.orders where id=v_item.order_id)));
end;
$function$;

revoke all on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated;
revoke all on function public.cancel_order_item(uuid,text) from public,anon;
grant execute on function public.cancel_order_item(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;

