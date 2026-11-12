set local lock_timeout='3s';
set local statement_timeout='20s';
alter table public.order_items add column cancelled_before_kitchen boolean not null default false;
-- Determine the actual state while the cancellation RPC holds the order lock.
-- Do not compare transaction timestamps: a cancellation may have waited for send.
create function pos_sync.classify_item_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if OLD.cancelled_at is null and NEW.cancelled_at is not null then
  select coalesce(o.is_draft,false) into NEW.cancelled_before_kitchen from public.orders o where o.id=NEW.order_id;
  NEW.cancelled_before_kitchen:=coalesce(NEW.cancelled_before_kitchen,false);
 end if;
 return NEW;
end;
$$;
revoke all on function pos_sync.classify_item_cancellation() from public,anon,authenticated;
create trigger classify_item_cancellation before update of cancelled_at on public.order_items
for each row when(OLD.cancelled_at is null and NEW.cancelled_at is not null)
execute function pos_sync.classify_item_cancellation();

-- Cover existing unsent batches canceled before this migration as well. The
-- anchor keeps the original canceled rows for audit, but never exposes them to
-- kitchen presentation. No line IDs, quantities, notes, prices or bills change.
create function pos_sync.classify_draft_cancellations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.order_items set cancelled_before_kitchen=true
 where order_id=NEW.id and cancelled_at is not null and not cancelled_before_kitchen;
 return NEW;
end;
$$;
revoke all on function pos_sync.classify_draft_cancellations() from public,anon,authenticated;
create trigger classify_draft_cancellations before update of is_draft,kitchen_relevant on public.orders
for each row when(OLD.is_draft and not NEW.is_draft and NEW.kitchen_relevant)
execute function pos_sync.classify_draft_cancellations();
notify pgrst,'reload schema';
