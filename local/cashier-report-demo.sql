-- DATA DEMO ONLY. Run in LOCAL Studio http://127.0.0.1:54323 SQL Editor.
-- Never run in the online Supabase dashboard. Does not erase any existing rows.
-- Adds one completed sample bill per hour band for TODAY in Vietnam.
-- Same-day retries reuse deterministic IDs and do not add duplicate bills.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $demo$
declare
 v_actor uuid;v_day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;v_prefix text;
 v_sid uuid;v_order uuid;v_bill uuid;v_line uuid;v_time timestamptz;v_table int;v_gross bigint;
 v_main uuid:=md5('pos-cashier-demo-v1:main')::uuid;
 v_extra uuid:=md5('pos-cashier-demo-v1:extra')::uuid;
 v_drink uuid:=md5('pos-cashier-demo-v1:drink')::uuid;
 v_gift uuid:=md5('pos-cashier-demo-v1:gift')::uuid;
 r record;l record;
begin
 if to_regprocedure('public.cashier_operations_report(date,date)') is null then raise exception 'Cài bộ quyền Thu ngân local trước.';end if;
 -- Fail closed if this looks like a database with real Auth accounts.
 if exists(select 1 from auth.users where lower(coalesce(email,'')) !~ '@pos[.]test$') then
  raise exception 'Dừng: có tài khoản không thuộc @pos.test. File chỉ dành cho database thử local.';
 end if;
 select p.id into v_actor from public.profiles p join auth.users u on u.id=p.id
 where lower(u.email)='cashier@pos.test' and p.role='thu_ngan' and p.is_active and not p.must_change_password;
 if v_actor is null then raise exception 'Tạo tài khoản cashier@pos.test và chạy cashier-profile.sql trước.';end if;
 if exists(select 1 from public.restaurant_tables where (id=901001 and name<>'TEST - Bàn báo cáo') or (id=901002 and name<>'Mang về TEST báo cáo')) then
  raise exception 'ID bàn mẫu đang được dùng; dừng để không sửa bàn đã có.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pos-cashier-report-demo-v1',0));
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 insert into public.restaurant_tables(id,name,is_active,service_type,display_order) values
 (901001,'TEST - Bàn báo cáo',true,'dine_in',901001),(901002,'Mang về TEST báo cáo',true,'dine_in',901002)
 on conflict(id) do nothing;
 insert into public.menu_items(id,name,price,category,is_active,is_out,sort) values
 (v_main,'Bún riêu mẫu TEST',58000,'bun',true,false,9001),
 (v_extra,'Bún thêm mẫu TEST',10000,'an_them',true,false,9002),
 (v_drink,'Trà đá mẫu TEST',3000,'do_uong',true,false,9003),
 (v_gift,'Chả ốc (Tặng)',0,'an_them',true,false,9004)
 on conflict(id) do nothing;
 for r in select * from (values
 (1,7,3,0,1,1,0),(2,10,4,2,0,2,1),(3,12,5,5,2,1,0),
 (4,14,2,0,0,0,2),(5,16,6,3,1,3,0),(6,18,7,7,2,1,1),(7,21,3,1,0,2,0)
 ) as x(idx,h,main_qty,take_qty,gift_qty,extra_qty,cancel_qty) loop
  v_prefix:='pos-cashier-demo-v1:'||v_day::text||':'||r.idx::text;
  v_sid:=md5(v_prefix||':session')::uuid;v_order:=md5(v_prefix||':order')::uuid;v_bill:=md5(v_prefix||':bill')::uuid;
  if exists(select 1 from public.bills where id=v_bill) then continue;end if;
  if exists(select 1 from public.table_sessions where id=v_sid) then raise exception 'Bộ mẫu chưa hoàn chỉnh. Dừng để kiểm tra, không thêm trùng.';end if;
  v_time:=(v_day::timestamp+make_interval(hours=>r.h)) at time zone 'Asia/Ho_Chi_Minh';
  v_table:=case when r.idx in(3,6) then 901002 else 901001 end;
  v_gross:=r.main_qty::bigint*58000+r.extra_qty::bigint*10000+r.main_qty::bigint*3000;
  insert into public.table_sessions(id,table_id,opened_at,closed_at) values(v_sid,v_table,v_time-interval '30 minutes',v_time);
  insert into public.orders(id,request_id,session_id,status,kitchen_relevant,created_by,created_at,done_at,is_draft,submitted_table_id)
  values(v_order,md5(v_prefix||':order-request')::uuid,v_sid,'done',false,v_actor,v_time-interval '25 minutes',v_time-interval '5 minutes',false,v_table);
  insert into public.bills(id,request_id,session_id,table_no,bill_no,gross,discount,total,method,cash_received,change_due,cashier_id,paid_at)
  values(v_bill,md5(v_prefix||':payment-request')::uuid,v_sid,v_table,1,v_gross,0,v_gross,
  case when r.idx%2=0 then 'transfer' else 'cash' end,
  case when r.idx%2=0 then null else v_gross end,0,v_actor,v_time);
  insert into public.bill_orders(bill_id,order_id) values(v_bill,v_order);
  for l in select * from (values
   ('main-dine',v_main,'Bún riêu mẫu TEST',58000,'bun',r.main_qty-r.take_qty,false),
   ('main-take',v_main,'Bún riêu mẫu TEST',58000,'bun',r.take_qty,true),
   ('extra',v_extra,'Bún thêm mẫu TEST',10000,'an_them',r.extra_qty,true),
   ('drink',v_drink,'Trà đá mẫu TEST',3000,'do_uong',r.main_qty,false),
   ('gift',v_gift,'Chả ốc (Tặng)',0,'an_them',r.gift_qty,false)
  ) as y(code,menu_id,item_name,price,category,qty,takeaway) where qty>0 loop
   v_line:=md5(v_prefix||':'||l.code)::uuid;
   insert into public.order_items(id,order_id,menu_item_id,name,price,qty,category,note,bill_no,paid,bill_id,is_takeaway)
   values(v_line,v_order,l.menu_id,l.item_name,l.price,l.qty,l.category,'DỮ LIỆU TEST BÁO CÁO',1,true,v_bill,l.takeaway);
   insert into public.bill_items(id,bill_id,source_item_id,name,qty,price,category,note,is_takeaway)
   values(md5(v_prefix||':bill-item:'||l.code)::uuid,v_bill,v_line,l.item_name,l.qty,l.price,l.category,'DỮ LIỆU TEST BÁO CÁO',l.takeaway);
  end loop;
  if r.cancel_qty>0 then
   insert into public.order_items(id,order_id,menu_item_id,name,price,qty,category,note,bill_no,paid,is_takeaway,cancelled_at,cancelled_by,cancel_reason,cancelled_before_kitchen)
   values(md5(v_prefix||':cancelled')::uuid,v_order,v_main,'Bún riêu mẫu TEST',58000,r.cancel_qty,'bun','DỮ LIỆU TEST BÁO CÁO',1,false,false,v_time,v_actor,'TEST - khách đổi ý',true);
  end if;
  insert into public.audit_log(id,type,table_no,session_id,bill_id,user_id,created_at,extra)
  values(md5(v_prefix||':audit')::uuid,'payment',v_table,v_sid,v_bill,v_actor,v_time,jsonb_build_object('demo','pos-cashier-report-v1','method',case when r.idx%2=0 then 'transfer' else 'cash' end,'total',v_gross));
 end loop;
end $demo$;
commit;
select (now() at time zone 'Asia/Ho_Chi_Minh')::date as ngay_chon_trong_bao_cao,
 30 as to_mon_chinh,18 as mang_ve_to,6 as cha_oc_tang,4 as phan_mon_huy,
 10 as bun_them_khong_tinh_to,30 as tra_da_khong_tinh_to,7 as hoa_don_mau;
