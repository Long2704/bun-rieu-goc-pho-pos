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
   where o.status='cooking' and o.kitchen_relevant),'[]'::jsonb));
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
revoke all on function public.get_pos_live_snapshot(boolean,boolean) from public,anon;
grant execute on function public.get_pos_live_snapshot(boolean,boolean) to authenticated;

-- Capability only: keep existing permissions, access checks, function OID and grants.
do $patch$
declare v_definition text;
begin
 v_definition:=pg_get_functiondef('public.get_my_access()'::regprocedure);
 if position('''live_snapshot''' in v_definition)=0 then
  if position('jsonb_build_object(' in v_definition)=0 then raise exception 'Unrecognized access function';end if;
  v_definition:=regexp_replace(v_definition,'jsonb_build_object\(','jsonb_build_object(''live_snapshot'',true,');
  execute v_definition;
 end if;
end;
$patch$;
notify pgrst,'reload schema';
