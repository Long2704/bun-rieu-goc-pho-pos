begin;
set local lock_timeout='5s';

-- Preserve the installed report's filters and financial calculations.
do $patch$
declare
 definition text := pg_get_functiondef('public.admin_dashboard_period(timestamp,timestamp,jsonb,text,integer,timestamptz)'::regprocedure);
 old_slots text := 'coalesce(sum(b.transfer),0) transfer from selected b group by b.day,b.slot_index)';
 old_table_qty text := 'sum((select coalesce(sum(i.qty),0) from public.bill_items i where i.bill_id=b.id)) qty,sum(b.total) total';
 old_table_join text := 'from selected b join table_names n on n.table_no=b.table_no group by b.table_no,n.name)';
begin
 if position(old_slots in definition)=0 or position(old_table_qty in definition)=0
    or position(old_table_join in definition)=0 or position(' slots as (' in definition)=0 then
  raise exception 'Unrecognized Admin report definition';
 end if;
 definition:=replace(definition,' slots as (',$sql$ billed_quantities as materialized (
  select b.id,coalesce(sum(i.qty),0) qty,coalesce(sum(i.qty) filter (where i.category='bun'),0) main_qty
  from selected b left join public.bill_items i on i.bill_id=b.id group by b.id
 ),
 slots as ($sql$);
 definition:=replace(definition,old_slots,
  'coalesce(sum(b.transfer),0) transfer,coalesce(sum(q.main_qty),0) main_qty from selected b join billed_quantities q on q.id=b.id group by b.day,b.slot_index)');
 definition:=replace(definition,old_table_qty,'sum(q.qty) qty,sum(b.total) total');
 definition:=replace(definition,old_table_join,
  'from selected b join billed_quantities q on q.id=b.id join table_names n on n.table_no=b.table_no group by b.table_no,n.name)');
 execute definition;
end;
$patch$;

commit;
