begin;
set local lock_timeout='5s';
alter table public.bills add column cashier_name text;
-- Existing invoices can only recover the account's current display name.
update public.bills b set cashier_name=coalesce(nullif(btrim(p.name),''),'Nhân viên')
from public.profiles p where p.id=b.cashier_id;
update public.bills set cashier_name='Nhân viên' where cashier_name is null;
alter table public.bills alter column cashier_name set not null;
-- Capture the payer, not the order creator; future account renames do not rewrite history.
create function pos_cashier.capture_bill_cashier_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select coalesce(nullif(btrim(p.name),''),'Nhân viên') into new.cashier_name
 from public.profiles p where p.id=new.cashier_id;
 new.cashier_name:=coalesce(new.cashier_name,'Nhân viên');
 return new;
end;
$$;
revoke all on function pos_cashier.capture_bill_cashier_name() from public,anon,authenticated;
create trigger bills_cashier_name before insert on public.bills
for each row execute function pos_cashier.capture_bill_cashier_name();
notify pgrst,'reload schema';
commit;
