import assert from 'node:assert/strict';
import {catalogDue,CATALOG_SYNC_MS,LIVE_SYNC_MS} from '../src/sync-policy.ts';
assert.equal(LIVE_SYNC_MS,5000);assert.equal(CATALOG_SYNC_MS,60000);assert.equal(catalogDue(1000,60999),false);assert.equal(catalogDue(1000,61000),true);assert.equal(catalogDue(0,1),true);assert.equal(catalogDue(1000,500),true);
console.log('PASS sync policy: 5s live / 60s catalog, inclusive boundary, first load and clock rollback.');
