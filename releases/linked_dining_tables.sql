-- Linked dining tables share one live session; each physical table stays visible.
begin;
set local lock_timeout='5s';
create table public.active_table_links(
 table_id integer primary key references public.restaurant_tables(id),
 session_id uuid not null references public.table_sessions(id) on delete cascade
);
create index active_table_links_session_idx on public.active_table_links(session_id);
alter table public.active_table_links enable row level security;
revoke all on public.active_table_links from public,anon,authenticated,service_role;
create table public.table_link_requests(
 request_id uuid primary key,user_id uuid not null references public.profiles(id),
 session_id uuid not null references public.table_sessions(id) on delete cascade,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table public.table_link_requests enable row level security;
revoke all on public.table_link_requests from public,anon,authenticated,service_role;
create index table_link_requests_session_idx on public.table_link_requests(session_id);
create index table_link_requests_user_idx on public.table_link_requests(user_id);
create function public.release_table_links() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if OLD.closed_at is null and NEW.closed_at is not null then delete from public.active_table_links where session_id=NEW.id;end if;
 return NEW;
end $$;
revoke all on function public.release_table_links() from public,anon,authenticated;
create trigger release_table_links after update of closed_at on public.table_sessions for each row execute function public.release_table_links();
create function public.guard_linked_table_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.closed_at is null and exists(select 1 from public.active_table_links where table_id=NEW.table_id and session_id<>NEW.id) then raise exception 'Bàn đang gộp. Đồng bộ và mở lại nhóm bàn.';end if;
 return NEW;
end $$;
revoke all on function public.guard_linked_table_session() from public,anon,authenticated;
create trigger guard_linked_table_session before insert or update of table_id on public.table_sessions for each row execute function public.guard_linked_table_session();
create function public.guard_linked_table_management() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not NEW.is_active and exists(select 1 from public.active_table_links where table_id=NEW.id) then raise exception 'Bàn đang gộp và còn sử dụng. Thanh toán hoặc hủy đơn trước khi ngừng bàn.';end if;
 return NEW;
end $$;
revoke all on function public.guard_linked_table_management() from public,anon,authenticated;
create trigger guard_linked_table_management before update of is_active on public.restaurant_tables for each row execute function public.guard_linked_table_management();
create function public.get_active_table_links() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('orders.read') then raise exception 'Bạn không có quyền đọc nhóm bàn.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('table_id',l.table_id,'session_id',l.session_id) order by l.table_id) from public.active_table_links l join public.table_sessions s on s.id=l.session_id where s.closed_at is null),'[]'::jsonb);
end $$;
revoke all on function public.get_active_table_links() from public,anon;
grant execute on function public.get_active_table_links() to authenticated;
create function public.link_dining_tables(p_request_id uuid,p_table_id integer,p_other_table_id integer,p_expected_session uuid,p_expected_other_session uuid default null,p_mode text default 'same_bill') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_session uuid;v_other uuid;v_anchor integer;v_other_anchor integer;
 v_before integer[];v_after integer[];v_ids integer[];v_payload jsonb;v_result jsonb;v_previous public.table_link_requests%rowtype;
 v_bill integer;v_offset integer;v_count integer;
begin
 if v_user is null or not public.has_permission('tables.transfer') or not public.has_permission('bills.split') then raise exception 'Bạn không có quyền gộp bàn.';end if;
 if p_request_id is null or p_table_id is null or p_other_table_id is null or p_table_id=p_other_table_id or p_expected_session is null or p_mode is null or p_mode not in('same_bill','separate_bills') then raise exception 'Thông tin gộp bàn không hợp lệ.';end if;
 v_payload:=jsonb_build_object('table',p_table_id,'other',p_other_table_id,'session',p_expected_session,'other_session',p_expected_other_session,'mode',p_mode);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,92));
 select * into v_previous from public.table_link_requests where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.payload<>v_payload then raise exception 'Mã gộp bàn đã được sử dụng cho yêu cầu khác.';end if;
  return v_previous.result;
 end if;
 select s.id,s.table_id into v_session,v_anchor from public.table_sessions s where s.closed_at is null and(s.table_id=p_table_id or exists(select 1 from public.active_table_links l where l.table_id=p_table_id and l.session_id=s.id));
 select s.id,s.table_id into v_other,v_other_anchor from public.table_sessions s where s.closed_at is null and(s.table_id=p_other_table_id or exists(select 1 from public.active_table_links l where l.table_id=p_other_table_id and l.session_id=s.id));
 if v_session is distinct from p_expected_session or v_other is distinct from p_expected_other_session or v_session=v_other then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 select array_agg(x order by x) into v_before from(select distinct x from unnest(array[p_table_id,p_other_table_id,v_anchor,v_other_anchor]||(select coalesce(array_agg(table_id),'{}'::integer[]) from public.active_table_links where session_id in(v_session,v_other))) x where x is not null) z;
 if cardinality(v_before)>50 then raise exception 'Chỉ gộp tối đa 50 bàn trong một nhóm.';end if;
 perform 1 from public.restaurant_tables where id=any(v_before) order by id for update;
 if (select count(*) from public.restaurant_tables where id=any(v_before) and is_active and service_type='dine_in')<>cardinality(v_before) then raise exception 'Chỉ gộp các bàn ăn tại chỗ đang hoạt động.';end if;
 perform 1 from public.table_sessions where id in(v_session,v_other) order by id for update;
 if not exists(select 1 from public.table_sessions where id=v_session and table_id=v_anchor and closed_at is null) or(v_other is not null and not exists(select 1 from public.table_sessions where id=v_other and table_id=v_other_anchor and closed_at is null)) then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 -- A concurrent merge/close must not silently change the selected physical tables.
 select array_agg(x order by x) into v_after from(select distinct x from unnest(array[p_table_id,p_other_table_id,v_anchor,v_other_anchor]||(select coalesce(array_agg(table_id),'{}'::integer[]) from public.active_table_links where session_id in(v_session,v_other))) x where x is not null) z;
 if v_before<>v_after or exists(select 1 from public.active_table_links where table_id=any(v_before) and session_id not in(v_session,coalesce(v_other,v_session))) or exists(select 1 from public.table_sessions where table_id=any(v_before) and closed_at is null and id not in(v_session,coalesce(v_other,v_session))) then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 perform 1 from public.orders where session_id in(v_session,v_other) order by id for update;
 perform 1 from public.order_items i join public.orders o on o.id=i.order_id where o.session_id in(v_session,v_other) order by i.id for update of i;
 if p_mode='same_bill' and v_other is not null then
  v_bill:=1;
  update public.order_items i set bill_no=v_bill from public.orders o where i.order_id=o.id and o.session_id in(v_session,v_other) and not i.paid and i.cancelled_at is null;
 elsif p_mode='separate_bills' and v_other is not null then
  select coalesce(max(i.bill_no),0) into v_offset from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_session;
  select count(distinct i.bill_no) into v_count from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_other and not i.paid and i.cancelled_at is null;
  if v_offset+v_count>9999 then raise exception 'Nhóm bàn không thể nhận thêm bill.';end if;
  with mapping as(select bill_no,v_offset+row_number() over(order by bill_no) as target from(select distinct i.bill_no from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_other and not i.paid and i.cancelled_at is null) z)
  update public.order_items i set bill_no=m.target from mapping m,public.orders o where i.order_id=o.id and o.session_id=v_other and i.bill_no=m.bill_no and not i.paid and i.cancelled_at is null;
 end if;
 if v_other is not null then
  update public.orders set session_id=v_session where session_id=v_other;
  update public.table_sessions set closed_at=now() where id=v_other;
 end if;
 insert into public.active_table_links(table_id,session_id) select unnest(v_before),v_session on conflict(table_id) do update set session_id=excluded.session_id;
 update public.orders set service_label=(select string_agg(name,' + ' order by id) from public.restaurant_tables where id=any(v_before)) where session_id=v_session;
 v_result:=jsonb_build_object('ok',true,'session_id',v_session,'table_id',v_anchor,'table_ids',to_jsonb(v_before),'mode',p_mode);
 insert into public.table_link_requests(request_id,user_id,session_id,payload,result) values(p_request_id,v_user,v_session,v_payload,v_result);
 insert into public.audit_log(type,table_no,session_id,user_id,extra) values('table_linked',v_anchor,v_session,v_user,jsonb_build_object('request_id',p_request_id,'table_ids',to_jsonb(v_before),'mode',p_mode,'place_label',(select string_agg(name,' + ' order by id) from public.restaurant_tables where id=any(v_before))));
 return v_result;
