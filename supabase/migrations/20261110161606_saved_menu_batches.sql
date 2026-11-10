begin;
set local lock_timeout='5s';
alter table public.orders add column is_draft boolean not null default false;
CREATE OR REPLACE FUNCTION public.save_menu_selection(p_table_id integer, p_request_id uuid, p_items jsonb)
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

  insert into public.orders(session_id, request_id, status, kitchen_relevant, created_by, submitted_table_id,is_draft)
    values (v_session, p_request_id, 'cooking', false, v_user, p_table_id,true)
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
        v_item.qty, v_menu.category, case when v_menu.category='do_uong' then '' else coalesce(v_item.note, '') end, v_bill_no);
    if v_menu.category <> 'do_uong' then v_kitchen := true; end if;
  end loop;

  update public.orders
    set kitchen_relevant = false,is_draft=true,
        status = case when v_kitchen then 'cooking' else 'done' end,
        done_at = case when v_kitchen then null else now() end
    where id = v_order;
  return v_order;
end;
$function$;


revoke all on function public.save_menu_selection(integer,uuid,jsonb) from public,anon;
grant execute on function public.save_menu_selection(integer,uuid,jsonb) to authenticated;

-- Send exactly the captured batches; replay never sends subsequently added batches.
create function public.send_saved_menu_selections(p_table_id integer,p_session_id uuid,p_order_ids uuid[],p_request_id uuid,p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_id uuid;v_now timestamptz;
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
 if jsonb_array_length(p_items)>0 then v_id:=public.submit_order(p_table_id,p_request_id,p_items);end if;
 for v_order in select * from public.orders where id=any(p_order_ids) order by created_at,id for update loop
  if not v_order.is_draft then continue;end if;
  perform 1 from public.order_items where order_id=v_order.id order by id for update;
  v_now:=clock_timestamp();
  update public.orders set is_draft=false,created_at=v_now,
   kitchen_relevant=exists(select 1 from public.order_items where order_id=v_order.id and category<>'do_uong' and cancelled_at is null and not paid),
   status=case when exists(select 1 from public.order_items where order_id=v_order.id and category<>'do_uong' and cancelled_at is null and not paid) then 'cooking' else 'done' end
   where id=v_order.id;
  insert into public.audit_log(type,table_no,session_id,user_id,extra) values('order_created',p_table_id,p_session_id,auth.uid(),jsonb_build_object('order_id',v_order.id));
 end loop;
 return coalesce(v_id,p_request_id);
end;$$;
revoke all on function public.send_saved_menu_selections(integer,uuid,uuid[],uuid,jsonb) from public,anon;
grant execute on function public.send_saved_menu_selections(integer,uuid,uuid[],uuid,jsonb) to authenticated;

create function public.edit_saved_menu_selection(p_item_id uuid,p_expected_qty integer,p_expected_note text,p_qty integer,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_item public.order_items%rowtype;v_table integer;v_session uuid;v_note text;
begin
 if auth.uid() is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền chỉnh món.';end if;
 if p_qty is null or p_qty not between 0 and 99 or length(coalesce(p_note,''))>500 then raise exception 'Số lượng hoặc ghi chú không hợp lệ.';end if;
 select o.session_id,s.table_id into v_session,v_table from public.order_items i join public.orders o on o.id=i.order_id join public.table_sessions s on s.id=o.session_id where i.id=p_item_id;
 if not found then raise exception 'Không tìm thấy món.';end if;
 perform 1 from public.restaurant_tables where id=v_table or id in(select table_id from public.active_table_links where session_id=v_session) order by id for update;
 perform 1 from public.table_sessions where id=v_session and closed_at is null for update;
 if not found then raise exception 'Phiên bàn đã đóng.';end if;
 select o.* into v_order from public.orders o join public.order_items i on i.order_id=o.id where i.id=p_item_id for update of o;
 select * into v_item from public.order_items where id=p_item_id for update;
 if v_order.session_id is distinct from v_session then raise exception 'Bàn vừa thay đổi. Đồng bộ và mở lại.';end if;
 if not v_order.is_draft or v_item.paid then raise exception 'Món đã gửi bếp hoặc đã thanh toán. Đồng bộ và kiểm tra lại.';end if;
 v_note:=case when v_item.category='do_uong' then '' else btrim(coalesce(p_note,'')) end;
 if (p_qty=0 and v_item.cancelled_at is not null) or (p_qty=v_item.qty and v_note=v_item.note and v_item.cancelled_at is null) then return jsonb_build_object('ok',true);end if;
 if v_item.cancelled_at is not null or v_item.qty is distinct from p_expected_qty or v_item.note is distinct from p_expected_note then raise exception 'Món đã được chỉnh trên thiết bị khác. Đồng bộ và mở lại.';end if;
 if p_qty=0 then
  update public.order_items set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason='Bỏ món chưa gửi bếp' where id=p_item_id;
 else update public.order_items set qty=p_qty,note=v_note where id=p_item_id;end if;
 if p_qty=0 and not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_session and not i.paid and i.cancelled_at is null) then update public.table_sessions set closed_at=now() where id=v_session;end if;
 insert into public.audit_log(type,table_no,session_id,user_id,extra) values('selection_edited',v_table,v_session,auth.uid(),jsonb_build_object('item_id',p_item_id,'qty',p_qty));
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.edit_saved_menu_selection(uuid,integer,text,integer,text) from public,anon;
grant execute on function public.edit_saved_menu_selection(uuid,integer,text,integer,text) to authenticated;

-- Enforce the send-before-payment rule for kitchen dishes in every client.
create function public.guard_pending_kitchen_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.paid and not old.paid and new.category<>'do_uong' and exists(select 1 from public.orders where id=new.order_id and is_draft) then raise exception 'Có món chưa gửi bếp. Bấm Gửi bếp trước khi thanh toán.';end if;
 return new;
end;$$;
revoke all on function public.guard_pending_kitchen_payment() from public,anon,authenticated;
create trigger pending_kitchen_payment before update of paid on public.order_items for each row execute function public.guard_pending_kitchen_payment();

-- Pending selections cannot be completed by kitchen RPCs before notification.
do $patch$ declare v text;begin
 select pg_get_functiondef('public.complete_kitchen_order(uuid)'::regprocedure) into v;
 if position('where id=p_order_id and status=''cooking'';' in v)=0 then raise exception 'Unexpected kitchen completion definition';end if;
 execute replace(v,'where id=p_order_id and status=''cooking'';','where id=p_order_id and status=''cooking'' and not is_draft;');
end;$patch$;

-- Keep bill fragments pending when a saved batch is split across tables.
do $patch$ declare v text;begin
 select pg_get_functiondef('public.transfer_bill_to_table(uuid,integer,integer,integer,uuid,uuid[],uuid)'::regprocedure) into v;
 if position('table_path,bill_transfer_origin)' in v)=0 then raise exception 'Unexpected bill transfer definition';end if;
 v:=replace(v,'table_path,bill_transfer_origin)','table_path,bill_transfer_origin,is_draft)');
 v:=replace(v,'v_has_food,', 'v_has_food and not v_order.is_draft,');
 v:=replace(v,'v_path,coalesce(v_order.bill_transfer_origin,v_order.id))','v_path,coalesce(v_order.bill_transfer_origin,v_order.id),v_order.is_draft)');
 execute v;
end;$patch$;

create or replace function public.log_order_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' and NEW.bill_transfer_origin is not null then return NEW;end if;
 insert into public.audit_log(type,table_no,session_id,user_id,extra)
 select case when TG_OP='INSERT' then case when NEW.is_draft then 'selection_saved' else 'order_created' end else 'kitchen_done' end,
 s.table_id,NEW.session_id,auth.uid(),jsonb_build_object('order_id',NEW.id) from public.table_sessions s where s.id=NEW.session_id;
 return NEW;
end;$$;
CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('saved_menu_selections',true,'linked_tables',true,
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


notify pgrst,'reload schema';
commit;
