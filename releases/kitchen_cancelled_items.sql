begin;

-- Stable line order survives updates such as cancellation.
alter table public.order_items
  add column if not exists kitchen_position bigint generated always as identity;

-- Keep cancelled cooking tickets visible until the kitchen acknowledges them.
-- Existing cancellation RPCs retain their permissions, locks, audit and billing logic.
create or replace function public.keep_cancelled_kitchen_ticket()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.order_items
    where order_id = old.id
      and category <> 'do_uong'
      and cancelled_at is not null
  ) and not exists (
    select 1 from public.order_items
    where order_id = old.id
      and category <> 'do_uong'
      and cancelled_at is null
  ) then
    new.status := old.status;
    new.kitchen_relevant := old.kitchen_relevant;
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_cancelled_kitchen_ticket()
  from public, anon, authenticated;

drop trigger if exists keep_cancelled_kitchen_ticket on public.orders;
create trigger keep_cancelled_kitchen_ticket
before update of status, kitchen_relevant on public.orders
for each row
when (
  old.status = 'cooking' and old.kitchen_relevant
  and new.status = 'done' and not new.kitchen_relevant
)
execute function public.keep_cancelled_kitchen_ticket();

notify pgrst, 'reload schema';
commit;
