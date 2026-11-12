set local lock_timeout='3s';
set local statement_timeout='30s';
create extension if not exists pg_net with schema extensions;
create schema pos_push;
revoke all on schema pos_push from public,anon,authenticated;
create table pos_push.settings(id boolean primary key default true check(id),worker_url text not null default '',public_key text,last_kick_at timestamptz);
insert into pos_push.settings(id) values(true);
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'pos_kitchen_push_worker');
create table pos_push.devices(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null,
 proof_hash text not null,endpoint text not null unique,p256dh text not null,auth_key text not null,enabled boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table pos_push.events(
 id uuid primary key default gen_random_uuid(),order_id uuid unique references public.orders(id) on delete cascade,
 test_device uuid references pos_push.devices(id) on delete cascade,prepared boolean not null default false,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',
 check((order_id is null)<>(test_device is null))
);
create table pos_push.deliveries(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references pos_push.events(id) on delete cascade,
 device_id uuid not null references pos_push.devices(id) on delete cascade,state text not null default 'pending' check(state in('pending','processing','sent','failed','skipped')),
 attempts integer not null default 0,next_at timestamptz not null default now(),lease uuid,lease_until timestamptz,last_code text,unique(event_id,device_id)
);
create index on pos_push.deliveries(state,next_at);
create index on pos_push.events(created_at);
create index on pos_push.events(test_device);
create index on pos_push.devices(user_id);
create index on pos_push.deliveries(device_id);
alter table pos_push.settings enable row level security;
alter table pos_push.devices enable row level security;
alter table pos_push.events enable row level security;
alter table pos_push.deliveries enable row level security;
revoke all on all tables in schema pos_push from public,anon,authenticated;

create function pos_push.allowed_device(d pos_push.devices) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id and s.id=d.session_id
 where p.id=d.user_id and p.is_active and not p.must_change_password and not p.password_reset_pending
 and not p.account_deletion_pending and p.deleted_at is null and p.role in('chu','bep')
 and (p.staff_sessions_revoked_before is null or s.created_at>p.staff_sessions_revoked_before));
$$;
create function pos_push.valid_endpoint(p_url text) returns boolean language sql immutable set search_path='' as $$
 select length(p_url) between 30 and 2048 and p_url ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#]+$';
$$;
create function public.get_kitchen_push_settings() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('kitchen.complete') then raise exception 'Bạn không có quyền nhận thông báo bếp.';end if;
 return (select jsonb_build_object('ready',public_key is not null and worker_url<>'','public_key',public_key) from pos_push.settings where id);
