begin;
set local lock_timeout='5s';
-- Both public APIs use the caller's RLS and require the Owner financial-report permission.
create function public.admin_dashboard_period(p_from_local timestamp,p_to_local timestamp,p_bands jsonb,p_kind text,p_table integer,p_cutoff timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_start timestamptz;v_end timestamptz;v_count int;v_previous int:=-1;v_a text;v_b text;v_am int;v_bm int;r record;v_result jsonb;
begin
 if auth.uid() is null or not public.has_permission('reports.read') then raise exception 'Bạn không có quyền xem báo cáo doanh thu.';end if;
 if p_from_local is null or p_to_local is null or not isfinite(p_from_local) or not isfinite(p_to_local)
 or extract(year from p_from_local) not between 1 and 9999 or extract(year from p_to_local) not between 1 and 9999
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

 if p_cutoff is null or not isfinite(p_cutoff) then raise exception 'Mốc dữ liệu không hợp lệ.';end if;
 v_start:=p_from_local at time zone 'Asia/Ho_Chi_Minh';
 v_end:=(p_to_local+interval '1 second') at time zone 'Asia/Ho_Chi_Minh';
 if exists(select 1 from public.bills b where b.paid_at>=v_start and b.paid_at<v_end and b.paid_at<=p_cutoff
 and (b.gross-b.discount<>b.total or b.gross<>(select coalesce(sum(i.qty::bigint*i.price),0) from public.bill_items i where i.bill_id=b.id))) then raise exception 'Chi tiết hóa đơn không khớp tổng tiền.';end if;
 with bands as materialized (
  select ordinality::int idx,(value->>'start')||'–'||(value->>'end') label,
  split_part(value->>'start',':',1)::int*60+split_part(value->>'start',':',2)::int a,
  split_part(value->>'end',':',1)::int*60+split_part(value->>'end',':',2)::int z
  from jsonb_array_elements(p_bands) with ordinality
 ), named as materialized (
  select b.id,b.session_id,b.table_no,b.paid_at,b.gross,b.discount,b.total,
   case when b.method='cash' then b.total else 0 end cash,case when b.method='transfer' then b.total else 0 end transfer,
   coalesce(nullif(regexp_replace(b.service_label,'^[[:space:]                 　﻿]+|[[:space:]                 　﻿]+$','','g'),''),case when b.table_no<0 then 'Mang về #'||(-b.table_no)::text else 'Bàn '||b.table_no::text end) name
  from public.bills b where b.paid_at>=v_start and b.paid_at<v_end and b.paid_at<=p_cutoff
 ), classified as materialized (
  select b.*,regexp_replace(translate(lower(b.name),'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžơưǎǐǒǔǖǘǚǜǟǡǧǩǫǭǰǵǹǻȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕẖẗẘẙạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ','aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzouaiouuuuuaagkoojgnaaaeeiioorruusthaeooooyabbbcdddddeeeeefghhhhhiikkkllllmmmnnnnoooopprrrrsssssttttuuuuuvvwwwwwxxyzzzhtwyaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyy'),'[̀-ͯ]','','g') ~ '^mang[[:space:]                 　﻿]+ve([^a-z0-9_]|$)' takeaway from named b
 ), selected as materialized (
  select b.*,(b.paid_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
  coalesce((select x.idx from bands x where extract(hour from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int*60+extract(minute from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int>=x.a
   and extract(hour from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int*60+extract(minute from b.paid_at at time zone 'Asia/Ho_Chi_Minh')::int<x.z),v_count+1) slot_index
  from classified b where (p_table is null or b.table_no=p_table) and (p_kind='all' or b.takeaway=(p_kind='takeaway'))
 ), days as (select b.day,count(b.id) invoices,coalesce(sum(b.gross),0) gross,coalesce(sum(b.discount),0) discount,coalesce(sum(b.total),0) total,coalesce(sum(b.cash),0) cash,coalesce(sum(b.transfer),0) transfer from selected b group by b.day),
 slots as (select b.day,b.slot_index,coalesce((select x.label from bands x where x.idx=b.slot_index),'Ngoài khung') slot,count(b.id) invoices,coalesce(sum(b.gross),0) gross,coalesce(sum(b.discount),0) discount,coalesce(sum(b.total),0) total,coalesce(sum(b.cash),0) cash,coalesce(sum(b.transfer),0) transfer from selected b group by b.day,b.slot_index),
 products as (select i.name,sum(i.qty) qty,sum(i.qty::bigint*i.price) gross from selected b join public.bill_items i on i.bill_id=b.id group by i.name),
 table_names as (select distinct on(table_no) table_no,name from selected order by table_no,paid_at desc,id desc),
 table_rows as (select b.table_no table_id,n.name,count(*) invoices,count(distinct b.session_id) visits,
  sum((select coalesce(sum(i.qty),0) from public.bill_items i where i.bill_id=b.id)) qty,sum(b.total) total
  from selected b join table_names n on n.table_no=b.table_no group by b.table_no,n.name)
 select jsonb_build_object('day','','from',to_char(p_from_local,'YYYY-MM-DD"T"HH24:MI:SS'),'to',to_char(p_to_local,'YYYY-MM-DD"T"HH24:MI:SS'),
 'generated_at',p_cutoff,'sparse',true,'products_complete',true,'time_filter',true,'slots_complete',true,
 'invoices',(select count(*) from selected),'gross',(select coalesce(sum(gross),0) from selected),'discount',(select coalesce(sum(discount),0) from selected),'total',(select coalesce(sum(total),0) from selected),'cash',(select coalesce(sum(cash),0) from selected),'transfer',(select coalesce(sum(transfer),0) from selected),'visits',(select count(distinct (table_no,session_id)) from selected),
 'days',(select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]') from days d),
 'slots',(select coalesce(jsonb_agg(to_jsonb(s) order by s.day,s.slot_index),'[]') from slots s),
 'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.gross desc,p.name),'[]') from products p),
 'table_sales',(select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc,t.name),'[]') from table_rows t)
 ) into v_result;
 return v_result;
end;$$;
revoke all on function public.admin_dashboard_period(timestamp,timestamp,jsonb,text,integer,timestamptz) from public,anon;
grant execute on function public.admin_dashboard_period(timestamp,timestamp,jsonb,text,integer,timestamptz) to authenticated;

create function public.admin_dashboard_window(p_from_local timestamp,p_to_local timestamp,p_bands jsonb,p_kind text,p_table integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_current jsonb;v_previous jsonb;v_previous_from timestamp;v_cutoff timestamptz:=statement_timestamp();v_options jsonb;
begin
 v_current:=public.admin_dashboard_period(p_from_local,p_to_local,p_bands,p_kind,p_table,v_cutoff);
 v_previous_from:=p_from_local-(p_to_local+interval '1 second'-p_from_local);
 v_previous:=public.admin_dashboard_period(v_previous_from,p_from_local-interval '1 second',p_bands,p_kind,p_table,v_cutoff);
 with named as (
  select b.id,b.table_no,b.paid_at,nullif(regexp_replace(b.service_label,'^[[:space:]                 　﻿]+|[[:space:]                 　﻿]+$','','g'),'') original_label,coalesce(nullif(regexp_replace(b.service_label,'^[[:space:]                 　﻿]+|[[:space:]                 　﻿]+$','','g'),''),case when b.table_no<0 then 'Mang về #'||(-b.table_no)::text else 'Bàn '||b.table_no::text end) name
  from public.bills b where b.paid_at>=v_previous_from at time zone 'Asia/Ho_Chi_Minh' and b.paid_at<(p_to_local+interval '1 second') at time zone 'Asia/Ho_Chi_Minh' and b.paid_at<=v_cutoff
 ), kinds as (select table_no,array_agg(distinct case when regexp_replace(translate(lower(name),'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžơưǎǐǒǔǖǘǚǜǟǡǧǩǫǭǰǵǹǻȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕẖẗẘẙạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ','aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzouaiouuuuuaagkoojgnaaaeeiioorruusthaeooooyabbbcdddddeeeeefghhhhhiikkkllllmmmnnnnoooopprrrrsssssttttuuuuuvvwwwwwxxyzzzhtwyaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyy'),'[̀-ͯ]','','g') ~ '^mang[[:space:]                 　﻿]+ve([^a-z0-9_]|$)' then 'takeaway' else 'dine' end) kinds from named group by table_no),
 labels as (select distinct on(table_no) table_no,original_label from named where original_label is not null order by table_no,paid_at desc,id desc),
 latest as (select distinct on(n.table_no) n.table_no table_id,coalesce(l.original_label,n.name) name,l.original_label is not null has_label from named n left join labels l on l.table_no=n.table_no order by n.table_no,n.paid_at desc,n.id desc)
 select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('kinds',k.kinds) order by l.table_id),'[]') into v_options from latest l join kinds k on k.table_no=l.table_id;
 return jsonb_build_object('version',1,'kind',p_kind,'table_id',p_table,'current',v_current,'previous',v_previous,'table_options',v_options);
end;$$;
revoke all on function public.admin_dashboard_window(timestamp,timestamp,jsonb,text,integer) from public,anon;
grant execute on function public.admin_dashboard_window(timestamp,timestamp,jsonb,text,integer) to authenticated;

-- Revision checks avoid transferring the menu/group/table catalog every minute.
create table pos_sync.catalog_revision(singleton boolean primary key default true check(singleton),revision bigint not null default 1,last_txid bigint);
insert into pos_sync.catalog_revision(singleton) values(true);
alter table pos_sync.catalog_revision enable row level security;
revoke all on pos_sync.catalog_revision from public,anon,authenticated;
grant usage on schema pos_sync to authenticated;
grant select on pos_sync.catalog_revision to authenticated;
create policy catalog_revision_read on pos_sync.catalog_revision for select to authenticated using ((select public.has_permission('orders.read')));
create function pos_sync.bump_catalog_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update pos_sync.catalog_revision set revision=revision+1,last_txid=txid_current() where singleton;
 return null;
end;$$;
revoke all on function pos_sync.bump_catalog_revision() from public,anon,authenticated;
create trigger pos_catalog_revision after insert or update or delete on public.menu_items for each statement execute function pos_sync.bump_catalog_revision();
create trigger pos_catalog_revision after insert or update or delete on public.restaurant_tables for each statement execute function pos_sync.bump_catalog_revision();
create trigger pos_catalog_revision after insert or update or delete on public.menu_groups for each statement execute function pos_sync.bump_catalog_revision();
create trigger pos_catalog_revision after insert or update or delete on public.menu_item_groups for each statement execute function pos_sync.bump_catalog_revision();
create function public.get_pos_live_snapshot_v2(p_catalog boolean default false,p_catalog_only boolean default false,p_catalog_version text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;v_catalog jsonb;v_version text;
begin
 v_result:=public.get_pos_live_snapshot(false,p_catalog_only);
 if coalesce((v_result->'access'->>'is_active')::boolean,false)=false or coalesce((v_result->'access'->>'must_change_password')::boolean,false) or coalesce((v_result->'access'->>'session_invalid')::boolean,false) then return v_result;end if;
 if coalesce(p_catalog,false) or coalesce(p_catalog_only,false) then
  select revision::text into v_version from pos_sync.catalog_revision where singleton;
  if v_version is null then raise exception 'Không xác nhận được phiên bản thực đơn.';end if;
  if p_catalog_version is not distinct from v_version then
   return v_result||jsonb_build_object('catalog_version',v_version,'catalog_unchanged',true);
  end if;
  v_catalog:=public.get_pos_live_snapshot(true,true)->'catalog';
  v_catalog:=v_catalog||jsonb_build_object('groups',public.menu_group_catalog());
  return v_result||jsonb_build_object('catalog',v_catalog,'catalog_version',v_version,'catalog_unchanged',false);
 end if;
 return v_result;
end;$$;
revoke all on function public.get_pos_live_snapshot_v2(boolean,boolean,text) from public,anon;
grant execute on function public.get_pos_live_snapshot_v2(boolean,boolean,text) to authenticated;

-- Optional capability: old frontends keep working throughout rollout.
do $patch$
declare v text;
begin
 v:=pg_get_functiondef('public.get_my_access()'::regprocedure);
 if position('''dashboard_aggregates''' in v)=0 then
  v:=regexp_replace(v,'jsonb_build_object\(','jsonb_build_object(''dashboard_aggregates'',true,''catalog_versions'',true,');execute v;
 end if;
end;$patch$;
notify pgrst,'reload schema';
commit;
