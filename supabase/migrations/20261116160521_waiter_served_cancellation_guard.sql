begin;
set local lock_timeout='5s';
-- Preserve request replay, permissions and table/session/order lock ordering.
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
 if public.current_staff_role()='phuc_vu' and v_item.category<>'do_uong'
 and exists(select 1 from public.orders where id=v_item.order_id and not is_draft and kitchen_relevant and status='done') then
  raise exception 'Bếp đã ra món. Phục vụ không thể hủy món này.';
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
CREATE OR REPLACE FUNCTION public.cancel_table_session(p_session_id uuid, p_request_id uuid, p_expected_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_table integer;v_existing public.table_cancellations%rowtype;v_expected uuid[];v_ids uuid[];v_items jsonb;
begin
 if v_user is null or not public.has_permission('tables.cancel') then raise exception 'Bạn không có quyền hủy bàn.'; end if;
 if p_session_id is null or p_request_id is null or p_expected_item_ids is null or cardinality(p_expected_item_ids)=0 then raise exception 'Thiếu thông tin xác nhận hủy bàn.'; end if;
 select array_agg(x order by x) into v_expected from unnest(p_expected_item_ids) x;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from public.table_cancellations where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.session_id<>p_session_id or v_existing.item_ids is distinct from v_expected then raise exception 'Mã hủy bàn đã được sử dụng.'; end if;
  return;
 end if;
 select table_id into v_table from public.table_sessions where id=p_session_id;
 if not found then raise exception 'Phiên bàn không còn mở.'; end if;
 perform 1 from public.restaurant_tables where id=v_table for update;
 perform 1 from public.table_sessions where id=p_session_id and closed_at is null for update;
 if not found then raise exception 'Phiên bàn không còn mở.'; end if;
 if not exists(select 1 from public.table_sessions where id=p_session_id and table_id=v_table) then raise exception 'Bàn vừa được chuyển. Đồng bộ và kiểm tra lại.'; end if;
 perform 1 from public.orders where session_id=p_session_id order by id for update;
 perform 1 from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=p_session_id and not i.paid and i.cancelled_at is null for update of i;
 select array_agg(i.id order by i.id),jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'qty',i.qty,'price',i.price) order by i.id) into v_ids,v_items
  from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=p_session_id and not i.paid and i.cancelled_at is null;
 if v_ids is null or v_ids is distinct from v_expected then raise exception 'Danh sách món đã thay đổi. Đồng bộ và xác nhận hủy bàn lại.'; end if;
 if public.current_staff_role()='phuc_vu' and exists(
  select 1 from public.orders o join public.order_items i on i.order_id=o.id
  where o.session_id=p_session_id and not o.is_draft and o.kitchen_relevant and o.status='done'
  and i.category<>'do_uong' and i.cancelled_at is null
 ) then raise exception 'Bàn có món đã ra. Phục vụ không thể hủy cả bàn.'; end if;
 update public.order_items set cancelled_at=now(),cancelled_by=v_user,cancel_reason='' where id=any(v_ids);
 update public.orders o set status='done',kitchen_relevant=false,done_at=coalesce(done_at,now())
  where session_id=p_session_id and not exists(select 1 from public.order_items i where i.order_id=o.id and i.category<>'do_uong' and i.cancelled_at is null);
 update public.table_sessions set closed_at=now() where id=p_session_id;
 insert into public.table_cancellations(request_id,session_id,user_id,item_ids) values(p_request_id,p_session_id,v_user,v_ids);
 insert into public.audit_log(type,table_no,session_id,user_id,extra) values('cancel_table',v_table,p_session_id,v_user,jsonb_build_object('items',v_items,'count',cardinality(v_ids)));
end;
$function$;
commit;
