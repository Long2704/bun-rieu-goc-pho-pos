begin;
set local lock_timeout='5s';
-- Allow Cashier to complete kitchen orders and image tickets. Other permissions are unchanged.
do $grant_completion$
declare definition text;cashier text;updated text;permission text;
begin
 definition:=pg_get_functiondef('public.has_permission(text)'::regprocedure);
 cashier:=substring(definition from $re$\('thu_ngan', array\[[^\]]*\]::text\[\]\)$re$);
 if cashier is null then raise exception 'Unrecognized cashier permissions; no change applied';end if;
 updated:=cashier;
 foreach permission in array array['kitchen.complete'] loop
  if position(quote_literal(permission) in updated)=0 then
   updated:=replace(updated,']::text[])',','||quote_literal(permission)||']::text[])');
  end if;
 end loop;
 execute replace(definition,cashier,updated);
end;
$grant_completion$;
-- The existing completion permission also exposes the optional kitchen push switch.
-- Keep its device eligibility consistent with canonical Admin/Cashier roles.
-- This does not create or enable any subscription.
do $push_roles$
declare definition text;
begin
 if to_regnamespace('pos_push') is not null then
  definition:=pg_get_functiondef('pos_push.allowed_device(pos_push.devices)'::regprocedure);
  if position('p.role in(''chu'',''bep'')' in definition)>0 then
   execute replace(definition,'p.role in(''chu'',''bep'')','p.role in(''admin'',''bep'',''thu_ngan'')');
  elsif position('p.role in(''admin'',''bep'',''thu_ngan'')' in definition)=0 then
   raise exception 'Unrecognized kitchen push role guard; no change applied';
  end if;
 end if;
end;
$push_roles$;
notify pgrst,'reload schema';
commit;
