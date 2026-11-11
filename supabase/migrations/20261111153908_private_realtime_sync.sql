set local lock_timeout='3s';
set local statement_timeout='20s';
-- Additive: no business rows, RPC contracts or publication changes.
create schema if not exists pos_sync;
revoke all on schema pos_sync from public,anon,authenticated;

create function pos_sync.invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_kind text:=TG_ARGV[0];v_key text;v_tx text:=pg_current_xact_id()::text;
begin
 if TG_OP='UPDATE' and NEW is not distinct from OLD then return null;end if;
 v_key:='pos_sync.sent_'||v_kind;
 -- One generic notification per topic per committed transaction, even when
 -- an order updates many items and tables. Transaction-local and savepoint-safe.
 if current_setting(v_key,true)=v_tx then return null;end if;
 perform set_config(v_key,v_tx,true);
 perform realtime.send(jsonb_build_object('version',1),'invalidate','pos:'||v_kind,true);
 return null;
exception when others then
 -- A notification must never roll back a sale. Clients retain fallback reads.
 return null;
end;
$$;
revoke all on function pos_sync.invalidate() from public,anon,authenticated;

create policy pos_receive_invalidations on realtime.messages
for select to authenticated using (
 extension='broadcast' and (
  ((select realtime.topic()) in ('pos:orders','pos:catalog') and (select public.has_permission('orders.read')))
  or ((select realtime.topic())='pos:images' and (select public.has_permission('kitchen_images.read')))
 )
);
-- No client INSERT policy: clients cannot publish spoofed invalidations.

do $$
declare v_table text;v_kind text;
begin
 foreach v_table in array array['table_sessions','orders','order_items','active_table_links','bill_orders','bills','pos_runtime_settings','profiles','restaurant_tables','menu_items','menu_groups','menu_item_groups','kitchen_image_tickets'] loop
  v_kind:=case when v_table in ('restaurant_tables','menu_items','menu_groups','menu_item_groups') then 'catalog' when v_table='kitchen_image_tickets' then 'images' else 'orders' end;
  execute format('create trigger pos_realtime_invalidate after insert or update or delete on public.%I for each row execute function pos_sync.invalidate(%L)',v_table,v_kind);
 end loop;
end;
$$;
