-- Run once on the POS database (after existing menu/permission migrations).
-- Additive: no menu items, orders, invoices, prices or category snapshots are rewritten.
begin;
create table public.menu_groups(
 id text primary key,
 name text not null check(length(btrim(name)) between 1 and 80),
 category text not null check(category in ('bun','an_them','do_uong')),
 sort integer not null,
 request_id uuid unique,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create unique index menu_groups_name_unique on public.menu_groups(lower(btrim(name)));
insert into public.menu_groups(id,name,category,sort) values
 ('bun','Món chính','bun',10),('an_them','Món thêm','an_them',20),('do_uong','Đồ uống','do_uong',30);
create table public.menu_item_groups(
 item_id uuid primary key references public.menu_items(id),
 group_id text not null references public.menu_groups(id)
);
create table public.menu_group_item_requests(
 request_id uuid primary key references public.menu_changes(request_id),
 group_id text not null references public.menu_groups(id)
);
alter table public.menu_groups enable row level security;
alter table public.menu_item_groups enable row level security;
alter table public.menu_group_item_requests enable row level security;
revoke all on public.menu_groups,public.menu_item_groups,public.menu_group_item_requests from public,anon,authenticated;
grant select on public.menu_groups,public.menu_item_groups,public.menu_group_item_requests to authenticated;
create policy menu_groups_staff_read on public.menu_groups for select to authenticated
 using(auth.uid() is not null and (public.has_permission('orders.read') or public.has_permission('menu.manage')));
create policy menu_item_groups_staff_read on public.menu_item_groups for select to authenticated
 using(auth.uid() is not null and (public.has_permission('orders.read') or public.has_permission('menu.manage')));
create policy menu_group_requests_owner_read on public.menu_group_item_requests for select to authenticated
 using(auth.uid() is not null and public.has_permission('menu.manage'));

create function public.menu_group_catalog() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(public.has_permission('orders.read') or public.has_permission('menu.manage')) then
  raise exception 'Bạn không có quyền đọc nhóm món.';
 end if;
 return jsonb_build_object('groups',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'sort',sort) order by sort,id),'[]'::jsonb) from public.menu_groups),
 'assignments',(select coalesce(jsonb_object_agg(a.item_id::text,a.group_id),'{}'::jsonb) from public.menu_item_groups a join public.menu_groups g on g.id=a.group_id join public.menu_items m on m.id=a.item_id where g.category=m.category));
end;
$$;
create function public.create_menu_group(p_request_id uuid,p_name text,p_category text) returns text
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_old public.menu_groups%rowtype;v_id text;v_sort integer;
begin
 if v_user is null or not public.has_permission('menu.manage') then raise exception 'Chỉ chủ quán được quản lý nhóm món.';end if;
 if p_request_id is null then raise exception 'Thiếu mã tạo nhóm món.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_old from public.menu_groups where request_id=p_request_id;
 if found then
  if v_old.created_by<>v_user or v_old.name is distinct from btrim(p_name) or v_old.category is distinct from p_category then raise exception 'Mã tạo nhóm món đã được sử dụng.';end if;
  return v_old.id;
 end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Tên nhóm phải từ 1 đến 80 ký tự.';end if;
 if p_category is null or p_category not in ('bun','an_them','do_uong') then raise exception 'Loại nhóm món không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('goc-pho-menu-groups',0));
 if exists(select 1 from public.menu_groups where lower(btrim(name))=lower(btrim(p_name))) then raise exception 'Tên nhóm món đã tồn tại.';end if;
 v_id:=gen_random_uuid()::text;
 select coalesce(max(sort),0)+10 into v_sort from public.menu_groups;
 insert into public.menu_groups(id,name,category,sort,request_id,created_by) values(v_id,btrim(p_name),p_category,v_sort,p_request_id,v_user);
 insert into public.audit_log(type,user_id,extra) values('menu_update',v_user,jsonb_build_object('action','group_create','group_id',v_id,'name',btrim(p_name),'category',p_category));
 return v_id;
