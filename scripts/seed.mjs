#!/usr/bin/env node
// Copy the example watchlist (real idealo data from 27 Nov 2026) into data/ — never overwrites.

import { cp, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, DATA_DIR, WATCHLIST } from '../lib/store.mjs';

try {
  await access(WATCHLIST);
  console.log(`${WATCHLIST} already exists — leaving your data alone.`);
} catch {
  await cp(join(ROOT, 'examples', 'data'), DATA_DIR, { recursive: true, force: false });
  await import('./ingest.mjs');
  console.log('Seeded data/ with the example watchlist.');
}
