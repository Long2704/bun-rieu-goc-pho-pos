set local lock_timeout='3s';
set local statement_timeout='30s';
create table pos_push.foreground(
 device_id uuid not null references pos_push.devices(id) on delete cascade,
 tab_id uuid not null,session_id uuid not null,expires_at timestamptz not null,
 primary key(device_id,tab_id)
);
alter table pos_push.foreground enable row level security;
revoke all on pos_push.foreground from public,anon,authenticated;
create function public.set_kitchen_push_foreground(p_device uuid,p_proof text,p_tab uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_sid uuid;
begin
 if auth.uid() is null or not public.has_permission('kitchen.complete') then raise exception 'Bạn không có quyền nhận thông báo bếp.';end if;
 if p_tab is null or p_active is null then raise exception 'Invalid foreground state.';end if;
 select d.session_id into v_sid from pos_push.devices d where d.id=p_device and d.user_id=auth.uid()
 and d.session_id=(auth.jwt()->>'session_id')::uuid and d.enabled and pos_push.allowed_device(d)
 and d.proof_hash=encode(extensions.digest(p_proof,'sha256'),'hex');
 if v_sid is null then return;end if;
 delete from pos_push.foreground where expires_at<=now();
 if p_active then
  if (select count(*) from pos_push.foreground where device_id=p_device)>=20 and not exists(select 1 from pos_push.foreground where device_id=p_device and tab_id=p_tab) then return;end if;
  insert into pos_push.foreground(device_id,tab_id,session_id,expires_at) values(p_device,p_tab,v_sid,now()+interval '90 seconds')
  on conflict(device_id,tab_id) do update set session_id=excluded.session_id,expires_at=excluded.expires_at;
 else delete from pos_push.foreground where device_id=p_device and tab_id=p_tab;end if;
end;$$;
revoke all on function public.set_kitchen_push_foreground(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_kitchen_push_foreground(uuid,text,uuid,boolean) to authenticated;
create or replace function public.kitchen_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 -- Expire old work; do not replay backlog to newly-registered devices.
 delete from pos_push.events where created_at<now()-interval '7 days';
 update pos_push.deliveries d set state='skipped',last_code='expired' from pos_push.events e where e.id=d.event_id and e.expires_at<=now() and d.state in('pending','processing');
 insert into pos_push.deliveries(event_id,device_id)
 select e.id,d.id from pos_push.events e join pos_push.devices d on d.enabled and d.created_at<=e.created_at
 and (e.test_device is null or e.test_device=d.id) where not e.prepared and e.expires_at>now() and pos_push.allowed_device(d)
 on conflict(event_id,device_id) do nothing;
 update pos_push.events set prepared=true where not prepared;
 update pos_push.deliveries x set state='skipped',last_code='not_eligible' from pos_push.devices d where x.device_id=d.id and x.state in('pending','processing') and (not d.enabled or not pos_push.allowed_device(d));
 update pos_push.deliveries x set state='skipped',last_code='device_rebound' from pos_push.events e,pos_push.devices d where e.id=x.event_id and d.id=x.device_id and d.created_at>e.created_at and x.state in('pending','processing');
 update pos_push.deliveries x set state='skipped',last_code='no_active_items' from pos_push.events e where e.id=x.event_id and e.order_id is not null and x.state in('pending','processing')
 and not exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.id=e.order_id and o.status='cooking' and o.kitchen_relevant and i.category<>'do_uong' and i.cancelled_at is null);
 update pos_push.deliveries set state='failed',last_code='attempt_limit' where state='processing' and lease_until<now() and attempts>=3;
 -- Suppress at the server; Safari requires received Web Push to display a notification.
 update pos_push.deliveries x set state='skipped',last_code='kitchen_visible'
 from pos_push.events e,pos_push.devices d where e.id=x.event_id and d.id=x.device_id and e.order_id is not null
 and (x.state='pending' or (x.state='processing' and x.lease_until<now()))
 and exists(select 1 from pos_push.foreground f where f.device_id=d.id and f.session_id=d.session_id and f.expires_at>now());
 with candidates as (
  select id from pos_push.deliveries where attempts<3 and ((state='pending' and next_at<=now()) or(state='processing' and lease_until<now())) order by next_at,id limit 8 for update skip locked
 ),claimed as (
  update pos_push.deliveries set state='processing',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id in(select id from candidates) returning *
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'device_id',d.id,'user_id',d.user_id,'event_id',e.id,'order_id',e.order_id,
 'subscription',jsonb_build_object('endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key)),
 'title',case when e.test_device is not null then 'Thông báo bếp đã sẵn sàng' else coalesce(nullif(o.service_label,''),t.name,'Bếp')||' · Có phiếu bếp mới' end,
 'body',case when e.test_device is not null then 'Thiết bị này đã nhận được thông báo thử.' else (select coalesce(sum(i.qty),0)::text from public.order_items i where i.order_id=o.id and i.category<>'do_uong' and i.cancelled_at is null)||' phần · Bấm để xem phiếu' end)),'[]'::jsonb)
 into v_result from claimed c join pos_push.events e on e.id=c.event_id join pos_push.devices d on d.id=c.device_id left join public.orders o on o.id=e.order_id left join public.table_sessions s on s.id=o.session_id left join public.restaurant_tables t on t.id=s.table_id;
 return v_result;
end;$$;
notify pgrst,'reload schema';
