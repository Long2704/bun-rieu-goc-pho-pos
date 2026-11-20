begin;
set local lock_timeout='5s';

do $patch$
declare
 definition text;
 item_update constant text:='update public.order_items set cancelled_at=now(),cancelled_by=v_user,cancel_reason=btrim(coalesce(p_reason';
 table_filter constant text:=$filter$where o.session_id=p_session_id and not o.is_draft and o.kitchen_relevant and o.status='done'
  and i.category<>'do_uong' and i.cancelled_at is null$filter$;
 drink_lock constant text:='perform 1 from public.order_items i';
begin
 definition:=pg_get_functiondef('public.cancel_order_item(uuid,text)'::regprocedure);
 if position(item_update in definition)=0 then raise exception 'Unexpected cancel_order_item definition';end if;
 execute replace(definition,item_update,$guard$if public.current_staff_role() in ('phuc_vu','thu_ngan','bep')
 and v_item.category='do_uong' and v_item.drink_done_qty>0 then
  raise exception 'Nước đã hoàn thành. Chỉ Admin mới có thể hủy món này.';
 end if;
 $guard$||item_update);

 definition:=pg_get_functiondef('public.cancel_table_session(uuid,uuid,uuid[])'::regprocedure);
 if position(table_filter in definition)=0 then raise exception 'Unexpected cancel_table_session definition';end if;
 execute replace(definition,table_filter,$guard$where o.session_id=p_session_id and i.cancelled_at is null
  and (
   (not o.is_draft and o.kitchen_relevant and o.status='done' and i.category<>'do_uong')
   or (i.category='do_uong' and i.drink_done_qty>0)
  )$guard$);

 -- Cancellation already locks the order before its items. Take the same
 -- lock for drink completion so cancellation cannot read a stale served state.
 definition:=pg_get_functiondef('public.complete_drink_ticket(uuid,jsonb)'::regprocedure);
 if position(drink_lock in definition)=0 then raise exception 'Unexpected complete_drink_ticket definition';end if;
 execute replace(definition,drink_lock,$lock$perform 1 from public.orders where id=p_order_id for update;
 $lock$||drink_lock);
end;
$patch$;

notify pgrst,'reload schema';
commit;
