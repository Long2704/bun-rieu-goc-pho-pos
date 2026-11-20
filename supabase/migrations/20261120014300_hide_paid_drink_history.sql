begin;
set local lock_timeout='5s';

do $patch$
declare
 definition text;
 session_join constant text:='join public.table_sessions s on s.id=o.session_id';
begin
 definition:=pg_get_functiondef('public.list_drink_tickets(boolean)'::regprocedure);
 if position(session_join in definition)=0 then
  raise exception 'Unexpected session join in list_drink_tickets';
 end if;
 -- Match the kitchen's open-session history without hiding pending paid drinks.
 execute replace(definition,session_join,session_join||' and (not p_history or s.closed_at is null)');
end;
$patch$;

notify pgrst,'reload schema';
commit;
