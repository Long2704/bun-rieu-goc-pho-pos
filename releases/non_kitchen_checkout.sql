begin;
create or replace function public.submit_non_kitchen_order(p_table_id integer,p_request_id uuid,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền tạo đơn.';end if;
 if p_request_id is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Dữ liệu đơn không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 -- Replays retain the original result even if menu configuration changed later.
 if exists(select 1 from public.orders where request_id=p_request_id) then return public.submit_order(p_table_id,p_request_id,p_items);end if;
 -- Match normal submit's lock order: request -> table -> menu items.
 perform 1 from public.restaurant_tables where id=p_table_id for update;
 perform 1 from public.menu_items m where id in (select (i->>'menu_item_id')::uuid from jsonb_array_elements(p_items) i) order by id for share;
 if exists(select 1 from public.menu_items m where id in (select (i->>'menu_item_id')::uuid from jsonb_array_elements(p_items) i) and category<>'do_uong') then
  raise exception 'Đơn có món cần gửi bếp. Kiểm tra và bấm Gửi bếp.';
 end if;
 return public.submit_order(p_table_id,p_request_id,p_items);
end;
$$;
revoke all on function public.submit_non_kitchen_order(integer,uuid,jsonb) from public,anon;
grant execute on function public.submit_non_kitchen_order(integer,uuid,jsonb) to authenticated;
create or replace function public.menu_group_catalog() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(public.has_permission('orders.read') or public.has_permission('menu.manage')) then raise exception 'Bạn không có quyền đọc nhóm món.';end if;
 return jsonb_build_object('non_kitchen_checkout',true,
 'kitchen_settings',to_regprocedure('public.save_menu_group_settings(uuid,text,integer,text,text,boolean)') is not null,
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'sort',sort,'version',coalesce((to_jsonb(g)->>'version')::integer,1),'send_to_kitchen',category<>'do_uong') order by sort,id),'[]'::jsonb) from public.menu_groups g),
 'assignments',(select coalesce(jsonb_object_agg(a.item_id::text,a.group_id),'{}'::jsonb) from public.menu_item_groups a join public.menu_groups g on g.id=a.group_id join public.menu_items m on m.id=a.item_id where g.category=m.category));
end;
$$;
notify pgrst,'reload schema';
commit;
