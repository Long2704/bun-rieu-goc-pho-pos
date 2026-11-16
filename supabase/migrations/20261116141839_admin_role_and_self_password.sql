-- Canonical Admin role. Keep legacy chu wire identity for open clients and staff-admin.
-- Only profiles.role stores the canonical role; cashier permissions are unchanged.

CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('dashboard_aggregates',true,'catalog_versions',true,'live_snapshot',true,'saved_menu_selections',true,'linked_tables',true,
    'data_epoch',(select data_epoch from public.pos_runtime_settings where id),'name', p.name, 'actual_role', p.role, 'role', case when p.role = 'admin' then 'chu' else p.role end, 'is_active', p.is_active and (select public.staff_session_current()),
    'session_invalid',not (select public.staff_session_current()),
    'must_change_password', p.must_change_password,
    'permissions', (
      select coalesce(jsonb_agg(permission), '[]'::jsonb)
      from unnest(array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount', 'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload',
        'tables.transfer', 'tables.cancel', 'bills.split', 'menu.manage', 'tables.manage',
        'reports.read', 'reports.operations', 'audit.read', 'employees.manage', 'settings.manage',
        'receipts.read_own', 'receipts.read_all'
      ]::text[]) as permission
      where public.has_permission(permission)
    )
  )
  from public.profiles p where p.id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.prepare_employee_creation(p_request_id uuid, p_email text, p_staff_code text, p_name text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_creation_requests%rowtype;
 e text:=lower(btrim(p_email)); c text:=upper(btrim(p_staff_code)); n text:=btrim(p_name);
begin
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then
  raise exception 'Chỉ Admin đang hoạt động được tạo nhân viên.';
 end if;
 if p_request_id is null or e is null or char_length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or c is null or c !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' or n is null or char_length(n) not between 1 and 100
 or p_role is null or p_role not in ('phuc_vu','bep','thu_ngan') then raise exception 'Thông tin nhân viên không hợp lệ.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,27));
 select * into r from public.employee_creation_requests where request_id=p_request_id;
 if found then
  if r.owner_id<>auth.uid() or r.email<>e or r.staff_code<>c or r.name<>n or r.role<>p_role then
   raise exception 'Mã yêu cầu đã được sử dụng cho thông tin khác.';
  end if;
 else
  if exists(select 1 from public.profiles where lower(btrim(staff_code))=lower(c)) then
   raise exception 'Mã nhân viên đã tồn tại.';
  end if;
  insert into public.employee_creation_requests(request_id,owner_id,email,staff_code,name,role)
   values(p_request_id,auth.uid(),e,c,n,p_role) returning * into r;
 end if;
 return jsonb_build_object('request_id',r.request_id,'user_id',r.user_id,'completed',r.completed_at is not null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_employee_deletion(p_request_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_account_deletions%rowtype;
begin
 perform 1 from public.profiles where id=p_owner_id and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền.';end if;
 select * into r from public.employee_account_deletions where request_id=p_request_id for update;
 if not found then raise exception 'Không tìm thấy yêu cầu xóa.';end if;
 if r.completed_at is not null then return jsonb_build_object('ok',true,'completed',true);end if;
 if not exists(select 1 from auth.users where id=r.employee_id and deleted_at is not null) then return jsonb_build_object('ok',false,'pending',true);end if;
 perform 1 from public.profiles where id=r.employee_id and role in ('phuc_vu','bep','thu_ngan') and account_deletion_pending for update;
 if not found then raise exception 'Trạng thái tài khoản đã thay đổi.';end if;
 delete from auth.sessions where user_id=r.employee_id;
 update public.profiles set is_active=false,account_deletion_pending=false,deleted_at=clock_timestamp(),staff_sessions_revoked_before=clock_timestamp() where id=r.employee_id;
 update public.employee_account_deletions set completed_at=now(),completed_by=p_owner_id where request_id=p_request_id;
 insert into public.audit_log(type,user_id,extra) values('employee_deleted',p_owner_id,jsonb_build_object('employee_id',r.employee_id,'request_id',p_request_id));
 return jsonb_build_object('ok',true,'completed',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_employees(p_search text DEFAULT ''::text, p_role text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if p_role = 'chu' then p_role := 'admin'; end if;
  if auth.uid() is null
     or public.current_staff_role() is distinct from 'chu'
     or not public.has_permission('employees.manage') then
    raise exception 'Chỉ Admin đang hoạt động được xem danh sách nhân viên.';
  end if;

  if char_length(v_search) > 100 then
    raise exception 'Tìm kiếm tối đa 100 ký tự.';
  end if;
  if p_role is not null and p_role not in ('admin', 'phuc_vu','bep','thu_ngan') then
    raise exception 'Vai trò lọc không hợp lệ.';
  end if;
  if p_page is null or p_page < 1
     or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception 'Phân trang không hợp lệ.';
  end if;

  -- Số dòng và trang dữ liệu dùng cùng snapshot. Không đọc auth.users/email.
  with filtered as materialized (
    select p.id, p.name, p.staff_code, p.role, p.is_active, p.created_at, p.staff_version, p.username, p.password_reset_pending, p.account_deletion_pending
    from public.profiles p
    where p.deleted_at is null and (p_role is null or p.role = p_role)
      and (p_active is null or p.is_active = p_active)
      and (
        v_search = ''
        or strpos(lower(p.name), lower(v_search)) > 0
        or strpos(p.username, lower(v_search)) > 0
      )
  ), page_rows as (
    select * from filtered
    order by created_at desc, id desc
    limit p_page_size
    offset ((p_page::bigint - 1) * p_page_size)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc)
      from page_rows r
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', p_page,
    'page_size', p_page_size
  ) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_employee_deletion(p_request_id uuid, p_employee_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_account_deletions%rowtype;p public.profiles%rowtype;
begin
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then raise exception 'Chỉ Admin đang hoạt động được xóa tài khoản.';end if;
 perform 1 from public.profiles where id=auth.uid() and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền.';end if;
 if p_request_id is null or p_employee_id is null or p_expected_version is null or p_expected_version<1 then raise exception 'Yêu cầu không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,32));
 select * into r from public.employee_account_deletions where request_id=p_request_id;
 if found then
  if r.employee_id<>p_employee_id or r.expected_version<>p_expected_version then raise exception 'Mã yêu cầu đã dùng cho thông tin khác.';end if;
  return public.get_employee_deletion(p_employee_id,p_request_id);
 end if;
 select * into p from public.profiles where id=p_employee_id for update;
 if not found or p.role not in ('phuc_vu','bep','thu_ngan') or p.id=auth.uid() then raise exception 'Chỉ xóa Waiter hoặc Kitchen, không xóa Admin.';end if;
 select * into r from public.employee_account_deletions where employee_id=p_employee_id order by created_at desc limit 1;
 if found then return public.get_employee_deletion(p_employee_id,r.request_id)||jsonb_build_object('conflict',true);end if;
 if p.password_reset_pending then raise exception 'Hoàn tất đặt lại mật khẩu trước khi xóa tài khoản.';end if;
 if p.staff_version<>p_expected_version then raise exception 'Thông tin nhân viên đã thay đổi. Tải lại danh sách.';end if;
 insert into public.employee_account_deletions(request_id,employee_id,owner_id,expected_version) values(p_request_id,p_employee_id,auth.uid(),p_expected_version);
 update public.profiles set is_active=false,account_deletion_pending=true,staff_sessions_revoked_before=clock_timestamp() where id=p_employee_id;
 delete from auth.sessions where user_id=p_employee_id;
 insert into public.audit_log(type,user_id,extra) values('employee_deletion_started',auth.uid(),jsonb_build_object('employee_id',p_employee_id,'request_id',p_request_id));
 return public.get_employee_deletion(p_employee_id,p_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_employee_password_reset(p_request_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_password_resets%rowtype;
begin
 perform 1 from public.profiles where id=p_owner_id and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền.';end if;
 select * into r from public.employee_password_resets where request_id=p_request_id for update;
 if not found then raise exception 'Không tìm thấy yêu cầu đặt lại.';end if;
 if r.completed_at is not null then return jsonb_build_object('ok',true,'completed',true);end if;
 perform 1 from public.profiles where id=r.employee_id and role in ('phuc_vu','bep','thu_ngan') and password_reset_pending for update;
 if not found then raise exception 'Trạng thái đặt lại đã thay đổi. Cần kiểm tra.';end if;
 delete from auth.sessions where user_id=r.employee_id;
 update public.profiles set password_reset_pending=false,must_change_password=true,is_active=r.was_active,staff_sessions_revoked_before=clock_timestamp() where id=r.employee_id;
 update public.employee_password_resets set completed_at=now(),completed_by=p_owner_id where request_id=p_request_id;
 insert into public.audit_log(type,user_id,extra) values('employee_password_reset',p_owner_id,jsonb_build_object('employee_id',r.employee_id,'request_id',p_request_id));
 return jsonb_build_object('ok',true,'completed',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_employee_password_reset(p_request_id uuid, p_employee_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_password_resets%rowtype;p public.profiles%rowtype;
begin
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then raise exception 'Chỉ Admin đang hoạt động được đặt lại mật khẩu.';end if;
 perform 1 from public.profiles where id=auth.uid() and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền.';end if;
 if p_request_id is null or p_employee_id is null or p_expected_version is null or p_expected_version<1 then raise exception 'Yêu cầu không hợp lệ.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,30));
 select * into r from public.employee_password_resets where request_id=p_request_id;
 if found then
  if r.employee_id<>p_employee_id or r.expected_version<>p_expected_version then raise exception 'Mã yêu cầu đã dùng cho thông tin khác.';end if;
  if r.completed_at is null then
   perform 1 from public.profiles where id=p_employee_id and role in ('phuc_vu','bep','thu_ngan') and password_reset_pending for update;
   if not found then raise exception 'Trạng thái đặt lại đã thay đổi.';end if;
  end if;
  return public.get_employee_password_reset(p_employee_id,p_request_id);
 end if;
 select * into p from public.profiles where id=p_employee_id for update;
 if not found or p.role not in ('phuc_vu','bep','thu_ngan') or p.id=auth.uid() then raise exception 'Chỉ đặt lại mật khẩu cho Waiter hoặc Kitchen, không áp dụng Admin.';end if;
 select * into r from public.employee_password_resets where employee_id=p_employee_id and completed_at is null;
 if found then return public.get_employee_password_reset(p_employee_id,r.request_id)||jsonb_build_object('conflict',true);end if;
 if p.staff_version<>p_expected_version then raise exception 'Thông tin nhân viên đã thay đổi. Tải lại danh sách.';end if;
 insert into public.employee_password_resets(request_id,employee_id,owner_id,expected_version,was_active)
 values(p_request_id,p_employee_id,auth.uid(),p_expected_version,p.is_active);
 update public.profiles set is_active=false,must_change_password=true,password_reset_pending=true,staff_sessions_revoked_before=clock_timestamp() where id=p_employee_id;
 delete from auth.sessions where user_id=p_employee_id;
 insert into public.audit_log(type,user_id,extra) values('employee_password_reset_started',auth.uid(),jsonb_build_object('employee_id',p_employee_id,'request_id',p_request_id));
 return public.get_employee_password_reset(p_employee_id,p_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_employee_password_attempt(p_request_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_password_resets%rowtype;v_attempt uuid;
begin
 perform 1 from public.profiles where id=p_owner_id and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền.';end if;
 select * into r from public.employee_password_resets where request_id=p_request_id for update;
 if not found then raise exception 'Không tìm thấy yêu cầu.';end if;
 if r.completed_at is not null then return jsonb_build_object('completed',true);end if;
 insert into public.employee_password_attempts(request_id,employee_id) values(r.request_id,r.employee_id) returning attempt_id into v_attempt;
 return jsonb_build_object('attempt_id',v_attempt);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_employee_creation(p_request_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_creation_requests%rowtype; a record;
begin
 select * into r from public.employee_creation_requests where request_id=p_request_id for update;
 if not found then raise exception 'Không tìm thấy yêu cầu cấp tài khoản.';end if;
 select id,email,coalesce(encrypted_password,'')<>'' as has_password,raw_app_meta_data->>'pos_employee_request' as request_marker
 into a from auth.users where id=p_user_id;
 if not found then raise exception 'Không tìm thấy tài khoản Auth.';end if;
 if r.completed_at is not null then
  if r.user_id=p_user_id and exists(select 1 from public.profiles where id=p_user_id) then return true;end if;
  raise exception 'Yêu cầu đã liên kết tài khoản khác hoặc thiếu hồ sơ.';
 end if;
 if lower(a.email) is distinct from r.email or a.request_marker is distinct from r.request_id::text then raise exception 'Tài khoản Auth không khớp yêu cầu cấp.';end if;
 -- Khi Auth chưa ghi mật khẩu, chờ sự kiện UPDATE kế tiếp.
 if not a.has_password then return false;end if;
 perform 1 from public.profiles where id=r.owner_id and role='admin' and is_active and not must_change_password and not password_reset_pending for share;
 if not found then raise exception 'Admin không còn quyền cấp tài khoản.';end if;
 if exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Tài khoản đã có hồ sơ; không ghi đè.';end if;
 insert into public.profiles(id,name,staff_code,role,is_active,must_change_password,username,staff_initial_auth_txid)
 values(p_user_id,r.name,r.staff_code,r.role,true,true,coalesce(r.username,'nv_'||replace(p_user_id::text,'-','')),txid_current());
 insert into public.audit_log(type,user_id,extra) values('employee_created',r.owner_id,jsonb_build_object('employee_id',p_user_id,'username',coalesce(r.username,'nv_'||replace(p_user_id::text,'-','')),'role',r.role,'request_id',r.request_id));
 update public.employee_creation_requests set user_id=p_user_id,completed_at=now() where request_id=r.request_id;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_employee_account(p_request_id uuid, p_employee_id uuid, p_expected_version integer, p_name text, p_username text, p_role text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_row public.profiles%rowtype; new_row public.profiles%rowtype;
 r public.employee_update_requests%rowtype;
 n text:=btrim(p_name); c text:=lower(btrim(p_username));
 v_payload jsonb; v_result jsonb; v_type text;
begin
 -- Cả kiểm tra lẫn replay đều phải có Admin còn hoạt động.
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then raise exception 'Chỉ Admin đang hoạt động được quản lý nhân viên.';end if;
 perform 1 from public.profiles where id=auth.uid() and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền quản lý nhân viên.';end if;
 if p_request_id is null or p_employee_id is null or p_expected_version is null or p_expected_version<1
 or n is null or char_length(n) not between 1 and 100
 or c is null or c !~ '^[a-z0-9][a-z0-9_.-]{2,39}$'
 or p_role is null or p_role not in ('phuc_vu','bep','thu_ngan') or p_is_active is null then raise exception 'Thông tin nhân viên không hợp lệ.';end if;
 v_payload:=jsonb_build_object('action','update_account','employee_id',p_employee_id,'version',p_expected_version,'name',n,'username',c,'role',p_role,'is_active',p_is_active);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,28));
 select * into r from public.employee_update_requests where request_id=p_request_id;
 if found then
  if r.owner_id<>auth.uid() or r.payload<>v_payload then raise exception 'Mã yêu cầu đã được sử dụng cho thông tin khác.';end if;
  return r.result;
 end if;
 select * into old_row from public.profiles where id=p_employee_id for update;
 if not found then raise exception 'Không tìm thấy nhân viên.';end if;
 if old_row.role not in ('phuc_vu','bep','thu_ngan') or old_row.id=auth.uid() then raise exception 'Không được sửa, đổi quyền hoặc khóa Admin hay tài khoản vai trò cũ tại đây.';end if;
 if old_row.staff_version<>p_expected_version then raise exception 'Thông tin nhân viên đã thay đổi. Đóng cửa sổ và tải lại danh sách trước khi sửa.';end if;
 if exists(select 1 from public.employee_creation_requests where username=c and (user_id is null or user_id<>p_employee_id)) then
  raise exception 'Tên đăng nhập đã được sử dụng hoặc đang được tạo.';
 end if;
 update public.profiles set name=n,username=c,role=p_role,is_active=p_is_active where id=p_employee_id returning * into new_row;
 v_result:=jsonb_build_object('ok',true,'employee_id',new_row.id,'staff_version',new_row.staff_version);
 v_type:=case when old_row.is_active and not new_row.is_active then 'employee_locked' when not old_row.is_active and new_row.is_active then 'employee_unlocked' else 'employee_updated' end;
 insert into public.audit_log(type,user_id,extra) values(v_type,auth.uid(),jsonb_build_object('employee_id',new_row.id,'request_id',p_request_id,
  'before',jsonb_build_object('name',old_row.name,'username',old_row.username,'role',old_row.role,'is_active',old_row.is_active),
  'after',jsonb_build_object('name',new_row.name,'username',new_row.username,'role',new_row.role,'is_active',new_row.is_active)));
 insert into public.employee_update_requests(request_id,owner_id,employee_id,payload,result) values(p_request_id,auth.uid(),p_employee_id,v_payload,v_result);
 return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_employee_account(p_request_id uuid, p_username text, p_name text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u text:=lower(btrim(p_username)); r public.employee_creation_requests%rowtype; v_result jsonb;
begin
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then raise exception 'Chỉ Admin đang hoạt động được tạo nhân viên.';end if;
 if u is null or u !~ '^[a-z0-9][a-z0-9_.-]{2,39}$' or p_request_id is null then raise exception 'Tên đăng nhập cần 3–40 ký tự, gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u,29));
 select * into r from public.employee_creation_requests where request_id=p_request_id;
 if found and r.username is distinct from u then raise exception 'Mã yêu cầu đã được sử dụng cho thông tin khác.';end if;
 if exists(select 1 from public.profiles where username=u and (r.user_id is null or id<>r.user_id)) then raise exception 'Tên đăng nhập đã được sử dụng.';end if;
 v_result:=public.prepare_employee_creation(p_request_id,p_request_id::text||'@staff.pos.invalid',upper(replace(p_request_id::text,'-','')),p_name,p_role);
 update public.employee_creation_requests set username=u where request_id=p_request_id;
 return v_result||jsonb_build_object('username',u);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_employee(p_request_id uuid, p_employee_id uuid, p_expected_version integer, p_name text, p_staff_code text, p_role text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_row public.profiles%rowtype; new_row public.profiles%rowtype;
 r public.employee_update_requests%rowtype;
 n text:=btrim(p_name); c text:=upper(btrim(p_staff_code));
 v_payload jsonb; v_result jsonb; v_type text;
begin
 -- Cả kiểm tra lẫn replay đều phải có Admin còn hoạt động.
 if public.current_staff_role() is distinct from 'chu' or not public.has_permission('employees.manage') then raise exception 'Chỉ Admin đang hoạt động được quản lý nhân viên.';end if;
 perform 1 from public.profiles where id=auth.uid() and role='admin' and is_active and not must_change_password for share;
 if not found then raise exception 'Admin không còn quyền quản lý nhân viên.';end if;
 if p_request_id is null or p_employee_id is null or p_expected_version is null or p_expected_version<1
 or n is null or char_length(n) not between 1 and 100
 or c is null or c !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
 or p_role is null or p_role not in ('phuc_vu','bep','thu_ngan') or p_is_active is null then raise exception 'Thông tin nhân viên không hợp lệ.';end if;
 v_payload:=jsonb_build_object('employee_id',p_employee_id,'version',p_expected_version,'name',n,'staff_code',c,'role',p_role,'is_active',p_is_active);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,28));
 select * into r from public.employee_update_requests where request_id=p_request_id;
 if found then
  if r.owner_id<>auth.uid() or r.payload<>v_payload then raise exception 'Mã yêu cầu đã được sử dụng cho thông tin khác.';end if;
  return r.result;
 end if;
 select * into old_row from public.profiles where id=p_employee_id for update;
 if not found then raise exception 'Không tìm thấy nhân viên.';end if;
 if old_row.role not in ('phuc_vu','bep','thu_ngan') or old_row.id=auth.uid() then raise exception 'Không được sửa, đổi quyền hoặc khóa Admin hay tài khoản vai trò cũ tại đây.';end if;
 if old_row.staff_version<>p_expected_version then raise exception 'Thông tin nhân viên đã thay đổi. Đóng cửa sổ và tải lại danh sách trước khi sửa.';end if;
 if exists(select 1 from public.employee_creation_requests where lower(staff_code)=lower(c) and (user_id is null or user_id<>p_employee_id)) then
  raise exception 'Mã nhân viên đã được sử dụng hoặc đang được tạo.';
 end if;
 update public.profiles set name=n,staff_code=c,role=p_role,is_active=p_is_active where id=p_employee_id returning * into new_row;
 v_result:=jsonb_build_object('ok',true,'employee_id',new_row.id,'staff_version',new_row.staff_version);
 v_type:=case when old_row.is_active and not new_row.is_active then 'employee_locked' when not old_row.is_active and new_row.is_active then 'employee_unlocked' else 'employee_updated' end;
 insert into public.audit_log(type,user_id,extra) values(v_type,auth.uid(),jsonb_build_object('employee_id',new_row.id,'request_id',p_request_id,
  'before',jsonb_build_object('name',old_row.name,'staff_code',old_row.staff_code,'role',old_row.role,'is_active',old_row.is_active),
  'after',jsonb_build_object('name',new_row.name,'staff_code',new_row.staff_code,'role',new_row.role,'is_active',new_row.is_active)));
 insert into public.employee_update_requests(request_id,owner_id,employee_id,payload,result) values(p_request_id,auth.uid(),p_employee_id,v_payload,v_result);
 return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with role_permissions(role, permissions) as (
    values
      ('thu_ngan', array['orders.read','orders.create','orders.cancel','payments.collect','payments.discount','tables.transfer','tables.cancel','bills.split','menu.manage','tables.manage','reports.operations','receipts.read_own','receipts.read_all']::text[]),
      ('admin', array[
        'orders.read', 'orders.create', 'orders.cancel',
        'payments.collect', 'payments.discount',
        'kitchen.complete', 'kitchen_images.read', 'kitchen_images.upload', 'tables.transfer', 'tables.cancel', 'bills.split',
        'menu.manage', 'tables.manage', 'reports.read', 'reports.operations', 'audit.read',
        'employees.manage', 'settings.manage',
        'receipts.read_own', 'receipts.read_all'
      ]::text[]),
      ('phuc_vu', array[
        'orders.read', 'orders.create', 'orders.cancel', 'payments.collect',
        'tables.transfer', 'tables.cancel', 'bills.split', 'receipts.read_own'
      ]::text[]),
      ('bep', array[
        'orders.read', 'orders.create', 'payments.collect',
        'tables.transfer', 'tables.cancel', 'bills.split', 'receipts.read_own',
        'kitchen.complete', 'kitchen_images.read'
      ]::text[])
  )
  select exists (
    select 1
    from public.profiles p
    join role_permissions r on r.role = p.role
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.must_change_password = false
      and (select public.staff_session_current())
      and p_permission = any(r.permissions)
  );
$function$;

CREATE OR REPLACE FUNCTION public.protect_last_active_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.role not in ('chu','admin') or not old.is_active then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.role = 'admin' and new.is_active then return new; end if;
  end if;
  update public.owner_access_guard set revision = revision + 1 where id = true;
  if not found then raise exception 'Thiếu dữ liệu bảo vệ Admin.'; end if;
  if not exists (
    select 1 from public.profiles
    where role = 'admin' and is_active = true and id <> old.id
  ) then
    raise exception 'Không thể khóa, hạ quyền hoặc xóa Admin hoạt động cuối cùng.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when role = 'admin' then 'chu' else role end from public.profiles
  where id = (select auth.uid())
    and is_active = true
    and must_change_password = false
    and (select public.staff_session_current());
$function$;


alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','phuc_vu','bep','thu_ngan')) not valid;
alter table public.profiles drop constraint profiles_owner_password_ready;
alter table public.profiles add constraint profiles_owner_password_ready
  check (role <> 'admin' or must_change_password = false) not valid;
-- Preserve Auth user IDs, names, usernames, sessions and all historical references.
update public.profiles set role = 'admin' where role = 'chu';
alter table public.profiles validate constraint profiles_role_check;
alter table public.profiles validate constraint profiles_owner_password_ready;
