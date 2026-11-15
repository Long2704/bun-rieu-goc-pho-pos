# POS read optimization

Full synchronization uses `get_pos_live_snapshot` when `get_my_access` advertises
`live_snapshot`. This stable SECURITY INVOKER RPC preserves existing RLS and returns
access + linked sessions + cooking orders (including paid/closed cooking orders),
plus menu/table catalog only when due or explicitly requested. Existing endpoints
remain for old clients. Only missing-function errors activate legacy compatibility;
other errors keep the UI stale/error state and retry. A failed catalog fetch clears
its freshness timestamp. No write, financial confirmation or report calculation
moves into this read RPC.

A full refresh changes three HTTP reads to one (67% fewer); a full refresh with
catalog changes five to one (80% fewer). Group-catalog reads remain separate.
Scoped order invalidations already use one delta RPC and are unchanged. These are
request reductions for those operations, not measured whole-project log MB savings.

Online/visibility reconciliation goes through the existing Realtime coordinator,
coalescing simultaneous resume/rejoin events. Events arriving during a read keep a
trailing read. Explicit post-write reads stay serialized and await fresh server data.
Full live safety remains 60 seconds with healthy channels, 5 seconds on failure.

Image ticket metadata stays in memory at the App level within one authorized user,
permission set and data epoch. Fresh view changes reuse it. Realtime/upload/manual
invalidations mark it dirty; bursts share a request; an invalidation during an
in-flight request discards its response and schedules one trailing read. Only the
active, visible Kitchen/Working view reads it. Healthy safety remains 60 seconds;
disconnected/error fallback remains 5 seconds. No interval is extended in this release.

Image completion keeps the original begin/Storage delete/final server-confirmation
sequence. Reads pause during completion; confirmed IDs prevent stale resurrection.
Metadata clears on logout, account/permission changes, reset or password recovery.
Binary private-image URLs still use the existing bounded per-view cache, disposed
when leaving the view. No business data is persisted into localStorage or a service
worker by this optimization.

## Verify

`npm run test:sync-reads`, `npm run build`; browser tests against a local dev URL:
`POS_TEST_URL=http://localhost:5198 BUNDLED_SYNC=1 node tests/realtime-flow.mjs`.
Use `BUNDLED_MISSING=1` to test old-backend fallback. All Supabase HTTP/WebSocket
traffic in browser fixtures is intercepted; SQL tests use PGlite only.

On two actual devices during normal service: send a kitchen order, edit its note,
complete it, verify the serving table; upload/complete a ticket image; switch tabs;
briefly disconnect/reconnect one device; pay and verify table release. Reload the
app at a quiet moment to receive the frontend update. No data reset is needed.

Rollback: return frontend to the prior deployment. The additive RPC and capability
are ignored by older clients, so no table/data rollback is needed.

## Additional request deduplication

Repeated manual Sync clicks while one manual batch is in flight now share that
batch. A later click starts a fresh batch; different users never share it. This
wrapper is deliberately separate from forced refreshes after mutations, so a write
still waits for its own server-confirmed fresh data. Image invalidation and group
catalog refresh run once per manual batch.

Push foreground leases no longer renew on repeated unchanged visibility/pageshow/
view events. Entering/leaving Kitchen, device/proof changes, reconnect and failed
lease retry still send their required updates. The 60-second renewal interval and
server lease duration are unchanged. A simulated 60 unchanged UI events creates
zero extra presence requests; actual saving depends on how often these events occur.
