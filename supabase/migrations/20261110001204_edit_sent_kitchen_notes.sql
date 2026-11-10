-- Edit one sent, unpaid kitchen item while its order is cooking.
-- Does not modify existing note text, financial snapshots, quantities or queue order.
begin;
set local lock_timeout='5s';
alter table public.order_items add column if not exists note_version integer not null default 0;
alter table public.order_items add column if not exists note_edited_at timestamptz;
alter table public.order_items add constraint order_items_note_version_valid check(note_version>=0);
create table public.order_note_changes(
 request_id uuid primary key,
 user_id uuid not null references public.profiles(id),
 item_id uuid not null references public.order_items(id) on delete cascade,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index order_note_changes_item_idx on public.order_note_changes(item_id);
alter table public.order_note_changes enable row level security;
revoke all on public.order_note_changes from public,anon,authenticated,service_role;
create function public.edit_sent_order_note(
 p_request_id uuid,p_item_id uuid,p_order_id uuid,p_expected_version integer,p_expected_note text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_session uuid;v_table integer;v_order uuid;
 v_item public.order_items%rowtype;v_previous public.order_note_changes%rowtype;
 v_note text:=btrim(p_note);v_payload jsonb;v_result jsonb;
begin
 if v_user is null or not public.has_permission('orders.create') then raise exception 'Bạn không có quyền sửa ghi chú món.';end if;
 if p_request_id is null or p_item_id is null or p_order_id is null or p_expected_version is null or p_expected_version<0 or p_expected_note is null or p_note is null or char_length(v_note)>500 then raise exception 'Ghi chú tối đa 500 ký tự và thông tin món phải hợp lệ.';end if;
 perform 1 from public.profiles where id=v_user and is_active and not must_change_password for share;
 if not found then raise exception 'Tài khoản không còn quyền sửa ghi chú.';end if;
 v_payload:=jsonb_build_object('item_id',p_item_id,'order_id',p_order_id,'expected_version',p_expected_version,'expected_note',p_expected_note,'note',v_note);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,71));
 select * into v_previous from public.order_note_changes where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.payload<>v_payload then raise exception 'Mã sửa ghi chú đã được sử dụng cho yêu cầu khác.';end if;
  return v_previous.result;
 end if;
 select o.id,o.session_id,s.table_id into v_order,v_session,v_table
 from public.order_items i join public.orders o on o.id=i.order_id join public.table_sessions s on s.id=o.session_id where i.id=p_item_id;
 if not found then raise exception 'Không còn tìm thấy món. Đồng bộ và mở lại ghi chú.';end if;
 if v_order<>p_order_id then raise exception 'Món vừa được chuyển bill. Đồng bộ và mở lại ghi chú.';end if;
 -- Match the table -> session -> order -> item lock order used by completion/cancellation.
 perform 1 from public.restaurant_tables where id=v_table for update;
 perform 1 from public.table_sessions where id=v_session and table_id=v_table and closed_at is null for update;
 if not found then raise exception 'Bàn đã đóng hoặc vừa được chuyển. Đồng bộ và mở lại ghi chú.';end if;
 perform 1 from public.orders where id=p_order_id and session_id=v_session and status='cooking' and kitchen_relevant for update;
 if not found then raise exception 'Bếp đã ra món hoặc món vừa được chuyển. Không thể sửa ghi chú.';end if;
 select * into v_item from public.order_items where id=p_item_id for update;
 if not found or v_item.order_id<>p_order_id then raise exception 'Món vừa thay đổi vị trí. Đồng bộ và mở lại ghi chú.';end if;
 if v_item.paid or v_item.cancelled_at is not null or v_item.category='do_uong' then raise exception 'Chỉ sửa món đang làm, chưa thanh toán và chưa hủy.';end if;
 if v_item.note_version<>p_expected_version or v_item.note is distinct from p_expected_note then raise exception 'Ghi chú đã được người khác sửa. Đồng bộ và mở lại ghi chú mới nhất.';end if;
 if v_item.note is not distinct from v_note then
  v_result:=jsonb_build_object('ok',true,'changed',false,'item_id',p_item_id,'note',v_item.note,'note_version',v_item.note_version,'note_edited_at',v_item.note_edited_at);
 else
  update public.order_items set note=v_note,note_version=note_version+1,note_edited_at=clock_timestamp() where id=p_item_id returning * into v_item;
  insert into public.audit_log(type,table_no,session_id,user_id,extra)
   values('order_note_edited',v_table,v_session,v_user,jsonb_build_object('request_id',p_request_id,'item_id',p_item_id,'order_id',p_order_id,'name',v_item.name,'qty',v_item.qty,'before_note',p_expected_note,'after_note',v_item.note,'note_version',v_item.note_version));
  v_result:=jsonb_build_object('ok',true,'changed',true,'item_id',p_item_id,'note',v_item.note,'note_version',v_item.note_version,'note_edited_at',v_item.note_edited_at);
 end if;
 insert into public.order_note_changes(request_id,user_id,item_id,payload,result) values(p_request_id,v_user,p_item_id,v_payload,v_result);
 return v_result;
end $$;
revoke all on function public.edit_sent_order_note(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.edit_sent_order_note(uuid,uuid,uuid,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
