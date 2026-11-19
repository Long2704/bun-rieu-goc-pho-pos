begin;
set local lock_timeout='5s';

do $roles$
declare
 routine regprocedure;
 definition text;
 old_guard constant text:=$guard$not in ('phuc_vu','chu')$guard$;
 new_guard constant text:=$guard$not in ('phuc_vu','thu_ngan','bep','chu')$guard$;
begin
 foreach routine in array array[
  'public.list_drink_tickets(boolean)'::regprocedure,
  'public.complete_drink_ticket(uuid,jsonb)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(routine);
  if position(old_guard in definition)=0 then
   raise exception 'Unexpected drink ticket role guard in %',routine;
  end if;
  execute replace(definition,old_guard,new_guard);
 end loop;
end;
$roles$;

-- The cashier's underlying sales RLS still hides closed sessions. Expose only
-- the existing drink projection, including paid drinks still awaiting service
-- and completed drink history, through the role-checked RPC.
alter function public.list_drink_tickets(boolean) security definer;

revoke all on function public.list_drink_tickets(boolean),public.complete_drink_ticket(uuid,jsonb) from public,anon;
grant execute on function public.list_drink_tickets(boolean),public.complete_drink_ticket(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
