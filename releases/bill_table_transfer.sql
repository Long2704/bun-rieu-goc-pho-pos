begin;

alter table public.orders add column if not exists bill_transfer_origin uuid;
create table if not exists public.bill_table_transfers (
 request_id uuid primary key,
 user_id uuid not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.bill_table_transfers enable row level security;
revoke all on public.bill_table_transfers from public,anon,authenticated;

-- A split of an existing kitchen ticket is not a new food order.
create or replace function public.log_order_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' and NEW.bill_transfer_origin is not null then return NEW;end if;
 insert into public.audit_log(type,table_no,session_id,user_id,extra)
 select case when TG_OP='INSERT' then 'order_created' else 'kitchen_done' end,
 s.table_id,NEW.session_id,auth.uid(),jsonb_build_object('order_id',NEW.id)
 from public.table_sessions s where s.id=NEW.session_id;
 return NEW;
end;
$$;
revoke all on function public.log_order_event() from public,anon,authenticated;

create or replace function public.transfer_bill_to_table(
 p_session_id uuid,p_from_table integer,p_bill_no integer,p_to_table integer,
 p_request_id uuid,p_expected_item_ids uuid[],p_expected_target_session uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_previous public.bill_table_transfers%rowtype;
 v_ids uuid[];v_current_ids uuid[];v_payload jsonb;v_result jsonb;
 v_target uuid;v_target_bill integer;v_order public.orders%rowtype;
 v_new_order uuid;v_path integer[];v_has_food boolean;v_count integer;
begin
 if v_user is null or not public.has_permission('tables.transfer') or not public.has_permission('bills.split') then
  raise exception 'Bạn không có quyền chuyển bill sang bàn khác.';
 end if;
 if p_request_id is null or p_session_id is null or p_from_table is null or p_to_table is null
  or p_from_table=p_to_table or p_bill_no is null or p_bill_no not between 1 and 9999
  or p_expected_item_ids is null or cardinality(p_expected_item_ids) not between 1 and 500 then
  raise exception 'Thông tin chuyển bill không hợp lệ.';
 end if;
 select array_agg(x order by x),count(distinct x) into v_ids,v_count from unnest(p_expected_item_ids) x;
 if v_count<>cardinality(p_expected_item_ids) then raise exception 'Danh sách món bị trùng hoặc không hợp lệ.';end if;
 v_payload:=jsonb_build_object('session_id',p_session_id,'from',p_from_table,'bill',p_bill_no,
  'to',p_to_table,'items',to_jsonb(v_ids),'target_session',p_expected_target_session);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_previous from public.bill_table_transfers where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.payload is distinct from v_payload then raise exception 'Mã chuyển bill đã được sử dụng.';end if;
  if not exists(select 1 from public.table_sessions where id=(v_previous.result->>'session_id')::uuid) then raise exception 'Mã chuyển bill đã hết thời gian lưu. Đồng bộ và kiểm tra lại.';end if;
  return v_previous.result;
 end if;
 perform 1 from public.restaurant_tables where id in(p_from_table,p_to_table) order by id for update;
 if (select count(*) from public.restaurant_tables where id in(p_from_table,p_to_table) and is_active and service_type='dine_in')<>2 then
  raise exception 'Chỉ chuyển giữa hai bàn ăn tại chỗ đang hoạt động.';
 end if;
 perform 1 from public.table_sessions where id=p_session_id or(table_id=p_to_table and closed_at is null) order by id for update;
 if not exists(select 1 from public.table_sessions where id=p_session_id and table_id=p_from_table and closed_at is null) then
  raise exception 'Bàn nguồn đã thay đổi. Đồng bộ và chọn lại bill.';
 end if;
 select id into v_target from public.table_sessions where table_id=p_to_table and closed_at is null;
 if v_target is distinct from p_expected_target_session then raise exception 'Bàn đích đã thay đổi. Đồng bộ và chọn lại bàn đích.';end if;
 perform 1 from public.orders where session_id=p_session_id or session_id=v_target order by id for update;
 perform 1 from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=p_session_id or o.session_id=v_target order by i.id for update of i;
 select array_agg(i.id order by i.id) into v_current_ids from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=p_session_id and i.bill_no=p_bill_no and not i.paid and i.cancelled_at is null;
 if v_current_ids is null or v_current_ids is distinct from v_ids then raise exception 'Món hoặc bill đã thay đổi. Đồng bộ và chọn lại.';end if;
 if v_target is null then
  insert into public.table_sessions(table_id,table_path) values(p_to_table,array[p_to_table]) returning id into v_target;
 end if;
 select coalesce(max(i.bill_no),0)+1 into v_target_bill from public.order_items i join public.orders o on o.id=i.order_id where o.session_id=v_target;
 if v_target_bill>9999 then raise exception 'Bàn đích không thể nhận thêm bill. Chọn bàn khác.';end if;
 for v_order in select * from public.orders o where session_id=p_session_id
  and exists(select 1 from public.order_items i where i.order_id=o.id and i.id=any(v_ids)) order by o.id loop
  v_path:=array_append(case when cardinality(v_order.table_path)>0 then v_order.table_path else array[p_from_table] end,p_to_table);
  if not exists(select 1 from public.order_items where order_id=v_order.id and not(id=any(v_ids))) then
   update public.orders set session_id=v_target,table_path=v_path,service_label='',
    bill_transfer_origin=coalesce(bill_transfer_origin,id) where id=v_order.id;
   update public.order_items set bill_no=v_target_bill where order_id=v_order.id;
  else
   select exists(select 1 from public.order_items where order_id=v_order.id and id=any(v_ids) and category<>'do_uong') into v_has_food;
   insert into public.orders(session_id,request_id,status,kitchen_relevant,created_by,created_at,done_at,submitted_table_id,table_path,bill_transfer_origin)
   values(v_target,gen_random_uuid(),case when v_has_food then v_order.status else 'done' end,v_has_food,
    v_order.created_by,v_order.created_at,case when v_has_food then v_order.done_at else coalesce(v_order.done_at,now()) end,
    v_order.submitted_table_id,v_path,coalesce(v_order.bill_transfer_origin,v_order.id)) returning id into v_new_order;
   update public.order_items set order_id=v_new_order,bill_no=v_target_bill where order_id=v_order.id and id=any(v_ids);
   if not exists(select 1 from public.order_items where order_id=v_order.id and category<>'do_uong' and cancelled_at is null) then
    update public.orders set status='done',kitchen_relevant=false,done_at=coalesce(done_at,now()) where id=v_order.id;
   end if;
  end if;
 end loop;
 if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=p_session_id and not i.paid and i.cancelled_at is null) then
  update public.table_sessions set closed_at=now() where id=p_session_id;
 end if;
 v_result:=jsonb_build_object('table_id',p_to_table,'session_id',v_target,'bill_no',v_target_bill,'moved_count',cardinality(v_ids));
 insert into public.bill_table_transfers(request_id,user_id,payload,result) values(p_request_id,v_user,v_payload,v_result);
 insert into public.audit_log(type,table_no,session_id,user_id,extra) values('bill_transfer',p_from_table,p_session_id,v_user,
  jsonb_build_object('from_table',p_from_table,'to_table',p_to_table,'from_bill',p_bill_no,'to_bill',v_target_bill,
   'target_session_id',v_target,'item_ids',to_jsonb(v_ids),'request_id',p_request_id));
 return v_result;
end;
$$;
revoke all on function public.transfer_bill_to_table(uuid,integer,integer,integer,uuid,uuid[],uuid) from public,anon;
grant execute on function public.transfer_bill_to_table(uuid,integer,integer,integer,uuid,uuid[],uuid) to authenticated;
notify pgrst,'reload schema';
commit;
