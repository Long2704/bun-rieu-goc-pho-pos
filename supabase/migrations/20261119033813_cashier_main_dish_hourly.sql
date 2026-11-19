-- Count main dishes using the category captured on each paid line.
begin;
set local lock_timeout='5s';
create or replace function pos_cashier.dashboard_window(p_from_local timestamp,p_to_local timestamp,p_bands jsonb,p_kind text,p_table integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_start timestamptz;v_end timestamptz;v_count int;v_previous int:=-1;v_a text;v_b text;v_am int;v_bm int;r record;v_result jsonb;
begin
 if auth.uid() is null or not public.has_permission('reports.operations') then raise exception 'Bạn không có quyền xem báo cáo vận hành.';end if;
 if p_from_local is null or p_to_local is null or not isfinite(p_from_local) or not isfinite(p_to_local)
 or extract(year from p_from_local) not between 1000 and 9999 or extract(year from p_to_local) not between 1000 and 9999
 or p_to_local<p_from_local or p_to_local::date-p_from_local::date>365
 or date_trunc('second',p_from_local)<>p_from_local or date_trunc('second',p_to_local)<>p_to_local then
  raise exception 'Chọn khoảng ngày giờ hợp lệ, tối đa 366 ngày.';
 end if;
 if p_kind is null or p_kind not in ('all','takeaway','dine') then raise exception 'Hình thức bán không hợp lệ.';end if;
 if p_bands is null or jsonb_typeof(p_bands)<>'array' then raise exception 'Khung giờ không hợp lệ.';end if;
 v_count:=jsonb_array_length(p_bands);
 if v_count not between 1 and 12 then raise exception 'Chọn từ 1 đến 12 khung giờ.';end if;
 for r in select value from jsonb_array_elements(p_bands) loop
  v_a:=r.value->>'start';v_b:=r.value->>'end';
  if jsonb_typeof(r.value)<>'object' or jsonb_typeof(r.value->'start')<>'string' or jsonb_typeof(r.value->'end')<>'string'
  or v_a is null or v_b is null or v_a!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or v_b!~'^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then raise exception 'Khung giờ không hợp lệ.';end if;
  v_am:=split_part(v_a,':',1)::int*60+split_part(v_a,':',2)::int;
  v_bm:=split_part(v_b,':',1)::int*60+split_part(v_b,':',2)::int;
  if v_am>=v_bm or v_am<v_previous then raise exception 'Các khung giờ phải theo thứ tự và không chồng nhau.';end if;
  v_previous:=v_bm;
 end loop;
 v_start:=p_from_local at time zone 'Asia/Ho_Chi_Minh';
 v_end:=(p_to_local+interval '1 second') at time zone 'Asia/Ho_Chi_Minh';
 with bands as materialized (
  select ordinality::int idx,(value->>'start')||'–'||(value->>'end') label,
  split_part(value->>'start',':',1)::int*60+split_part(value->>'start',':',2)::int a,
  split_part(value->>'end',':',1)::int*60+split_part(value->>'end',':',2)::int z
  from jsonb_array_elements(p_bands) with ordinality
 ), range_bills as materialized (
  select b.id,b.session_id,b.table_no,b.paid_at,
  coalesce(nullif(btrim(b.service_label),''),case when b.table_no<0 then 'Mang về #'||(-b.table_no)::text else 'Bàn '||b.table_no::text end) name
  from public.bills b where b.paid_at>=v_start and b.paid_at<v_end
 ), named as materialized (
  select b.*,b.name ~* '^mang[[:space:]]+v[eề]([^[:alpha:]]|$)' takeaway from range_bills b
 ), selected as materialized (
  select * from named b where (p_table is null or b.table_no=p_table)
  and (p_kind='all' or b.takeaway=(p_kind='takeaway'))
 ), bill_qty as materialized (
  select b.id,b.session_id,b.table_no,b.name,b.paid_at,coalesce(sum(i.qty),0) qty,
  coalesce(sum(i.qty) filter (where i.category='bun'),0) main_qty
  from selected b left join public.bill_items i on i.bill_id=b.id group by b.id,b.session_id,b.table_no,b.name,b.paid_at
 ), banded as materialized (
  select b.*,coalesce((select x.idx from bands x where extract(hour from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int*60+extract(minute from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int>=x.a
  and extract(hour from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int*60+extract(minute from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int<x.z),v_count+1) slot_index from bill_qty b
 ), slot_rows as (
  select x.idx slot_index,x.label slot,count(b.id) invoices,coalesce(sum(b.qty),0) qty,
  coalesce(sum(b.main_qty),0) main_qty
  from (select idx,label from bands union all select v_count+1,'Ngoài khung') x left join banded b on b.slot_index=x.idx group by x.idx,x.label
 ), product_rows as (
  select i.name,sum(i.qty) qty from selected b join public.bill_items i on i.bill_id=b.id group by i.name
 ), product_slots as (
  select i.name,b.slot_index,sum(i.qty) qty from banded b join public.bill_items i on i.bill_id=b.id group by i.name,b.slot_index
 ), table_names as (
  select distinct on (table_no) table_no,name from selected order by table_no,paid_at desc,id desc
 ), table_rows as (
  select b.table_no table_id,n.name,count(*) invoices,count(distinct b.session_id) visits,sum(b.qty) qty
  from bill_qty b join table_names n on n.table_no=b.table_no group by b.table_no,n.name
 ), days as (
  select (b.paid_at at time zone 'Asia/Ho_Chi_Minh')::date as "day",count(*) invoices,sum(b.qty) qty from bill_qty b group by 1
 ), choices as (
  select distinct on (table_no) table_no table_id,name from named order by table_no,paid_at desc,id desc
 )
 select jsonb_build_object('from',to_char(p_from_local,'YYYY-MM-DD"T"HH24:MI:SS'),'to',to_char(p_to_local,'YYYY-MM-DD"T"HH24:MI:SS'),
 'generated_at',statement_timestamp(),'kind',p_kind,'table_id',p_table,
 'invoices',(select count(*) from selected),'visits',(select count(distinct (table_no,session_id)) from selected),'qty',(select coalesce(sum(qty),0) from bill_qty),
 'slots',(select coalesce(jsonb_agg(to_jsonb(s) order by s.slot_index),'[]') from slot_rows s),
 'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.qty desc,p.name),'[]') from product_rows p),
 'product_slots',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name,p.slot_index),'[]') from product_slots p),
 'table_sales',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_id),'[]') from table_rows t),
 'table_options',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_id),'[]') from choices t),
 'days',(select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]') from days d)
 ) into v_result;
 return v_result;
end;$$;

-- Keep the five-argument response compatible with already open POS clients.
create or replace function public.cashier_dashboard_window(
 p_from_local timestamp,p_to_local timestamp,p_bands jsonb,p_kind text,p_table integer
) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_set(report,'{slots}',(
  select coalesce(jsonb_agg(slot - 'main_qty' order by position),'[]'::jsonb)
  from jsonb_array_elements(report->'slots') with ordinality as entries(slot,position)
 ))
 from pos_cashier.dashboard_window(p_from_local,p_to_local,p_bands,p_kind,p_table) as result(report);
$$;

create function public.cashier_dashboard_window_with_main(
 p_from_local timestamp,p_to_local timestamp,p_bands jsonb,p_kind text,p_table integer
) returns jsonb language sql stable security invoker set search_path='' as $$
 select pos_cashier.dashboard_window(p_from_local,p_to_local,p_bands,p_kind,p_table);
$$;
revoke all on function public.cashier_dashboard_window_with_main(timestamp,timestamp,jsonb,text,integer) from public,anon;
grant execute on function public.cashier_dashboard_window_with_main(timestamp,timestamp,jsonb,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
