# Admin and cashier roles

The existing Owner account becomes canonical `profiles.role = admin`. Its UUID,
username, Auth identity, password, existing sessions and historical sales remain
unchanged. Cashier stays `thu_ngan` (Cashier - Thu ngân), with its existing rights,
including menu/group editing and quantity-only reports. New `chu` profile rows
are no longer valid. Admin remains protected from employee edit/reset/delete,
and the last active Admin cannot be disabled, demoted or deleted.

## Compatibility during rollout

`current_staff_role()` and `get_my_access().role` deliberately keep the legacy
`chu` identity for Admin. Existing RLS, open browser clients and the staff-admin
Edge Function continue to work. `get_my_access().actual_role` exposes the canonical
role to updated clients. Raw profile checks in staff lifecycle RPCs use `admin`.
Do not replace all `chu` literals globally: doing so would break these callers.
A future removal of this compatibility bridge requires migrating those callers
and confirming no old clients remain.

## Self-service password change

Admin opens **Quản lý → Đổi mật khẩu** on mobile, or **Đổi mật khẩu** in desktop
navigation. The modal asks for a new password and confirmation (8 characters
minimum, 72 UTF-8 bytes maximum). It rechecks access on demand and calls
`supabase.auth.updateUser({password})`, which updates only the authenticated
user. No target ID, service key, password storage or periodic request is added.
Current session authorizes the operation; this is not a password recovery flow.
Supabase Auth enforces password policy and reauthentication requirements. If it
requires reauthentication, sign out and sign in again before retrying. Lost
responses are reported as uncertain; check the new password before retrying.

The existing employee first-login and manager-issued password-reset flows remain
unchanged. No production password is changed by the migration or automated tests.

## Verification

- `node tests/bill-table-transfer-sql.mjs`: local PostgreSQL migrations, exact
  permission parity, protected last Admin, legacy compatibility, employee create,
  edit, reset and deletion initiation; rejects retired role and unauthorized users.
- `POS_TEST_URL=http://localhost:5200 node tests/admin-role-flow.mjs`: browser
  with all Supabase HTTP/WebSockets mocked; four roles, self-only Auth payload,
  confirmation, errors, pending-request guard, no secret persistence, stale access
  denial, responsive desktop and mobile navigation.
- Existing cashier/report and staff-admin Edge tests; `npm run build`.

No extra polling or Realtime subscriptions. Each submitted password change adds
one access RPC and, if authorized, one Auth update request. Normal app use has no
additional request from this feature.
