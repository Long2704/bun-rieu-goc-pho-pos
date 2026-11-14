# Reduce redundant POS reads

Scope: frontend synchronization only. No schema, sales, reporting calculations, push heartbeat, permission enforcement or retention changes.

## Baseline

Read-only Supabase aggregate logs, rolling 24 hours on 14 November 2026 (not a calendar-day total): 44,203 edge log entries, including 20,809 get_my_access requests, 3,817 orders reads, 3,811 linked snapshots, 2,898 menu reads, 2,892 table reads and 2,646 group catalog reads. Request counts are not log bytes.

## Changes

- Healthy orders and catalog Realtime channels: remove the five-second permission-only read. Keep a complete safety refresh every 60 seconds; failed reads or disconnected channels retain the five-second fallback while visible.
- Hidden documents: suspend periodic HTTP reads and Realtime-triggered refreshes. Retain dirty events and affected session IDs, refresh on return. Existing in-flight requests may finish; WebSocket connections and kitchen push foreground leases are unchanged.
- Saved-item edits/cancellations/takeaway changes and kitchen completion: fetch one affected session using the existing validated delta RPC. Invalid IDs, unsupported profiles, failed or malformed deltas fall back to a full refresh. Server-confirmed writes still govern success; financial and group/table operations retain their existing refresh paths.
- Coalesce concurrent menu-group reads. An explicit invalidation arriving during a read schedules a trailing fresh read; automatic refreshes reuse the in-flight request. Sequence and identity guards prevent stale replies after logout/re-login.

## Expected savings and limits

Permission checks for a healthy, visible, idle client decrease from roughly 720/hour to 60/hour (91.7% fewer checks). This is not a 91.7% reduction of total Log Ingestion. Other endpoints, writes, server logs and push workers still generate logs. Scoped post-edit refresh replaces multiple broad reads with one RPC when supported. Hidden-client automatic reads pause, but Realtime traffic may continue. No extra channels are introduced.

Already-ingested usage is not removed. Compare the next 24–48 hours under similar business activity to establish actual MB/day savings; do not estimate GB directly from request counts. Access changes can take up to the next safety read to appear in idle UI; server authorization remains enforced on operations.

## Verification

Run tests/sync-read-policy.mjs, tests/realtime-coordinator.mjs, tests/realtime-flow.mjs, tests/item-takeaway-flow.mjs, tests/menu-groups-flow.mjs, tests/payment-flow.mjs and tests/save-selection-latency-flow.mjs against the dev server. Browser fixtures mock Supabase HTTP and WebSockets, avoiding production transactions and push. Realtime coverage includes hidden/resume, missed-event safety, disconnect fallback, malformed delta fallback, concurrent invalidations, manual sync, local save and same-user re-login.