end;
$$;
create function public.save_menu_item_in_group(p_request_id uuid,p_item_id uuid,p_expected_version bigint,
 p_name text,p_price integer,p_category text,p_is_active boolean,p_is_out boolean,p_sort integer,p_group_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_existing text;v_id uuid;v_category text;
begin
 if v_user is null or not public.has_permission('menu.manage') then raise exception 'Chỉ chủ quán được quản lý thực đơn.';end if;
 if p_request_id is null then raise exception 'Thiếu mã cập nhật thực đơn.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select group_id into v_existing from public.menu_group_item_requests where request_id=p_request_id;
 if found then
  if v_existing is distinct from p_group_id then raise exception 'Mã cập nhật thực đơn đã được sử dụng.';end if;
  -- The existing RPC checks the same user and all original payload fields on replay.
  return public.save_menu_item(p_request_id,p_item_id,p_expected_version,p_name,p_price,p_category,p_is_active,p_is_out,p_sort);
 end if;
 if exists(select 1 from public.menu_changes where request_id=p_request_id) then raise exception 'Mã cập nhật thực đơn đã được sử dụng.';end if;
 select category into v_category from public.menu_groups where id=p_group_id;
 if not found or v_category is distinct from p_category then raise exception 'Nhóm món không hợp lệ. Tải lại thực đơn rồi chọn nhóm.';end if;
 v_id:=public.save_menu_item(p_request_id,p_item_id,p_expected_version,p_name,p_price,p_category,p_is_active,p_is_out,p_sort);
 insert into public.menu_item_groups(item_id,group_id) values(v_id,p_group_id) on conflict(item_id) do update set group_id=excluded.group_id;
 insert into public.menu_group_item_requests(request_id,group_id) values(p_request_id,p_group_id);
 return v_id;
end;
$$;
revoke all on function public.menu_group_catalog(),public.create_menu_group(uuid,text,text),public.save_menu_item_in_group(uuid,uuid,bigint,text,integer,text,boolean,boolean,integer,text) from public,anon;
grant execute on function public.menu_group_catalog(),public.create_menu_group(uuid,text,text),public.save_menu_item_in_group(uuid,uuid,bigint,text,integer,text,boolean,boolean,integer,text) to authenticated;
create table public.menu_order_requests(
 request_id uuid primary key,
 user_id uuid not null references public.profiles(id),
 expected jsonb not null,
 ordered uuid[] not null,
 created_at timestamptz not null default now()
);
alter table public.menu_order_requests enable row level security;
revoke all on public.menu_order_requests from public,anon,authenticated;
grant select on public.menu_order_requests to authenticated;
create policy menu_order_requests_owner_read on public.menu_order_requests for select to authenticated
 using(auth.uid() is not null and public.has_permission('menu.manage'));
create function public.reorder_menu_items(p_request_id uuid,p_expected jsonb,p_ordered uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_old public.menu_order_requests%rowtype;v_actual jsonb;v_ids uuid[];v_requested uuid[];v_count integer;
begin
 if v_user is null or not public.has_permission('menu.manage') then raise exception 'Chỉ chủ quán được sắp xếp thực đơn.';end if;
 if p_request_id is null or p_expected is null or jsonb_typeof(p_expected)<>'array' or p_ordered is null then raise exception 'Danh sách món không hợp lệ.';end if;
 if cardinality(p_ordered) not between 1 and 10000 or jsonb_array_length(p_expected)<>cardinality(p_ordered) then raise exception 'Danh sách món không hợp lệ.';end if;
 select count(distinct x),array_agg(x order by x) into v_count,v_requested from unnest(p_ordered) x;
 if v_count<>cardinality(p_ordered) then raise exception 'Danh sách món không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_old from public.menu_order_requests where request_id=p_request_id;
 if found then
  if v_old.user_id<>v_user or v_old.expected is distinct from p_expected or v_old.ordered is distinct from p_ordered then raise exception 'Mã sắp xếp món đã được sử dụng.';end if;
  return;
 end if;
 -- Serialize against inserts and edits, including legacy menu clients.
 lock table public.menu_items in share row exclusive mode;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'sort',sort) order by sort,id),'[]'::jsonb),array_agg(id order by id)
 into v_actual,v_ids from public.menu_items;
 if v_ids is distinct from v_requested then raise exception 'Danh sách món đã thay đổi. Tải lại và sắp xếp lại.';end if;
 if v_actual is distinct from p_expected then raise exception 'Thực đơn đã thay đổi ở thiết bị khác. Tải lại và sắp xếp lại.';end if;
 update public.menu_items m set sort=(n.position-1)::integer,version=version+1
 from unnest(p_ordered) with ordinality n(id,position)
 where m.id=n.id and m.sort is distinct from (n.position-1)::integer;
 insert into public.menu_order_requests(request_id,user_id,expected,ordered) values(p_request_id,v_user,p_expected,p_ordered);
 insert into public.audit_log(type,user_id,extra) values('menu_update',v_user,jsonb_build_object('action','reorder','ordered_ids',p_ordered));
end;
$$;
revoke all on function public.reorder_menu_items(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.reorder_menu_items(uuid,jsonb,uuid[]) to authenticated;

notify pgrst,'reload schema';
commit;
-- Expected: the three built-in groups. Custom groups are added from the Owner UI.
select id,name,category from public.menu_groups order by sort,id;
