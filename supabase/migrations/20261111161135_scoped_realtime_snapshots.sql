set local lock_timeout='3s';
set local statement_timeout='20s';
-- Existing clients ignore the optional scope and still perform a full read.
-- No business records, prices or mutation RPCs are rewritten.
create or replace function pos_sync.invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_kind text:=TG_ARGV[0];v_key text;v_tx text:=pg_current_xact_id()::text;
 v_new jsonb;v_old jsonb;v_sessions uuid[];v_id uuid;v_count integer;
begin
 if TG_OP='UPDATE' and NEW is not distinct from OLD then return null;end if;
 if v_kind='orders' then
  if current_setting('pos_sync.sent_orders',true)=v_tx then return null;end if;
  if TG_OP<>'DELETE' then v_new:=to_jsonb(NEW);end if;
  if TG_OP<>'INSERT' then v_old:=to_jsonb(OLD);end if;
  if TG_TABLE_NAME='table_sessions' then
   -- Moving a physical table can change ownership in multiple projections.
   if TG_OP<>'UPDATE' or v_new->'table_id'=v_old->'table_id' then
    v_sessions:=array[coalesce(v_new->>'id',v_old->>'id')::uuid];
   end if;
  elsif TG_TABLE_NAME in('orders','bills') then
   if TG_OP<>'UPDATE' or v_new->'session_id'=v_old->'session_id' then
    v_sessions:=array[coalesce(v_new->>'session_id',v_old->>'session_id')::uuid];
   end if;
  elsif TG_TABLE_NAME in('order_items','bill_orders') then
   select array_agg(distinct o.session_id) into v_sessions from public.orders o
   where o.id in(nullif(v_new->>'order_id','')::uuid,nullif(v_old->>'order_id','')::uuid);
  end if;
  -- Links, employee/runtime settings, moves and unknown/deleted parents use
  -- a full invalidation. A later full message supersedes scoped ones in a batch.
  if cardinality(v_sessions)>0 then
   foreach v_id in array v_sessions loop
    v_key:='pos_sync.session_'||replace(v_id::text,'-','_');
    if current_setting(v_key,true) is distinct from v_tx then
     v_count:=case when current_setting('pos_sync.scope_tx',true)=v_tx then coalesce(nullif(current_setting('pos_sync.scope_count',true),''),'0')::integer else 0 end;
     if v_count>=30 then
      perform set_config('pos_sync.sent_orders',v_tx,true);
      perform realtime.send(jsonb_build_object('version',1),'invalidate','pos:orders',true);
      return null;
     end if;
     perform set_config('pos_sync.scope_tx',v_tx,true);
     perform set_config('pos_sync.scope_count',(v_count+1)::text,true);
     perform set_config(v_key,v_tx,true);
     perform realtime.send(jsonb_build_object('version',2,'session_id',v_id),'invalidate','pos:orders',true);
    end if;
   end loop;
   return null;
  end if;
 end if;
 v_key:='pos_sync.sent_'||v_kind;
 if current_setting(v_key,true)=v_tx then return null;end if;
 perform set_config(v_key,v_tx,true);
 perform realtime.send(jsonb_build_object('version',1),'invalidate','pos:'||v_kind,true);
 return null;
exception when others then return null;
end;
$$;
revoke all on function pos_sync.invalidate() from public,anon,authenticated;

-- One authorized, statement-consistent read for the affected sessions, their
-- linked physical tables and cooking tickets (including closed/paid sessions).
create function public.get_pos_sync_delta(p_session_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[];v_result jsonb;
begin
 if auth.uid() is null or not public.has_permission('orders.read') then raise exception 'Bạn không có quyền đọc đơn.';end if;
 if p_session_ids is null or cardinality(p_session_ids) not between 1 and 30 or array_position(p_session_ids,null) is not null then raise exception 'Phạm vi đồng bộ không hợp lệ.';end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_session_ids) x;
 select jsonb_build_object(
  'session_ids',to_jsonb(v_ids),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'table_id',s.table_id,'table_path',s.table_path,
   'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at,o.id) from public.orders o where o.session_id=s.id),'[]'::jsonb)) order by s.id)
   from public.table_sessions s where s.closed_at is null and s.id=any(v_ids)),'[]'::jsonb),
  'links',coalesce((select jsonb_agg(l) from jsonb_array_elements(public.get_active_table_links()) l where (l->>'session_id')::uuid=any(v_ids)),'[]'::jsonb),
  'kitchen',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kitchen_position,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
   'table_sessions',jsonb_build_object('table_id',s.table_id,'closed_at',s.closed_at,'table_path',s.table_path)) order by o.created_at,o.id)
   from public.orders o join public.table_sessions s on s.id=o.session_id
   where o.session_id=any(v_ids) and o.status='cooking' and o.kitchen_relevant),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.get_pos_sync_delta(uuid[]) from public,anon;
grant execute on function public.get_pos_sync_delta(uuid[]) to authenticated;

notify pgrst,'reload schema';
