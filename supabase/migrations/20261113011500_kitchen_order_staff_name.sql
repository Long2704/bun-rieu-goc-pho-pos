set local lock_timeout='3s';
set local statement_timeout='30s';
-- Metadata only: existing order projections already include all order columns.
alter table public.orders add column ordered_by_name text;
-- Existing tickets use the recorded creator; transfer fragments use their origin.
with names as (
 select o.id,p.name from public.orders o
 left join public.orders origin on origin.id=o.bill_transfer_origin
 join public.profiles p on p.id=coalesce(origin.created_by,o.created_by)
)
update public.orders o set ordered_by_name=n.name from names n where n.id=o.id;
create function pos_sync.snapshot_order_staff_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  new.ordered_by_name:=old.ordered_by_name;
  return new;
 end if;
 -- A transferred fragment retains the original author, not the transferring employee.
 if new.bill_transfer_origin is not null then
  select o.ordered_by_name into new.ordered_by_name from public.orders o where o.id=new.bill_transfer_origin;
 else new.ordered_by_name:=null;end if;
 if nullif(btrim(new.ordered_by_name),'') is null then
  select p.name into new.ordered_by_name from public.profiles p where p.id=new.created_by;
 end if;
 return new;
end;$$;
revoke all on function pos_sync.snapshot_order_staff_name() from public,anon,authenticated;
create trigger orders_staff_name before insert or update of ordered_by_name,created_by on public.orders
for each row execute function pos_sync.snapshot_order_staff_name();
notify pgrst,'reload schema';
