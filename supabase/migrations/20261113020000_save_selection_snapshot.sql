set local lock_timeout='3s';
set local statement_timeout='30s';
-- Keep the existing UUID-returning API available for older POS windows.
create function public.save_menu_selection_snapshot(p_table_id integer,p_request_id uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order uuid;v_session uuid;
begin
 -- Delegates all permissions, prices, locks and same-request idempotency.
 v_order:=public.save_menu_selection(p_table_id,p_request_id,p_items);
 select session_id into v_session from public.orders where id=v_order and request_id=p_request_id;
 if v_session is null then raise exception 'Chưa xác nhận được đơn vừa lưu.';end if;
 return jsonb_build_object('order_id',v_order,'request_id',p_request_id,'table_id',p_table_id,
  'session_id',v_session,'snapshot',public.get_pos_sync_delta(array[v_session]));
end;$$;
revoke all on function public.save_menu_selection_snapshot(integer,uuid,jsonb) from public,anon;
grant execute on function public.save_menu_selection_snapshot(integer,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
