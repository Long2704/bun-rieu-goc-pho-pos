begin;
set local lock_timeout='5s';
-- Add image viewing (required by the uploader area) and uploading only.
-- Keep kitchen completion, reports, staff management and all other roles unchanged.
do $grant_images$
declare definition text;cashier text;updated text;permission text;
begin
 definition:=pg_get_functiondef('public.has_permission(text)'::regprocedure);
 cashier:=substring(definition from $re$\('thu_ngan', array\[[^\]]*\]::text\[\]\)$re$);
 if cashier is null then raise exception 'Unrecognized cashier permissions; no change applied';end if;
 updated:=cashier;
 foreach permission in array array['kitchen_images.read','kitchen_images.upload'] loop
  if position(quote_literal(permission) in updated)=0 then
   updated:=replace(updated,']::text[])',','||quote_literal(permission)||']::text[])');
  end if;
 end loop;
 execute replace(definition,cashier,updated);
end;
$grant_images$;
notify pgrst,'reload schema';
commit;
