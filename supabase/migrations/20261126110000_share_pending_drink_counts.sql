begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

-- Match list_drink_tickets(false): one pending ticket per order, including paid
-- drinks in closed sessions. Expose only the counts, with the same access gate.
-- pos_sync is not a PostgREST-exposed schema. Keep the snapshot RPCs invoker.
create function pos_sync.pending_drink_counts(p_session_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not coalesce(public.has_permission('orders.read'),false)
    or coalesce(public.current_staff_role(),'') not in ('phuc_vu','thu_ngan','bep','chu') then
  return null;
 end if;
 if p_session_ids is not null and cardinality(p_session_ids) not between 1 and 30 then
  raise exception 'Phạm vi đồng bộ không hợp lệ.';
 end if;
 select coalesce(jsonb_object_agg(q.session_id,q.pending_count),'{}'::jsonb)
 into v_result from (
  select o.session_id,count(distinct o.id) as pending_count
  from public.order_items i
  join public.orders o on o.id=i.order_id
  join public.table_sessions s on s.id=o.session_id
  where i.category='do_uong' and i.drink_queued_at is not null
    and i.cancelled_at is null and i.qty>i.drink_done_qty
    and (p_session_ids is null or o.session_id=any(p_session_ids))
  group by o.session_id
 ) q;
 return v_result;
end;
$$;
revoke all on function pos_sync.pending_drink_counts(uuid[]) from public,anon,authenticated;
grant execute on function pos_sync.pending_drink_counts(uuid[]) to authenticated;

-- Bundle existing invoker reads in one statement snapshot; preserve RLS and existing APIs.
create or replace function public.get_pos_live_snapshot(p_catalog boolean default false,p_catalog_only boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_access jsonb;v_snapshot jsonb:=null;v_catalog jsonb:=null;
begin
 v_access:=public.get_my_access();
 if auth.uid() is null or v_access is null or coalesce((v_access->>'is_active')::boolean,false)=false or coalesce((v_access->>'must_change_password')::boolean,false) or coalesce((v_access->>'session_invalid')::boolean,false) then
  return jsonb_build_object('version',1,'access',v_access,'snapshot',null,'catalog',null);
 end if;
 if not public.has_permission('orders.read') then raise exception 'Bạn không có quyền đọc đơn.';end if;
 if not coalesce(p_catalog_only,false) then
  v_snapshot:=public.get_linked_table_snapshot()||jsonb_build_object('kitchen',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
   'table_sessions',jsonb_build_object('table_id',s.table_id,'closed_at',s.closed_at,'table_path',s.table_path)) order by o.created_at,o.id)
   from public.orders o join public.table_sessions s on s.id=o.session_id
   where o.status='cooking' and o.kitchen_relevant),'[]'::jsonb),
   'drink_counts',pos_sync.pending_drink_counts(null));
 end if;
 if coalesce(p_catalog,false) or coalesce(p_catalog_only,false) then
  select jsonb_build_object(
   'menu',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'price',m.price,'category',m.category,'is_out',m.is_out) order by m.sort,m.id) from public.menu_items m where m.is_active),'[]'::jsonb),
   'tables',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'service_type',t.service_type) order by t.display_order,t.id) from public.restaurant_tables t where t.is_active),'[]'::jsonb)
  ) into v_catalog;
 end if;
 return jsonb_build_object('version',1,'access',v_access,'snapshot',v_snapshot,'catalog',v_catalog);
end;
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
  'drink_counts',pos_sync.pending_drink_counts(v_ids),
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
commit;
