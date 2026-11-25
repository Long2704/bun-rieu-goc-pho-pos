-- Remove entries from the working catalog without deleting historical FK targets.
set local lock_timeout='5s';
alter table public.menu_items add column deleted_at timestamptz;
alter table public.restaurant_tables add column deleted_at timestamptz;
alter table public.menu_items add constraint menu_deleted_inactive check(deleted_at is null or is_active=false);
alter table public.restaurant_tables add constraint table_deleted_inactive check(deleted_at is null or is_active=false);
create table public.catalog_deletion_requests(
 request_id uuid primary key,
 user_id uuid not null references public.profiles(id),
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.catalog_deletion_requests enable row level security;
revoke all on public.catalog_deletion_requests from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.list_menu_management()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not public.has_permission('menu.manage') then
  raise exception 'Chỉ chủ quán được quản lý thực đơn.';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price,'category',category,
  'is_active',is_active,'is_out',is_out,'sort',sort,'version',version) order by sort,id) from public.menu_items where deleted_at is null),'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_table_management()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not public.has_permission('tables.manage') then raise exception 'Chỉ chủ quán được quản lý bàn.';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'is_active',t.is_active,'version',t.management_version,'display_order',t.display_order,
 'busy',exists(select 1 from public.table_sessions s where s.table_id=t.id and s.closed_at is null)
 or exists(select 1 from public.active_table_links l where l.table_id=t.id)
 or exists(select 1 from public.orders o join public.table_sessions s on s.id=o.session_id where o.status='cooking' and o.kitchen_relevant and (s.table_id=t.id or o.table_path @> array[t.id] or s.table_path @> array[t.id]))) order by t.display_order,t.id),'[]'::jsonb)
 from public.restaurant_tables t where t.id>0 and t.deleted_at is null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_menu_items(p_request_id uuid, p_expected jsonb, p_ordered uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 into v_actual,v_ids from public.menu_items where deleted_at is null;
 if v_ids is distinct from v_requested then raise exception 'Danh sách món đã thay đổi. Tải lại và sắp xếp lại.';end if;
 if v_actual is distinct from p_expected then raise exception 'Thực đơn đã thay đổi ở thiết bị khác. Tải lại và sắp xếp lại.';end if;
 update public.menu_items m set sort=(n.position-1)::integer,version=version+1
 from unnest(p_ordered) with ordinality n(id,position)
 where m.id=n.id and m.sort is distinct from (n.position-1)::integer;
 insert into public.menu_order_requests(request_id,user_id,expected,ordered) values(p_request_id,v_user,p_expected,p_ordered);
 insert into public.audit_log(type,user_id,extra) values('menu_update',v_user,jsonb_build_object('action','reorder','ordered_ids',p_ordered));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_restaurant_tables(p_request_id uuid, p_expected_ids integer[], p_ordered_ids integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_old public.table_order_changes%rowtype;v_actual integer[];v_expected_set integer[];v_new_set integer[];v_count integer;
begin
 if v_user is null or not public.has_permission('tables.manage') then raise exception 'Chỉ chủ quán được sắp xếp bàn.';end if;
 if p_request_id is null or p_expected_ids is null or p_ordered_ids is null or cardinality(p_expected_ids)=0 or cardinality(p_expected_ids)<>cardinality(p_ordered_ids) then raise exception 'Danh sách bàn không hợp lệ.';end if;
 select array_agg(x order by x) into v_expected_set from unnest(p_expected_ids) x;
 select array_agg(x order by x),count(distinct x) into v_new_set,v_count from unnest(p_ordered_ids) x where x>0;
 if v_count<>cardinality(p_ordered_ids) or v_new_set is distinct from v_expected_set then raise exception 'Danh sách bàn không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_old from public.table_order_changes where request_id=p_request_id;
 if found then
  if v_old.user_id<>v_user or v_old.expected_ids is distinct from p_expected_ids or v_old.ordered_ids is distinct from p_ordered_ids then raise exception 'Mã sắp xếp bàn đã được sử dụng.';end if;
  return;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('goc-pho-table-management',0));
 perform 1 from public.restaurant_tables where id>0 and deleted_at is null order by id for update;
 select array_agg(id order by display_order,id) into v_actual from public.restaurant_tables where id>0 and deleted_at is null;
 if v_actual is distinct from p_expected_ids then raise exception 'Danh sách hoặc thứ tự bàn đã thay đổi. Tải lại và sắp xếp lại.';end if;
 update public.restaurant_tables t set display_order=x.n::integer from unnest(p_ordered_ids) with ordinality x(id,n) where t.id=x.id;
 insert into public.table_order_changes(request_id,user_id,expected_ids,ordered_ids) values(p_request_id,v_user,p_expected_ids,p_ordered_ids);
 insert into public.audit_log(type,user_id,extra) values('table_order',v_user,jsonb_build_object('ordered_ids',p_ordered_ids,'count',cardinality(p_ordered_ids)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_menu_item(p_request_id uuid, p_item_id uuid, p_expected_version bigint, p_name text, p_price integer, p_category text, p_is_active boolean, p_is_out boolean, p_sort integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_old public.menu_items%rowtype; v_exists boolean;
 v_existing public.menu_changes%rowtype; v_payload jsonb; v_after jsonb;
begin
 if v_user is null or not public.has_permission('menu.manage') then
  raise exception 'Chỉ chủ quán được quản lý thực đơn.';
 end if;
 if p_request_id is null or p_item_id is null then raise exception 'Thiếu mã cập nhật thực đơn.'; end if;
 v_payload:=jsonb_build_object('item_id',p_item_id,'expected_version',p_expected_version,'name',btrim(p_name),
  'price',p_price,'category',p_category,'is_active',p_is_active,'is_out',p_is_out,'sort',p_sort);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from public.menu_changes where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.payload is distinct from v_payload then
   raise exception 'Mã cập nhật thực đơn đã được sử dụng.';
  end if;
  return v_existing.item_id;
 end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'Tên món phải từ 1 đến 120 ký tự.'; end if;
 if p_price is null or p_price<0 or p_price>10000000 then raise exception 'Giá món phải từ 0 đến 10000000 đồng.'; end if;
 if p_category is null or p_category not in ('bun','an_them','do_uong') then raise exception 'Nhóm món không hợp lệ.'; end if;
 if p_sort is null or p_sort not between 0 and 9999 or p_is_active is null or p_is_out is null
  or p_expected_version is null or p_expected_version<0 then raise exception 'Thông tin thực đơn không hợp lệ.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('menu:'||p_item_id::text,0));
 select * into v_old from public.menu_items where id=p_item_id for update;
 if found and v_old.deleted_at is not null then raise exception 'Món đã bị xóa. Tải lại thực đơn.';end if;
 v_exists:=found;
 if (v_exists and v_old.version<>p_expected_version) or (not v_exists and p_expected_version<>0) then
  raise exception 'Món đã được cập nhật ở nơi khác. Tải lại thực đơn rồi kiểm tra lại.';
 end if;
 if v_exists then
  update public.menu_items set name=btrim(p_name),price=p_price,category=p_category,is_active=p_is_active,
   is_out=p_is_out,sort=p_sort,version=version+1 where id=p_item_id;
 else
  insert into public.menu_items(id,name,price,category,is_active,is_out,sort)
  values(p_item_id,btrim(p_name),p_price,p_category,p_is_active,p_is_out,p_sort);
 end if;
 select jsonb_build_object('name',name,'price',price,'category',category,'is_active',is_active,'is_out',is_out,'sort',sort,'version',version)
 into v_after from public.menu_items where id=p_item_id;
 insert into public.menu_changes(request_id,item_id,user_id,payload) values(p_request_id,p_item_id,v_user,v_payload);
 insert into public.audit_log(type,user_id,extra) values('menu_update',v_user,jsonb_build_object('item_id',p_item_id,
  'action',case when v_exists then 'update' else 'create' end,'before',case when v_exists then
  jsonb_build_object('name',v_old.name,'price',v_old.price,'category',v_old.category,'is_active',v_old.is_active,'is_out',v_old.is_out,'sort',v_old.sort,'version',v_old.version) else null end,'after',v_after));
 return p_item_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_restaurant_table(p_request_id uuid, p_table_id integer, p_expected_version integer, p_name text, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_payload jsonb;v_existing public.table_changes%rowtype;v_old public.restaurant_tables%rowtype;v_id integer;v_seq text;
begin
 if v_user is null or not public.has_permission('tables.manage') then raise exception 'Chỉ chủ quán được quản lý bàn.';end if;
 if p_request_id is null or p_expected_version is null or p_is_active is null or p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Tên bàn phải từ 1 đến 80 ký tự.';end if;
 if (p_table_id is null and p_expected_version<>0) or (p_table_id is not null and (p_table_id<=0 or p_expected_version<=0)) then raise exception 'Thông tin bàn không hợp lệ.';end if;
 v_payload:=jsonb_build_object('id',p_table_id,'version',p_expected_version,'name',btrim(p_name),'active',p_is_active);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from public.table_changes where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.payload is distinct from v_payload then raise exception 'Mã cập nhật bàn đã được sử dụng.';end if;
  return v_existing.table_id;
 end if;
 -- Mọi cập nhật quản lý bàn đi qua khóa này: không cấp ID hoặc tên trùng.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('goc-pho-table-management',0));
 if p_table_id is not null then
  select * into v_old from public.restaurant_tables where id=p_table_id for update;
  if not found or v_old.deleted_at is not null then raise exception 'Bàn đã bị xóa hoặc không tồn tại. Tải lại danh sách.';end if;
  if v_old.management_version<>p_expected_version then raise exception 'Bàn đã được sửa ở nơi khác. Tải lại danh sách và kiểm tra lại.';end if;
  if exists(select 1 from public.table_sessions where table_id=p_table_id and closed_at is null)
   or exists(select 1 from public.orders o join public.table_sessions s on s.id=o.session_id where o.status='cooking' and o.kitchen_relevant
    and (s.table_id=p_table_id or o.table_path @> array[p_table_id] or s.table_path @> array[p_table_id])) then
   raise exception 'Bàn còn phiên khách hoặc món bếp chưa xong. Chưa thể sửa hoặc ngừng sử dụng.';
  end if;
 end if;
 if exists(select 1 from public.restaurant_tables where id>0 and deleted_at is null and id is distinct from p_table_id and lower(btrim(name))=lower(btrim(p_name))) then raise exception 'Tên bàn đã tồn tại. Chọn tên khác.';end if;
 if p_table_id is null then
  select coalesce(max(id),0)+1 into v_id from public.restaurant_tables where id>0;
  insert into public.restaurant_tables(id,name,is_active,service_type) overriding system value values(v_id,btrim(p_name),p_is_active,'dine_in');
  v_seq:=pg_get_serial_sequence('public.restaurant_tables','id');
  if v_seq is not null then perform pg_catalog.setval(v_seq::regclass,(select max(id) from public.restaurant_tables where id>0),true);end if;
 else
  v_id:=p_table_id;
  update public.restaurant_tables set name=btrim(p_name),is_active=p_is_active,management_version=management_version+1 where id=v_id;
 end if;
 insert into public.table_changes(request_id,user_id,table_id,payload) values(p_request_id,v_user,v_id,v_payload);
 insert into public.audit_log(type,table_no,user_id,extra) values('table_update',v_id,v_user,jsonb_build_object('action',case when p_table_id is null then 'create' else 'update' end,
 'before',case when p_table_id is null then null else jsonb_build_object('name',v_old.name,'active',v_old.is_active) end,'name',btrim(p_name),'active',p_is_active));
 return v_id;
end;
$function$;

create function public.delete_catalog_entry(p_request_id uuid,p_kind text,p_expected_version bigint,p_item_id uuid,p_table_id integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_payload jsonb;v_request public.catalog_deletion_requests%rowtype;
 v_item public.menu_items%rowtype;v_table public.restaurant_tables%rowtype;v_result jsonb;v_name text;
begin
 if v_user is null or p_kind is null or p_kind not in ('menu','table') or not public.has_permission(case when p_kind='menu' then 'menu.manage' else 'tables.manage' end) then
  raise exception 'Bạn không có quyền xóa món hoặc bàn.';
 end if;
 if p_request_id is null or p_expected_version is null or p_expected_version<1
  or (p_kind='menu' and (p_item_id is null or p_table_id is not null))
  or (p_kind='table' and (p_table_id is null or p_table_id<=0 or p_item_id is not null)) then
  raise exception 'Yêu cầu xóa không hợp lệ.';
 end if;
 v_payload:=jsonb_build_object('kind',p_kind,'item_id',p_item_id,'table_id',p_table_id,'version',p_expected_version);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_request from public.catalog_deletion_requests where request_id=p_request_id;
 if found then
  if v_request.user_id<>v_user or v_request.payload is distinct from v_payload then raise exception 'Mã yêu cầu xóa đã được sử dụng cho thông tin khác.';end if;
  return v_request.result;
 end if;
 if p_kind='menu' then
  select * into v_item from public.menu_items where id=p_item_id for update;
  if not found or v_item.deleted_at is not null then raise exception 'Món đã bị xóa hoặc không tồn tại. Tải lại thực đơn.';end if;
  if v_item.version<>p_expected_version then raise exception 'Món đã thay đổi. Tải lại thực đơn rồi xác nhận xóa lại.';end if;
  update public.menu_items set is_active=false,deleted_at=clock_timestamp(),version=version+1 where id=p_item_id;
  delete from public.menu_item_groups where item_id=p_item_id;
  v_name:=v_item.name;
 else
  -- Same management and row locks as save/reorder/submit; aliases also prevent removal.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('goc-pho-table-management',0));
  select * into v_table from public.restaurant_tables where id=p_table_id for update;
  if not found or v_table.deleted_at is not null then raise exception 'Bàn đã bị xóa hoặc không tồn tại. Tải lại danh sách.';end if;
  if v_table.management_version<>p_expected_version then raise exception 'Bàn đã thay đổi. Tải lại danh sách rồi xác nhận xóa lại.';end if;
  if exists(select 1 from public.table_sessions where table_id=p_table_id and closed_at is null)
   or exists(select 1 from public.active_table_links where table_id=p_table_id)
   or exists(select 1 from public.orders o join public.table_sessions s on s.id=o.session_id where o.status='cooking' and o.kitchen_relevant and (s.table_id=p_table_id or o.table_path @> array[p_table_id] or s.table_path @> array[p_table_id])) then
   raise exception 'Bàn đang có khách, đang gộp hoặc món bếp chưa xong. Chưa thể xóa bàn.';
  end if;
  update public.restaurant_tables set is_active=false,deleted_at=clock_timestamp(),management_version=management_version+1 where id=p_table_id;
  v_name:=v_table.name;
 end if;
 v_result:=jsonb_build_object('ok',true,'kind',p_kind,'name',v_name);
 insert into public.catalog_deletion_requests(request_id,user_id,payload,result) values(p_request_id,v_user,v_payload,v_result);
 insert into public.audit_log(type,user_id,extra) values(case when p_kind='menu' then 'menu_deleted' else 'table_deleted' end,v_user,jsonb_build_object('request_id',p_request_id,'item_id',p_item_id,'table_id',p_table_id,'name',v_name));
 return v_result;
end;
$$;
revoke all on function public.delete_catalog_entry(uuid,text,bigint,uuid,integer) from public,anon;
grant execute on function public.delete_catalog_entry(uuid,text,bigint,uuid,integer) to authenticated;
notify pgrst,'reload schema';
