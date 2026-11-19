begin;
set local lock_timeout='5s';

alter table public.order_items
 add column drink_queued_at timestamptz,
 add column drink_done_at timestamptz,
 add column drink_done_qty integer not null default 0;

create index order_items_drink_queue on public.order_items (order_id)
 where category='do_uong' and drink_queued_at is not null
 and cancelled_at is null and qty>drink_done_qty;
create index order_items_drink_history on public.order_items (order_id)
 where category='do_uong' and drink_done_at is not null;

create function public.list_drink_tickets(p_history boolean) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare tickets jsonb;
begin
 if auth.uid() is null or not public.has_permission('orders.read')
    or coalesce(public.current_staff_role(),'') not in ('phuc_vu','chu') then
  raise exception 'Bạn không có quyền xem phiếu nước.' using errcode='42501';
 end if;

 with lines as (
  select i.* from public.order_items i
  where not p_history and i.category='do_uong' and i.drink_queued_at is not null
    and i.cancelled_at is null and i.qty>i.drink_done_qty
  union all
  select i.* from public.order_items i
  where p_history and i.category='do_uong' and i.drink_done_at is not null
 ), grouped as (
  select i.order_id, min(i.drink_queued_at) as queued_at, max(i.drink_done_at) as done_at,
    jsonb_agg(jsonb_build_object(
      'id',i.id,'name',i.name,'qty',case when p_history then i.drink_done_qty else i.qty-i.drink_done_qty end,
      'target_qty',i.qty,'note',i.note,'is_takeaway',i.is_takeaway
    ) order by i.kitchen_position,i.id) as items
  from lines i group by i.order_id
 ), ordered as (
  select g.order_id as id,g.queued_at,g.done_at,g.items,o.ordered_by_name,
    coalesce(nullif(o.service_label,''),t.name,'Bàn '||s.table_id) as place
  from grouped g
  join public.orders o on o.id=g.order_id
  join public.table_sessions s on s.id=o.session_id
  left join public.restaurant_tables t on t.id=s.table_id
  order by case when p_history then g.done_at end desc, g.queued_at, g.order_id
  limit (case when p_history then 100 end)
 )
 select coalesce(jsonb_agg(to_jsonb(o) order by case when p_history then o.done_at end desc,o.queued_at,o.id),'[]'::jsonb)
 into tickets from ordered o;

 return tickets;
end;
$$;

-- Clients acknowledge the quantities displayed at swipe time. Quantity added
-- concurrently stays in the queue. Replaying the same request is a no-op.
create function public.complete_drink_ticket(p_order_id uuid,p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('orders.read')
    or coalesce(public.current_staff_role(),'') not in ('phuc_vu','chu') then
  raise exception 'Bạn không có quyền hoàn thành phiếu nước.' using errcode='42501';
 end if;
 if p_order_id is null or jsonb_typeof(p_items) is distinct from 'array' then
  raise exception 'Phiếu nước không hợp lệ.';
 end if;
 if jsonb_array_length(p_items) not between 1 and 500 then
  raise exception 'Số dòng trên phiếu nước không hợp lệ.';
 end if;

 perform 1 from public.order_items i
 join jsonb_to_recordset(p_items) as picked(id uuid,qty integer) on picked.id=i.id
 where i.order_id=p_order_id and i.category='do_uong' and i.drink_queued_at is not null
 order by i.id for update of i;

 update public.order_items i
 set drink_done_qty=least(i.qty,picked.qty),drink_done_at=statement_timestamp()
 from (select id,max(qty) as qty from jsonb_to_recordset(p_items) as line(id uuid,qty integer) group by id) picked
 where i.id=picked.id and i.order_id=p_order_id and i.category='do_uong'
   and i.drink_queued_at is not null and i.cancelled_at is null
   and least(i.qty,picked.qty)>i.drink_done_qty and picked.qty>0;
end;
$$;

revoke all on function public.list_drink_tickets(boolean),public.complete_drink_ticket(uuid,jsonb) from public,anon;
grant execute on function public.list_drink_tickets(boolean),public.complete_drink_ticket(uuid,jsonb) to authenticated;
-- Send the food and queue the drinks in the same transaction. The existing
-- send RPC validates the captured order IDs and handles retries and table locks.
create function public.notify_service_order(
 p_table_id integer,p_request_id uuid,p_items jsonb,
 p_session_id uuid default null,p_order_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql security definer set search_path='' as $$
declare notified uuid;
begin
 if auth.uid() is null or not public.has_permission('orders.create') then
  raise exception 'Bạn không có quyền thông báo đơn.' using errcode='42501';
 end if;
 if coalesce(cardinality(p_order_ids),0)=0 then
  notified:=public.submit_order(p_table_id,p_request_id,p_items);
 else
  notified:=public.send_saved_menu_selections(p_table_id,p_session_id,p_order_ids,p_request_id,p_items);
 end if;

 update public.order_items i
 set drink_queued_at=statement_timestamp()
 from public.orders o
 where i.order_id=o.id and i.category='do_uong' and i.cancelled_at is null and not i.paid
  and i.drink_queued_at is null and not o.is_draft
  and (
   (o.id=notified and o.request_id=p_request_id and o.created_by=auth.uid() and o.submitted_table_id=p_table_id)
   or (o.session_id=p_session_id and o.id=any(p_order_ids))
  );
 return notified;
end;
$$;
revoke all on function public.notify_service_order(integer,uuid,jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.notify_service_order(integer,uuid,jsonb,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
