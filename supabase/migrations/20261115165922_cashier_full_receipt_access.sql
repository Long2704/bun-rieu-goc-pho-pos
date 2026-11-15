-- User-authorized access to invoice history like Owner; reports stay quantity-only.
begin;
set local lock_timeout='5s';
do $patch$
declare v_definition text;v_cashier text;v_new text;
begin
 v_definition:=pg_get_functiondef('public.has_permission(text)'::regprocedure);
 v_cashier:=substring(v_definition from $re$\('thu_ngan', array\[[^\]]*\]::text\[\]\)$re$);
 if v_cashier is null then raise exception 'Unrecognized cashier permission definition';end if;
 if position('''receipts.read_all''' in v_cashier)=0 then
  v_new:=replace(v_cashier,']::text[])',',''receipts.read_all'']::text[])');
  execute replace(v_definition,v_cashier,v_new);
 end if;
end;
$patch$;
-- The existing permissive policy uses receipts.read_all; bill_items follows bills.
-- Keep the original own-receipt rules for Waiter/Kitchen and active/session guards.
drop policy if exists cashier_receipt_scope on public.bills;
notify pgrst,'reload schema';
commit;
