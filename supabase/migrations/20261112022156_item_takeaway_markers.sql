set local lock_timeout='3s';
set local statement_timeout='20s';
alter table public.order_items add column is_takeaway boolean,add column takeaway_version integer not null default 0;
alter table public.bill_items add column is_takeaway boolean;

-- New lines default from the table, but the line keeps its own marker when moved.
-- Snapshot the marker at payment without changing existing payment RPCs.
create function pos_sync.default_item_takeaway() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='bill_items' then
  if NEW.source_item_id is not null then
   select i.is_takeaway into NEW.is_takeaway from public.order_items i where i.id=NEW.source_item_id;
  end if;
 elsif NEW.is_takeaway is null then
  select coalesce(t.service_type='takeaway' or t.name ~* '^mang[[:space:]]+v[eề]([^[:alpha:]]|$)',false)
   into NEW.is_takeaway from public.orders o join public.table_sessions s on s.id=o.session_id join public.restaurant_tables t on t.id=s.table_id where o.id=NEW.order_id;
  NEW.is_takeaway:=coalesce(NEW.is_takeaway,false);
 end if;
 return NEW;
end;
$$;
revoke all on function pos_sync.default_item_takeaway() from public,anon,authenticated;
create trigger default_item_takeaway before insert on public.order_items for each row execute function pos_sync.default_item_takeaway();
create trigger snapshot_item_takeaway before insert on public.bill_items for each row execute function pos_sync.default_item_takeaway();
-- Initialize only unpaid active lines. Paid receipt snapshots remain untouched;
-- their NULL marker keeps the existing report fallback by historical table label.
update public.order_items i set is_takeaway=coalesce(t.service_type='takeaway' or t.name ~* '^mang[[:space:]]+v[eề]([^[:alpha:]]|$)',false)
from public.orders o join public.table_sessions s on s.id=o.session_id join public.restaurant_tables t on t.id=s.table_id
where i.order_id=o.id and not i.paid and i.cancelled_at is null;

create table pos_sync.takeaway_edits(
 request_id uuid primary key,user_id uuid not null,item_id uuid not null references public.order_items(id) on delete cascade,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table pos_sync.takeaway_edits enable row level security;
revoke all on pos_sync.takeaway_edits from public,anon,authenticated;
create function pos_sync.set_item_takeaway(p_request_id uuid,p_item_id uuid,p_expected_version integer,p_expected_takeaway boolean,p_takeaway boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_payload jsonb;v_result jsonb;v_existing pos_sync.takeaway_edits%rowtype;
 v_item public.order_items%rowtype;v_session uuid;v_table integer;v_current uuid;
begin
 if v_user is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền đổi cách phục vụ món.';end if;
 if p_request_id is null or p_item_id is null or p_expected_version is null or p_expected_version<0 or p_takeaway is null then raise exception 'Thông tin mang về không hợp lệ.';end if;
 v_payload:=jsonb_build_object('item',p_item_id,'version',p_expected_version,'expected',p_expected_takeaway,'takeaway',p_takeaway);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,137));
 select * into v_existing from pos_sync.takeaway_edits where request_id=p_request_id;
 if found then
  if v_existing.user_id<>v_user or v_existing.payload<>v_payload then raise exception 'Mã chỉnh sửa đã được sử dụng.';end if;
  return v_existing.result;
 end if;
 select o.session_id,s.table_id into v_session,v_table from public.order_items i join public.orders o on o.id=i.order_id join public.table_sessions s on s.id=o.session_id where i.id=p_item_id;
 if not found then raise exception 'Không tìm thấy dòng món.';end if;
 perform 1 from public.restaurant_tables where id=v_table for update;
 perform 1 from public.table_sessions where id=v_session and table_id=v_table and closed_at is null for update;
 if not found then raise exception 'Phiên bàn đã thay đổi hoặc đã thanh toán.';end if;
 select * into v_item from public.order_items where id=p_item_id for update;
 select session_id into v_current from public.orders where id=v_item.order_id;
 if v_current is distinct from v_session or v_item.paid or v_item.cancelled_at is not null then raise exception 'Chỉ đổi cách phục vụ món chưa thanh toán, chưa hủy.';end if;
 if v_item.takeaway_version<>p_expected_version or v_item.is_takeaway is distinct from p_expected_takeaway then raise exception 'Món đã được thiết bị khác chỉnh sửa. Đồng bộ và thử lại.';end if;
 if v_item.is_takeaway is distinct from p_takeaway then
  update public.order_items set is_takeaway=p_takeaway,takeaway_version=takeaway_version+1 where id=p_item_id returning * into v_item;
  insert into public.audit_log(type,table_no,session_id,user_id,extra) values('order_takeaway_edited',v_table,v_session,v_user,
   jsonb_build_object('item_id',p_item_id,'name',v_item.name,'qty',v_item.qty,'is_takeaway',p_takeaway));
 end if;
 v_result:=jsonb_build_object('ok',true,'item_id',p_item_id,'is_takeaway',v_item.is_takeaway,'version',v_item.takeaway_version);
 insert into pos_sync.takeaway_edits(request_id,user_id,item_id,payload,result) values(p_request_id,v_user,p_item_id,v_payload,v_result);
 return v_result;
end;
$$;
revoke all on function pos_sync.set_item_takeaway(uuid,uuid,integer,boolean,boolean) from public,anon;
grant usage on schema pos_sync to authenticated;
grant execute on function pos_sync.set_item_takeaway(uuid,uuid,integer,boolean,boolean) to authenticated;
create function public.set_order_item_takeaway(p_request_id uuid,p_item_id uuid,p_expected_version integer,p_expected_takeaway boolean,p_takeaway boolean) returns jsonb
language sql security invoker set search_path='' as $$
 select pos_sync.set_item_takeaway(p_request_id,p_item_id,p_expected_version,p_expected_takeaway,p_takeaway);
$$;
revoke all on function public.set_order_item_takeaway(uuid,uuid,integer,boolean,boolean) from public,anon;
grant execute on function public.set_order_item_takeaway(uuid,uuid,integer,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
