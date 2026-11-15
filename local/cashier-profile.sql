-- LOCAL ONLY: create cashier@pos.test in local Studio Authentication first.
-- This never changes another employee's role or password.
begin;
do $$begin
 if to_regprocedure('public.cashier_operations_report(date,date)') is null then raise exception 'Cài SQL quyền Thu ngân trước.';end if;
 if not exists(select 1 from auth.users where lower(email)='cashier@pos.test') then raise exception 'Tạo Auth user cashier@pos.test trong Studio local trước.';end if;
 if exists(select 1 from public.profiles p join auth.users u on u.id=p.id where lower(u.email)='cashier@pos.test' and p.role<>'thu_ngan') then raise exception 'Email đã thuộc vai trò khác; không tự đổi quyền.';end if;
end$$;
insert into public.profiles(id,name,role,username,is_active,must_change_password)
select id,'Thu ngân Local','thu_ngan','cashierlocal',true,false from auth.users where lower(email)='cashier@pos.test'
on conflict(id) do nothing;
commit;