end;$$;
create function public.register_kitchen_push(p_proof text,p_subscription jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sid uuid;v_id uuid;v_hash text;v_endpoint text:=p_subscription->>'endpoint';v_existing pos_push.devices%rowtype;
begin
 if auth.uid() is null or not public.has_permission('kitchen.complete') then raise exception 'Bạn không có quyền nhận thông báo bếp.';end if;
 if p_proof is null or p_proof !~ '^[A-Za-z0-9_-]{43}$' or not coalesce(pos_push.valid_endpoint(v_endpoint),false)
 or coalesce(p_subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}=?$' or coalesce(p_subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}(==)?$' then raise exception 'Đăng ký thông báo không hợp lệ hoặc trình duyệt chưa được hỗ trợ.';end if;
 v_sid:=(auth.jwt()->>'session_id')::uuid;
 if v_sid is null or not exists(select 1 from auth.sessions where id=v_sid and user_id=auth.uid()) then raise exception 'Đăng nhập lại để bật thông báo.';end if;
 if not exists(select 1 from pos_push.settings where public_key is not null and worker_url<>'') then raise exception 'Thông báo bếp chưa sẵn sàng.';end if;
 v_hash:=encode(extensions.digest(p_proof,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,180));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_endpoint,179));
 select * into v_existing from pos_push.devices where endpoint=v_endpoint for update;
 if found and v_existing.proof_hash<>v_hash then raise exception 'Đăng ký này thuộc thiết bị khác. Tắt quyền thông báo rồi bật lại trên thiết bị này.';end if;
 if (select count(*) from pos_push.devices where user_id=auth.uid() and enabled and endpoint<>v_endpoint)>=10 then raise exception 'Tài khoản đã bật thông báo trên quá nhiều thiết bị.';end if;
 insert into pos_push.devices(user_id,session_id,proof_hash,endpoint,p256dh,auth_key)
 values(auth.uid(),v_sid,v_hash,v_endpoint,p_subscription#>>'{keys,p256dh}',p_subscription#>>'{keys,auth}')
 on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,proof_hash=excluded.proof_hash,p256dh=excluded.p256dh,auth_key=excluded.auth_key,enabled=true,created_at=case when pos_push.devices.user_id<>excluded.user_id or pos_push.devices.session_id<>excluded.session_id then now() else pos_push.devices.created_at end,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('id',v_id,'enabled',true);
end;$$;
create function public.disable_kitchen_push(p_device uuid,p_proof text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Cần đăng nhập.';end if;
 update pos_push.devices set enabled=false,updated_at=now() where id=p_device and user_id=auth.uid() and proof_hash=encode(extensions.digest(p_proof,'sha256'),'hex');
end;$$;

create function pos_push.kick(p_force boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare v_url text;v_token text;
begin
 if not p_force and not exists(select 1 from pos_push.events e where e.expires_at>now() and (not e.prepared or exists(select 1 from pos_push.deliveries d where d.event_id=e.id and (d.state='pending' and d.next_at<=now() or d.state='processing' and d.lease_until<now())))) then return;end if;
 update pos_push.settings set last_kick_at=now() where id and worker_url ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/kitchen-push$' and (p_force or last_kick_at is null or last_kick_at<now()-interval '5 seconds') returning worker_url into v_url;
 if v_url is null then return;end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where name='pos_kitchen_push_worker';
 perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-pos-push-worker',v_token),body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=30000);
end;$$;
create function pos_push.enqueue_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.is_draft and new.kitchen_relevant and new.status='cooking' and new.bill_transfer_origin is null
 and (TG_OP='INSERT' or old.is_draft or not old.kitchen_relevant)
 and exists(select 1 from pos_push.devices d where d.enabled and pos_push.allowed_device(d)) then
  insert into pos_push.events(order_id) values(new.id) on conflict(order_id) do nothing;
  perform pos_push.kick();
 end if;
 return new;
exception when others then return new; -- Push can never reject a kitchen transaction.
end;$$;
create trigger pos_enqueue_kitchen_push after insert or update of is_draft,kitchen_relevant,status on public.orders for each row execute function pos_push.enqueue_order();
create function public.request_kitchen_push_test(p_device uuid,p_proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.has_permission('kitchen.complete') then raise exception 'Bạn không có quyền nhận thông báo bếp.';end if;
 perform 1 from pos_push.devices d where d.id=p_device and d.user_id=auth.uid() and d.enabled and pos_push.allowed_device(d) and d.proof_hash=encode(extensions.digest(p_proof,'sha256'),'hex') for update;
 if not found then raise exception 'Thiết bị chưa bật thông báo.';end if;
 select id into v_id from pos_push.events where test_device=p_device and created_at>now()-interval '1 minute' order by created_at desc limit 1;
 if v_id is null then insert into pos_push.events(test_device) values(p_device) returning id into v_id;end if;
 perform pos_push.kick();return jsonb_build_object('queued',true);
end;$$;

-- Service-only worker RPCs. The worker token is generated and kept inside Vault.
create function public.kitchen_push_worker_config(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expected text;v_private text;
begin
 select decrypted_secret into v_expected from vault.decrypted_secrets where name='pos_kitchen_push_worker';
 if p_token is null or v_expected is null or p_token<>v_expected then raise exception 'Invalid worker authentication.';end if;
 select decrypted_secret into v_private from vault.decrypted_secrets where name='pos_kitchen_push_vapid';
 return (select jsonb_build_object('public_key',public_key,'private_key',v_private) from pos_push.settings where id);
end;$$;
create function public.kitchen_push_set_keys(p_public text,p_private text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_public !~ '^[A-Za-z0-9_-]{87}$' or p_private !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid VAPID keys.';end if;
 perform 1 from pos_push.settings where id for update;
 if exists(select 1 from pos_push.settings where id and public_key is not null) then return;end if;
 perform vault.create_secret(p_private,'pos_kitchen_push_vapid');update pos_push.settings set public_key=p_public where id;
end;$$;
create function public.kitchen_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.kitchen_push_ack(p_results jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;v_device uuid;
begin
 if jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)>8 then raise exception 'Invalid acknowledgement.';end if;
 for r in select * from jsonb_array_elements(p_results) loop
  update pos_push.deliveries set state=case when r->>'status'='sent' then 'sent' when r->>'status'='retry' and attempts<3 then 'pending' else 'failed' end,
  next_at=now()+case when attempts=1 then interval '15 seconds' else interval '1 minute' end,
  last_code=left(coalesce(r->>'code',''),40),lease_until=null
  where id=(r->>'id')::uuid and lease=(r->>'lease')::uuid and state='processing' returning device_id into v_device;
  if found and r->>'status'='gone' then update pos_push.devices set enabled=false,updated_at=now() where id=v_device;end if;
 end loop;
end;$$;
revoke all on all functions in schema pos_push from public,anon,authenticated;
revoke all on function public.get_kitchen_push_settings(),public.register_kitchen_push(text,jsonb),public.disable_kitchen_push(uuid,text),public.request_kitchen_push_test(uuid,text) from public,anon;
grant execute on function public.get_kitchen_push_settings(),public.register_kitchen_push(text,jsonb),public.disable_kitchen_push(uuid,text),public.request_kitchen_push_test(uuid,text) to authenticated;
revoke all on function public.kitchen_push_worker_config(text),public.kitchen_push_set_keys(text,text),public.kitchen_push_claim(),public.kitchen_push_ack(jsonb) from public,anon,authenticated;
grant execute on function public.kitchen_push_worker_config(text),public.kitchen_push_set_keys(text,text),public.kitchen_push_claim(),public.kitchen_push_ack(jsonb) to service_role;
select cron.schedule('pos-kitchen-push-retry','* * * * *','select pos_push.kick();');
select cron.schedule('pos-kitchen-push-cleanup','15 20 * * *',$cron$delete from pos_push.events where created_at<now()-interval '7 days';delete from pos_push.devices where not enabled and updated_at<now()-interval '30 days';$cron$);
notify pgrst,'reload schema';
