begin;
set local lock_timeout='5s';
create or replace function public.send_saved_menu_selections(p_table_id integer,p_session_id uuid,p_order_ids uuid[],p_request_id uuid,p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_id uuid;v_now timestamptz;v_pending uuid[];v_anchor uuid;v_existing boolean;
begin
 if auth.uid() is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền gửi đơn.';end if;
 if p_session_id is null or p_request_id is null or p_order_ids is null or cardinality(p_order_ids)>500 then raise exception 'Yêu cầu gửi không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 perform 1 from public.restaurant_tables t where t.id=p_table_id or t.id in(select table_id from public.active_table_links where session_id=p_session_id) order by t.id for update;
 perform 1 from public.table_sessions where id=p_session_id for update;
 if exists(select 1 from unnest(p_order_ids) x where not exists(select 1 from public.orders o where o.id=x and o.session_id=p_session_id)) then raise exception 'Lượt gọi món đã thay đổi. Đồng bộ và kiểm tra lại.';end if;
 -- A successful replay after payment may only acknowledge the original IDs.
 if not exists(select 1 from public.table_sessions s where s.id=p_session_id and s.closed_at is null and(s.table_id=p_table_id or exists(select 1 from public.active_table_links l where l.table_id=p_table_id and l.session_id=s.id))) then
  if jsonb_array_length(p_items)>0 and exists(select 1 from public.orders where request_id=p_request_id) and not exists(select 1 from public.orders where id=any(p_order_ids) and is_draft) then return public.submit_order(p_table_id,p_request_id,p_items);end if;
  if cardinality(p_order_ids)>0 and not exists(select 1 from public.orders where id=any(p_order_ids) and is_draft) and jsonb_array_length(p_items)=0 then return p_request_id;end if;
  raise exception 'Phiên bàn đã thay đổi. Đồng bộ và kiểm tra bàn trước khi gọi món.';
 end if;
 -- Only the captured, still-unsent batches may enter this new kitchen ticket.
 perform 1 from public.orders where id=any(p_order_ids) order by id for update;
 select array_agg(id order by created_at,id) into v_pending from public.orders where id=any(p_order_ids) and is_draft;
 select exists(select 1 from public.orders where request_id=p_request_id) into v_existing;
 if jsonb_array_length(p_items)>0 then
  if v_existing and cardinality(v_pending)>0 then raise exception 'Mã gửi đã được sử dụng. Đồng bộ và kiểm tra lại.';end if;
  v_id:=public.submit_order(p_table_id,p_request_id,p_items);
  if not v_existing then v_pending:=array_append(coalesce(v_pending,'{}'::uuid[]),v_id);end if;
 end if;
 if coalesce(cardinality(v_pending),0)=0 then return coalesce(v_id,p_request_id);end if;
 perform 1 from public.order_items where order_id=any(v_pending) order by id for update;
 -- Prefer the just-submitted ticket; otherwise use the oldest unsent kitchen batch.
 select o.id into v_anchor from public.orders o where o.id=any(v_pending)
  and exists(select 1 from public.order_items i where i.order_id=o.id and i.category<>'do_uong' and not i.paid and i.cancelled_at is null)
  order by (o.id=v_id) desc nulls last,(select min(i.kitchen_position) from public.order_items i where i.order_id=o.id and i.category<>'do_uong' and not i.paid and i.cancelled_at is null),o.created_at,o.id limit 1;
 if v_anchor is not null then
  -- Move the original line IDs, preserving notes, quantities, bill numbers and FIFO positions.
  -- Drinks, paid lines and cancelled lines stay on their original batches.
  update public.order_items set order_id=v_anchor where order_id=any(v_pending) and order_id<>v_anchor
   and category<>'do_uong' and not paid and cancelled_at is null;
 end if;
 v_now:=clock_timestamp();
 update public.orders set is_draft=false,kitchen_relevant=false,status='done',done_at=coalesce(done_at,v_now)
  where id=any(v_pending) and id is distinct from v_anchor;
 if v_anchor is not null then
  update public.orders set is_draft=false,kitchen_relevant=true,status='cooking',done_at=null,created_at=v_now where id=v_anchor;
  if v_anchor is distinct from v_id then
   insert into public.audit_log(type,table_no,session_id,user_id,extra) values('order_created',p_table_id,p_session_id,auth.uid(),jsonb_build_object('order_id',v_anchor,'batch_ids',to_jsonb(v_pending)));
  end if;
 end if;
 return coalesce(v_id,p_request_id);
end;$$;
revoke all on function public.send_saved_menu_selections(integer,uuid,uuid[],uuid,jsonb) from public,anon;
grant execute on function public.send_saved_menu_selections(integer,uuid,uuid[],uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
