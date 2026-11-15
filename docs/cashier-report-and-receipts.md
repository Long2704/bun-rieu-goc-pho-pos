# Cashier reports and invoice history

Requested behavior:
- Remove Current Operations section and its Refresh button from Owner and Cashier reports. It used existing live state, not a dedicated request; removing it only avoids manual refreshes there. Normal service/kitchen synchronization is unchanged.
- Rename Cashier report navigation/title to Báo cáo. Keep its quantity-only data/report permissions.
- Cashier uses the same recent-invoice list as Owner (30 most recent), can open older own and other staff invoices including amounts and line items. Existing seven-day data retention is unchanged.
- Remove CSV buttons on both reports; keep the existing Excel export for all selected time bands. No report aggregation/date calculation changes.

The additive migration grants receipts.read_all only to the existing cashier permission row, preserving active/password/session checks. Removing the cashier-only restrictive latest-receipt policy lets the existing bills and bill_items policies apply exactly as for Owner. Waiter/Kitchen own-receipt access is unchanged; cashier still cannot call financial report APIs or manage staff. No sales rows or accounts are changed.

Invoice history loads on demand when opened/reloaded, not by polling. Its payload can be larger than the prior single-receipt list (up to 30 entries). Export CSV previously worked locally, so removing it does not directly reduce Supabase request usage.

Validation: production build, mocked Owner/Cashier report and Excel flows, cashier invoice list/detail, PGlite real payment and RLS coverage for older own/other cashier receipts plus inactive/password/revoked session and other-role restrictions. No live test sales.

Rollback: remove receipts.read_all from the cashier role permission array, restore cashier_receipt_scope from the backup, and return frontend to the preceding deployment.
