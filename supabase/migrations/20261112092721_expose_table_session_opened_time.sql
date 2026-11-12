set local lock_timeout='3s';
set local statement_timeout='20s';
-- Read-only metadata addition. Keep existing invoker security, scope and ACLs.
create or replace function public.get_linked_table_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'table_id',s.table_id,'table_path',s.table_path,'opened_at',s.opened_at,
   'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at,o.id) from public.orders o where o.session_id=s.id),'[]'::jsonb)) order by s.id) from public.table_sessions s where s.closed_at is null),'[]'::jsonb),
  'links',public.get_active_table_links()
 );
$$;

create or replace function public.get_pos_sync_delta(p_session_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[];v_result jsonb;
begin
 if auth.uid() is null or not public.has_permission('orders.read') then raise exception 'Bạn không có quyền đọc đơn.';end if;
 if p_session_ids is null or cardinality(p_session_ids) not between 1 and 30 or array_position(p_session_ids,null) is not null then raise exception 'Phạm vi đồng bộ không hợp lệ.';end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_session_ids) x;
 select jsonb_build_object(
  'session_ids',to_jsonb(v_ids),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'table_id',s.table_id,'table_path',s.table_path,'opened_at',s.opened_at,
   'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at,o.id) from public.orders o where o.session_id=s.id),'[]'::jsonb)) order by s.id)
   from public.table_sessions s where s.closed_at is null and s.id=any(v_ids)),'[]'::jsonb),
  'links',coalesce((select jsonb_agg(l) from jsonb_array_elements(public.get_active_table_links()) l where (l->>'session_id')::uuid=any(v_ids)),'[]'::jsonb),
  'kitchen',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
   'table_sessions',jsonb_build_object('table_id',s.table_id,'closed_at',s.closed_at,'table_path',s.table_path)) order by o.created_at,o.id)
   from public.orders o join public.table_sessions s on s.id=o.session_id
   where o.session_id=any(v_ids) and o.status='cooking' and o.kitchen_relevant),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;
notify pgrst,'reload schema';
