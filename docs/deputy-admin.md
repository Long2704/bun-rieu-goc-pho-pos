# Admin phụ (`admin_phu`)

The production account `admin2` uses the canonical role `admin_phu`. Its permissions equal the main Admin set except `orders.cancel` and `tables.cancel`. These checks run in the existing cancellation RPCs, so both pending and completed food/drink lines are protected. Reducing a persisted draft quantity is also rejected; editing unsaved cart selections remains available.

All other Admin capabilities remain: full financial reports/exports, invoices, payments/discounts, kitchen/drink completion, kitchen image upload, menu/groups/prices, table/bill operations, audit, employee administration and self-service password change. Employee-management actor locks accept both Admin roles; protected Admin targets and existing last-primary-Admin safeguards remain intact. The employee role picker still creates ordinary operational roles only, preventing self-escalation.

`get_my_access()` exposes `actual_role: admin_phu` with legacy `role: chu` for existing RPC/Edge integrations. New frontend clients use canonical identity and server permissions. No financial records are changed by the migration.

Temporary passwords are not stored in this repository. A deputy can be required to complete the existing first-login password setup; the Auth password trigger clears that flag only after a password update.

Validation:

- `npm run build`
- `node tests/bill-table-transfer-sql.mjs` (includes `support/deputy-admin.mjs`)
- `POS_TEST_URL=http://localhost:5199 node tests/admin-role-flow.mjs`
- `POS_TEST_URL=http://localhost:5199 node tests/deputy-admin-flow.mjs`
- `node tests/staff-admin-auth.mjs` and `node tests/staff-admin-create.mjs`
