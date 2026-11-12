set local lock_timeout='3s';
set local statement_timeout='20s';
-- Preserve completed requests: retries return their original result without editing.
create or replace function pos_sync.set_item_takeaway(p_request_id uuid,p_item_id uuid,p_expected_version integer,p_expected_takeaway boolean,p_takeaway boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_payload jsonb;v_result jsonb;v_existing pos_sync.takeaway_edits%rowtype;
 v_item public.order_items%rowtype;v_session uuid;v_table integer;v_order public.orders%rowtype;
begin
 if v_user is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền đổi cách phục vụ món.';end if;
 if p_request_id is null or p_item_id is null or p_expected_version is null or p_expected_version<0 or p_takeaway is null then raise exception 'Thông tin mang về không hợp lệ.';end if;
 v_payload:=jsonb_build_object('item',p_item_id,'version',p_expected_version,'expected',p_expected_takeaway,'takeaway',p_takeaway);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,137));
 select * into v_existing from pos_sync.takeaway_edits where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.payload<>v_payload then raise exception 'Mã chỉnh sửa đã được sử dụng.';end if;
  return v_existing.result;
 end if;
 select o.session_id,s.table_id into v_session,v_table from public.order_items i join public.orders o on o.id=i.order_id join public.table_sessions s on s.id=o.session_id where i.id=p_item_id;
 if not found then raise exception 'Không tìm thấy dòng món.';end if;
 perform 1 from public.restaurant_tables where id=v_table for update;
 perform 1 from public.table_sessions where id=v_session and table_id=v_table and closed_at is null for update;
 if not found then raise exception 'Phiên bàn đã thay đổi hoặc đã thanh toán.';end if;
 -- Match completion/transfer lock order: table -> session -> order -> item.
 select o.* into v_order from public.orders o join public.order_items i on i.order_id=o.id where i.id=p_item_id for update of o;
 if not found then raise exception 'Không tìm thấy dòng món.';end if;
 select * into v_item from public.order_items where id=p_item_id for update;
 if v_order.session_id is distinct from v_session or v_item.paid or v_item.cancelled_at is not null then raise exception 'Chỉ đổi cách phục vụ món chưa thanh toán, chưa hủy.';end if;
 if v_order.kitchen_relevant and not v_order.is_draft and v_order.status='done' and v_item.category<>'do_uong' then raise exception 'Bếp đã ra món. Dấu Mang về đã khóa.';end if;
 if v_item.takeaway_version<>p_expected_version or v_item.is_takeaway is distinct from p_expected_takeaway then raise exception 'Món đã được thiết bị khác chỉnh sửa. Đồng bộ và thử lại.';end if;
 if v_item.is_takeaway is distinct from p_takeaway then
  update public.order_items set is_takeaway=p_takeaway,takeaway_version=takeaway_version+1 where id=p_item_id returning * into v_item;
  insert into public.audit_log(type,table_no,session_id,user_id,extra) values('order_takeaway_edited',v_table,v_session,v_user,
   jsonb_build_object('item_id',p_item_id,'name',v_item.name,'qty',v_item.qty,'is_takeaway',p_takeaway));
 end if;
 v_result:=jsonb_build_object('ok',true,'item_id',p_item_id,'is_takeaway',v_item.is_takeaway,'version',v_item.takeaway_version);
 insert into pos_sync.takeaway_edits(request_id,user_id,item_id,payload,result) values(p_request_id,v_user,p_item_id,v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function pos_sync.set_item_takeaway(uuid,uuid,integer,boolean,boolean) from public,anon;
grant usage on schema pos_sync to authenticated;
grant execute on function pos_sync.set_item_takeaway(uuid,uuid,integer,boolean,boolean) to authenticated;
