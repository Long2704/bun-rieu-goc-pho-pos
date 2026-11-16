# Supabase usage optimization

## Report queries

Admin reports use `admin_dashboard_window` when `get_my_access` advertises
`dashboard_aggregates`. PostgreSQL computes the current and equal-length previous
period, days, slots, product quantities/gross, table totals and distinct visits.
The RPC uses SECURITY INVOKER/RLS and checks `reports.read`. Cashier keeps its
separate quantity-only API and cannot call the financial aggregate API.

Zero days/slots are omitted on the wire and reconstructed in the client only when
`sparse: true`; all totals, day/slot scope, product totals and table totals are
validated before display. This also avoids sending hundreds of empty day/slot rows
for a year-long selection. All date boundaries, inclusive final second, discounts,
cash/transfer, table/name filters and split-bill visit rules match the prior JS
model. Unicode/diacritic takeaway classification and last nonempty label fallback
are preserved. No sale timestamps, amounts, retention or write RPCs are changed.

Initial report views and filter changes do not download raw invoice rows. Excel
still uses the existing workbook implementation and loads the selected period's
invoice detail only on demand, bounded by the aggregate's server timestamp. Its
existing total reconciliation rejects a stale/partial export rather than silently
producing a different file. Logout/unmount aborts pending export reads/download.
Menu prices are fetched at export time as before. Financial aggregation uses more
server computation and substantially less response data for normal sales volumes.
The existing paid_at and bill_items.bill_id indexes support these reads.

Three rapid filter changes in the browser fixture produce one final request.
Filters wait 350 ms; explicit submit cancels that timer and runs immediately.
Older requests are aborted, hidden-view timers are canceled, and stale results
cannot be used for export. Date-range submit behavior and report layout remain.

## Catalog

A private, RLS-protected singleton revision advances after each statement modifying
menu items, tables, groups or item-group assignments. Only catalog writes update
it; order/payment writes do not. The private trigger cannot be called by API users.

`get_pos_live_snapshot_v2` preserves the original order/access snapshot and checks
the revision only when the catalog is due. Unchanged catalog replies carry the
version instead of menu/table/group payloads; changed replies include all three.
The app accepts that group snapshot instead of issuing a separate group request.
Explicit refresh and catalog invalidations request fresh content. Full safety stays
60 seconds, failure fallback stays 5 seconds. Frequent scoped updates cannot defer
that complete safety read. Missing v2 endpoints fall back to the existing APIs and
resume legacy group reads; reload/login clears the compatibility/cache state.

Caches are within the authorized App scope and clear on login/reload/data epoch.
No financial/catalog cache is persisted into localStorage or a service worker.

## Invoice history and retention settings

Admin and Cashier history initially renders 10 invoices. Each query fetches at most
11 rows (10 plus a next-page sentinel). Next pages use the full `(paid_at,id)` cursor,
keeping PostgreSQL timestamp precision and deterministic descending order. A new
invoice arriving at the front does not shift/duplicate older pages. Failed next
pages preserve existing rows and allow retry. Explicit reload starts at the newest
page; invoice access/detail and data retention remain unchanged.

Retention settings load on first expansion of their existing details section,
not merely because the Dashboard component rendered. No retention schedule changes.

## Log Query operating practice

The app does not poll/read Supabase operational logs. When support needs logs:
start with cached evidence, code, usage metadata and local/mocked tests; query a
single 5–15 minute window with service/endpoint filters only if still necessary.
Do not repeatedly scan 24-hour windows or poll the logs API. Reuse the result.
Tests intercept Supabase HTTP and WebSockets to avoid creating real sales or live
log traffic. This reduces diagnostic Log Query growth; it does not erase past use.

## Verification and rollout

Run build, `tests/bill-table-transfer-sql.mjs`, `admin-aggregated-flow.mjs`,
`catalog-version-flow.mjs`, `invoice-pagination-flow.mjs`, and `cashier-flow.mjs`
against a test server via `POS_TEST_URL`. SQL fixtures run locally in PGlite;
browser fixtures intercept HTTP/WebSocket. The SQL suite compares actual invoker
RPC output to the original JS model for totals, previous period, zero days, custom
bands, split visits, discounts, mixed methods, Unicode names and denied roles.

A 601-invoice browser fixture used 194,515 bytes of detailed invoice JSON versus
3,698 bytes of aggregate JSON (about 98% less). This is a fixture measurement, not
a measured reduction in production egress or project-wide Log Ingestion.

Apply the additive migration, verify access/RLS and summary reconciliation using
read-only production checks, then deploy frontend. Existing clients ignore the
capability flags and keep working. Roll back the frontend first if needed; leave
the additive APIs/table/triggers in place until a separately reviewed cleanup.
