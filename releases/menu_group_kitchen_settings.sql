begin;
alter table public.menu_groups add column kitchen_category text not null default 'an_them' check(kitchen_category in ('bun','an_them'));
alter table public.menu_groups add column version integer not null default 1;
update public.menu_groups set kitchen_category=category where category in ('bun','an_them');
create function public.menu_group_default_kitchen_category() returns trigger language plpgsql set search_path='' as $$
begin
 if new.category in ('bun','an_them') then new.kitchen_category:=new.category;end if;
 return new;
end;
$$;
revoke all on function public.menu_group_default_kitchen_category() from public,anon,authenticated;
create trigger menu_group_default_kitchen_category before insert on public.menu_groups for each row execute function public.menu_group_default_kitchen_category();
create table public.menu_group_settings_requests(request_id uuid primary key,user_id uuid not null references public.profiles(id),payload jsonb not null,group_id text not null references public.menu_groups(id));
alter table public.menu_group_settings_requests enable row level security;
revoke all on public.menu_group_settings_requests from public,anon,authenticated;
grant select on public.menu_group_settings_requests to authenticated;
create policy menu_group_settings_owner_read on public.menu_group_settings_requests for select to authenticated using(auth.uid() is not null and public.has_permission('menu.manage'));
create function public.save_menu_group_settings(p_request_id uuid,p_group_id text,p_expected_version integer,p_name text,p_category text,p_send_to_kitchen boolean) returns text
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_payload jsonb;v_previous public.menu_group_settings_requests%rowtype;v_group public.menu_groups%rowtype;v_id text;v_category text;
begin
 if v_user is null or not public.has_permission('menu.manage') then raise exception 'Chỉ chủ quán được quản lý nhóm món.';end if;
 if p_request_id is null or p_send_to_kitchen is null or p_expected_version is null then raise exception 'Thông tin nhóm món không hợp lệ.';end if;
 v_payload:=jsonb_build_object('group_id',p_group_id,'version',p_expected_version,'name',p_name,'category',p_category,'send',p_send_to_kitchen);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_previous from public.menu_group_settings_requests where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.payload is distinct from v_payload then raise exception 'Mã thiết lập nhóm đã được sử dụng.';end if;
  return v_previous.group_id;
 end if;
 if p_group_id is null then
  if p_expected_version<>0 or p_category is null or p_category not in ('bun','an_them','do_uong') then raise exception 'Thông tin nhóm món không hợp lệ.';end if;
  v_category:=case when p_send_to_kitchen then case when p_category='do_uong' then 'an_them' else p_category end else 'do_uong' end;
  v_id:=public.create_menu_group(p_request_id,p_name,v_category);
  update public.menu_groups set kitchen_category=case when p_category='bun' then 'bun' else 'an_them' end where id=v_id;
 else
  lock table public.menu_items in share row exclusive mode;
  select * into v_group from public.menu_groups where id=p_group_id for update;
  if not found then raise exception 'Không tìm thấy nhóm món.';end if;
  if v_group.version<>p_expected_version then raise exception 'Nhóm món đã thay đổi. Tải lại rồi thử lại.';end if;
  v_id:=v_group.id;v_category:=case when p_send_to_kitchen then v_group.kitchen_category else 'do_uong' end;
  -- Bind default-group items before changing their kitchen classification.
  insert into public.menu_item_groups(item_id,group_id)
   select m.id,v_id from public.menu_items m where m.category=v_id and not exists(select 1 from public.menu_item_groups a where a.item_id=m.id)
   on conflict(item_id) do nothing;
  update public.menu_items m set category=v_category,version=m.version+1
   from public.menu_item_groups a where a.item_id=m.id and a.group_id=v_id and m.category is distinct from v_category;
  update public.menu_groups set category=v_category,version=version+1 where id=v_id;
  insert into public.audit_log(type,user_id,extra) values('menu_update',v_user,jsonb_build_object('action','group_kitchen','group_id',v_id,'send_to_kitchen',p_send_to_kitchen));
 end if;
 insert into public.menu_group_settings_requests(request_id,user_id,payload,group_id) values(p_request_id,v_user,v_payload,v_id);
 return v_id;
end;
$$;
revoke all on function public.save_menu_group_settings(uuid,text,integer,text,text,boolean) from public,anon;
grant execute on function public.save_menu_group_settings(uuid,text,integer,text,text,boolean) to authenticated;
create or replace function public.menu_group_catalog() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(public.has_permission('orders.read') or public.has_permission('menu.manage')) then
  raise exception 'Bạn không có quyền đọc nhóm món.';
 end if;
 return jsonb_build_object('kitchen_settings',true,'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'sort',sort,'version',version,'send_to_kitchen',category<>'do_uong') order by sort,id),'[]'::jsonb) from public.menu_groups),
 'assignments',(select coalesce(jsonb_object_agg(a.item_id::text,a.group_id),'{}'::jsonb) from public.menu_item_groups a join public.menu_groups g on g.id=a.group_id join public.menu_items m on m.id=a.item_id where g.category=m.category));
end;
$$;

notify pgrst,'reload schema';
commit;
select id,name,category<>'do_uong' as send_to_kitchen,version from public.menu_groups order by sort,id;