end $$;
revoke all on function public.link_dining_tables(uuid,integer,integer,uuid,uuid,text) from public,anon;
grant execute on function public.link_dining_tables(uuid,integer,integer,uuid,uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.submit_order(p_table_id integer, p_request_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_session uuid;
  v_order uuid;
  v_bill_no integer;
  v_existing public.orders%rowtype;
  v_item record;
  v_menu public.menu_items%rowtype;
  v_kitchen boolean := false;
begin
  if v_user is null or not public.has_permission('orders.create') then
    raise exception 'Bạn không có quyền gửi đơn.';
  end if;
  if p_request_id is null then
    raise exception 'Thiếu mã yêu cầu.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Danh sách món không hợp lệ.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Đơn phải có từ 1 đến 100 dòng món.';
  end if;

  -- Cùng mã yêu cầu chỉ tạo một đơn, kể cả hai thiết bị gửi đồng thời.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  select * into v_existing from public.orders where request_id = p_request_id;
  if found then
    if v_existing.created_by <> v_user then
      raise exception 'Mã yêu cầu đã được sử dụng.';
    end if;
    if v_existing.submitted_table_id <> p_table_id then
      raise exception 'Mã yêu cầu không thuộc bàn này.';
    end if;
    return v_existing.id;
  end if;

  -- Khóa bàn để các đơn cùng bàn dùng chung phiên khách.
  perform 1 from public.restaurant_tables t
  where t.id=p_table_id or t.id in(select l.table_id from public.active_table_links l where l.session_id=(select session_id from public.active_table_links where table_id=p_table_id))
  order by t.id for update;
  if not exists(select 1 from public.restaurant_tables where id=p_table_id and is_active) then raise exception 'Bàn không hoạt động.';end if;

  select id into v_session from public.table_sessions
    where closed_at is null and(table_id=p_table_id or id=(select session_id from public.active_table_links where table_id=p_table_id));
  if jsonb_array_length(p_items)>0 and (p_items->0) ? 'expected_session_id' and (p_items->0->>'expected_session_id') is distinct from v_session::text then raise exception 'Phiên bàn đã thay đổi. Đồng bộ và kiểm tra bàn trước khi gọi món.';end if;
  if v_session is null then
    insert into public.table_sessions(table_id)
      values (p_table_id) returning id into v_session;
  end if;

  -- Gọi thêm vào bill chưa trả có số nhỏ nhất; không đưa vào bill đã trả.
  select coalesce(min(i.bill_no),1) into v_bill_no from public.order_items i join public.orders o on o.id=i.order_id
    where o.session_id=v_session and not i.paid and i.cancelled_at is null;

  insert into public.orders(session_id, request_id, status, kitchen_relevant, created_by, submitted_table_id)
    values (v_session, p_request_id, 'cooking', true, v_user, p_table_id)
    returning id into v_order;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(menu_item_id uuid, qty integer, note text, expected_price integer)
  loop
    if v_item.qty is null or v_item.qty not between 1 and 99 then
      raise exception 'Số lượng phải từ 1 đến 99.';
    end if;
    if char_length(coalesce(v_item.note, '')) > 500 then
      raise exception 'Ghi chú tối đa 500 ký tự.';
    end if;
    select * into v_menu from public.menu_items
      where id = v_item.menu_item_id and is_active = true and is_out = false
      for share;
    if not found then raise exception 'Món đã ngừng bán hoặc hết món.'; end if;
    if v_item.expected_price is not null and v_item.expected_price<>v_menu.price then
      raise exception 'Giá món đã thay đổi. Kiểm tra thực đơn trước khi gửi lại.';
    end if;

    insert into public.order_items(order_id, menu_item_id, name, price, qty, category, note, bill_no)
      values (v_order, v_menu.id, v_menu.name, v_menu.price,
        v_item.qty, v_menu.category, coalesce(v_item.note, ''), v_bill_no);
    if v_menu.category <> 'do_uong' then v_kitchen := true; end if;
  end loop;

  update public.orders
    set kitchen_relevant = v_kitchen,
        status = case when v_kitchen then 'cooking' else 'done' end,
        done_at = case when v_kitchen then null else now() end
    where id = v_order;
  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_non_kitchen_order(p_table_id integer, p_request_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null
     or not public.has_permission('orders.create') then
    raise exception 'Bạn không có quyền tạo đơn.';
  end if;

  if p_request_id is null
     or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Dữ liệu đơn không hợp lệ.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  -- Gửi lại cùng mã yêu cầu không tạo đơn trùng.
  if exists (
    select 1
    from public.orders
    where request_id = p_request_id
  ) then
    return public.submit_order(
      p_table_id, p_request_id, p_items
    );
  end if;

  perform 1 from public.restaurant_tables t
  where t.id=p_table_id or t.id in(select l.table_id from public.active_table_links l where l.session_id=(select session_id from public.active_table_links where table_id=p_table_id))
  order by t.id for update;

  perform 1
  from public.menu_items m
  where id in (
    select (i->>'menu_item_id')::uuid
    from jsonb_array_elements(p_items) i
  )
  order by id
  for share;

  -- Chỉ cho thanh toán trực tiếp khi tất cả món mới
  -- đều thuộc nhóm không gửi bếp.
  if exists (
    select 1
    from public.menu_items m
    where id in (
      select (i->>'menu_item_id')::uuid
      from jsonb_array_elements(p_items) i
    )
    and category <> 'do_uong'
  ) then
    raise exception
      'Đơn có món cần gửi bếp. Kiểm tra và bấm Gửi bếp.';
  end if;

  return public.submit_order(
    p_table_id, p_request_id, p_items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('linked_tables',true,
    'data_epoch',(select data_epoch from public.pos_runtime_settings where id),'name', p.name, 'role', p.role, 'is_active', p.is_active and (select public.staff_session_current()),
    'session_invalid',not (select public.staff_session_current()),
    'must_change_password', p.must_change_password,
    'permissions', (
      select coalesce(jsonb_agg(permission), '[]'::jsonb)
      from unnest(array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount', 'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload',
        'tables.transfer', 'tables.cancel', 'bills.split', 'menu.manage', 'tables.manage',
        'reports.read', 'audit.read', 'employees.manage', 'settings.manage',
        'receipts.read_own', 'receipts.read_all'
      ]::text[]) as permission
      where public.has_permission(permission)
    )
  )
  from public.profiles p where p.id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.transfer_dine_in_internal(p_session_id uuid, p_from_table integer, p_to_table integer, p_request_id uuid, p_reason text DEFAULT ''::text, p_expected_target_session uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_existing public.table_transfers%rowtype; v_session public.table_sessions%rowtype; v_target uuid; v_offset integer; v_count integer;
begin
 if v_user is null or not public.has_permission('tables.transfer') then
  raise exception 'Bạn không có quyền chuyển bàn.';
 end if;
 if p_request_id is null then raise exception 'Thiếu mã chuyển bàn.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from public.table_transfers where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.session_id is distinct from p_session_id
   or v_existing.from_table is distinct from p_from_table or v_existing.to_table is distinct from p_to_table
   or v_existing.reason is distinct from btrim(coalesce(p_reason,''))
   or v_existing.target_session_id is distinct from p_expected_target_session then
   raise exception 'Mã chuyển bàn đã được sử dụng.';
  end if;
  return coalesce(v_existing.target_session_id,v_existing.session_id);
 end if;
 if p_session_id is null or p_from_table is null or p_to_table is null or p_from_table=p_to_table then
  raise exception 'Bàn chuyển không hợp lệ.';
 end if;
 if length(btrim(coalesce(p_reason,'')))>500 then
  raise exception 'Lý do chuyển tối đa 500 ký tự.';
 end if;
 -- Khóa cả hai bàn theo id tăng dần, trước phiên khách như gửi đơn/thanh toán.
 perform 1 from public.restaurant_tables where id in (p_from_table,p_to_table) order by id for update;
 if exists(select 1 from public.active_table_links where table_id in(p_from_table,p_to_table)) then raise exception 'Bàn đang gộp. Dùng Gộp bàn để bổ sung bàn vào nhóm.';end if;
 if not exists(select 1 from public.restaurant_tables where id=p_to_table and is_active) then
  raise exception 'Bàn đích không hoạt động.';
 end if;
 -- Hai bàn đã khóa: mọi RPC gửi/thanh toán/chuyển đều đi qua khóa bàn.
 perform 1 from public.table_sessions where id=p_session_id or (table_id=p_to_table and closed_at is null) order by id for update;
 select * into v_session from public.table_sessions where id=p_session_id;
 if not found or v_session.closed_at is not null then raise exception 'Phiên bàn đã đóng hoặc không tồn tại.'; end if;
 if v_session.table_id<>p_from_table then raise exception 'Phiên khách đã chuyển sang bàn khác. Đồng bộ và kiểm tra lại.'; end if;
 select id into v_target from public.table_sessions where table_id=p_to_table and closed_at is null;
 if v_target is distinct from p_expected_target_session then
  raise exception 'Bàn đích đã thay đổi. Đồng bộ và chọn lại bàn đích.';
 end if;
 -- Giữ đường đi riêng của từng đơn, kể cả sau khi hai phiên hợp nhất.
 perform 1 from public.orders where session_id in (p_session_id,v_target) order by id for update;
 update public.orders o set table_path=array_append(case when cardinality(o.table_path)>0 then o.table_path
   when cardinality(v_session.table_path)>0 then v_session.table_path else array[p_from_table] end,p_to_table)
  where o.session_id=p_session_id;
 if v_target is null then
  update public.table_sessions set table_id=p_to_table,
   table_path=case when cardinality(table_path)=0 then array[p_from_table,p_to_table] else array_append(table_path,p_to_table) end
   where id=p_session_id;
 else
  perform 1 from public.order_items i join public.orders o on o.id=i.order_id
   where o.session_id in (p_session_id,v_target) order by i.id for update of i;
  -- Mỗi bill chưa trả của bàn nguồn nhận một số mới ở bàn đích.
  select coalesce(max(i.bill_no),0) into v_offset from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_target;
  select count(distinct i.bill_no) into v_count from public.order_items i join public.orders o on o.id=i.order_id
   where o.session_id=p_session_id and not i.paid and i.cancelled_at is null;
  if v_offset+v_count>9999 then raise exception 'Bàn đích không thể nhận thêm bill. Chọn bàn khác.'; end if;
  with mapping as (
   select bill_no,v_offset+row_number() over(order by bill_no) as target from (
    select distinct i.bill_no from public.order_items i join public.orders o on o.id=i.order_id
     where o.session_id=p_session_id and not i.paid and i.cancelled_at is null) bills
  )
  update public.order_items i set bill_no=m.target from mapping m,public.orders o
   where i.order_id=o.id and o.session_id=p_session_id and i.bill_no=m.bill_no and not i.paid and i.cancelled_at is null;
  update public.table_sessions set closed_at=now(),table_path=array_append(case when cardinality(table_path)>0 then table_path else array[p_from_table] end,p_to_table) where id=p_session_id;
  update public.orders set session_id=v_target where session_id=p_session_id;
 end if;
 insert into public.table_transfers(request_id,session_id,from_table,to_table,user_id,reason,target_session_id)
 values(p_request_id,p_session_id,p_from_table,p_to_table,v_user,btrim(coalesce(p_reason,'')),v_target);
 insert into public.audit_log(type,table_no,session_id,user_id,extra)
 values('table_transfer',p_to_table,p_session_id,v_user,jsonb_build_object('from_table',p_from_table,'to_table',p_to_table,'reason',btrim(coalesce(p_reason,'')),'request_id',p_request_id,'target_session_id',v_target,'merged',v_target is not null));
 return coalesce(v_target,p_session_id);
end;
$function$;
create function public.unlink_dining_table(p_request_id uuid,p_table_id integer,p_remove_table_id integer,p_expected_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_ids integer[];v_after integer[];v_anchor integer;v_payload jsonb;v_result jsonb;v_previous public.table_link_requests%rowtype;
begin
 if v_user is null or not public.has_permission('tables.transfer') then raise exception 'Bạn không có quyền hủy gộp bàn.';end if;
 if p_request_id is null or p_expected_session is null or p_table_id is null or p_remove_table_id is null or p_table_id=p_remove_table_id then raise exception 'Thông tin hủy gộp không hợp lệ.';end if;
 v_payload:=jsonb_build_object('table',p_table_id,'remove',p_remove_table_id,'session',p_expected_session,'action','unlink');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,92));
 select * into v_previous from public.table_link_requests where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.payload<>v_payload then raise exception 'Mã gộp bàn đã được sử dụng cho yêu cầu khác.';end if;
  return v_previous.result;
 end if;
 select array_agg(table_id order by table_id) into v_ids from public.active_table_links where session_id=p_expected_session;
 if v_ids is null or not(p_table_id=any(v_ids)) or not(p_remove_table_id=any(v_ids)) then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 perform 1 from public.restaurant_tables where id=any(v_ids) order by id for update;
 perform 1 from public.table_sessions where id=p_expected_session and closed_at is null for update;
 if not found then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 select array_agg(table_id order by table_id) into v_after from public.active_table_links where session_id=p_expected_session;
 if v_ids is distinct from v_after then raise exception 'Nhóm bàn đã thay đổi. Đồng bộ và chọn lại bàn cần gộp.';end if;
 select table_id into v_anchor from public.table_sessions where id=p_expected_session;
 if v_anchor=p_remove_table_id then update public.table_sessions set table_id=p_table_id where id=p_expected_session;v_anchor:=p_table_id;end if;
 delete from public.active_table_links where table_id=p_remove_table_id and session_id=p_expected_session;
 v_after:=array_remove(v_ids,p_remove_table_id);
 if cardinality(v_after)=1 then delete from public.active_table_links where session_id=p_expected_session;end if;
 perform 1 from public.orders where session_id=p_expected_session order by id for update;
 update public.orders set service_label=(select string_agg(name,' + ' order by id) from public.restaurant_tables where id=any(v_after)) where session_id=p_expected_session;
 v_result:=jsonb_build_object('ok',true,'session_id',p_expected_session,'table_id',v_anchor,'table_ids',to_jsonb(v_after),'removed_table_id',p_remove_table_id);
 insert into public.table_link_requests(request_id,user_id,session_id,payload,result) values(p_request_id,v_user,p_expected_session,v_payload,v_result);
 insert into public.audit_log(type,table_no,session_id,user_id,extra) values('table_unlinked',v_anchor,p_expected_session,v_user,jsonb_build_object('request_id',p_request_id,'removed_table_id',p_remove_table_id,'table_ids',to_jsonb(v_after),'place_label',(select string_agg(name,' + ' order by id) from public.restaurant_tables where id=any(v_after))));
 return v_result;
end $$;
revoke all on function public.unlink_dining_table(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.unlink_dining_table(uuid,integer,integer,uuid) to authenticated;

-- Read the session and its physical-table links from one database snapshot.
-- Invoker security preserves the existing staff RLS on sessions/orders/items.
create function public.get_linked_table_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'table_id',s.table_id,'table_path',s.table_path,
   'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at,o.id) from public.orders o where o.session_id=s.id),'[]'::jsonb)) order by s.id) from public.table_sessions s where s.closed_at is null),'[]'::jsonb),
  'links',public.get_active_table_links()
 );
$$;
revoke all on function public.get_linked_table_snapshot() from public,anon;
grant execute on function public.get_linked_table_snapshot() to authenticated;

notify pgrst,'reload schema';
commit;

