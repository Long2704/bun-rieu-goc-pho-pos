begin;
set local lock_timeout='5s';

do $patch$
declare
 definition text;
 queue_filter constant text:='and i.drink_queued_at is null and not o.is_draft';
begin
 definition:=pg_get_functiondef('public.notify_service_order(integer,uuid,jsonb,uuid,uuid[])'::regprocedure);
 if position(queue_filter in definition)=0 then
  raise exception 'Unexpected drink queue filter in notify_service_order';
 end if;
 execute replace(definition,queue_filter,queue_filter||$filter$
  -- Non-kitchen items in Khác are saved to the bill without a drink ticket.
  and not exists (
   select 1
   from public.menu_item_groups assignment
   join public.menu_groups menu_group on menu_group.id=assignment.group_id
   where assignment.item_id=i.menu_item_id and lower(btrim(menu_group.name))='khác'
  )$filter$);
end;
$patch$;

notify pgrst,'reload schema';
commit;
