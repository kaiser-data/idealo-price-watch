#!/usr/bin/env node
// Normalize raw idealo MCP responses saved by /price-check into data/prices.json.
//
//   data/raw/<itemId>.history.json  <- get_product_price_history response
//   data/raw/<itemId>.offers.json   <- get_product_offers response (first page is enough)
//
// Usage: node scripts/ingest.mjs            (all items in the watchlist)
//        node scripts/ingest.mjs <itemId>…  (only these)

import { join } from 'node:path';
import { DATA_DIR, PRICES, WATCHLIST, readJson, writeJson } from '../lib/store.mjs';
import { normalizeHistory, normalizeOffers } from '../lib/parse.mjs';
import { verdict } from '../lib/verdict.mjs';

const RAW = join(DATA_DIR, 'raw');
const watchlist = await readJson(WATCHLIST, { items: [] });
const prices = await readJson(PRICES, {});
const wanted = process.argv.slice(2);
const items = wanted.length ? watchlist.items.filter((i) => wanted.includes(i.id)) : watchlist.items;

if (wanted.length && items.length !== wanted.length) {
  const known = new Set(items.map((i) => i.id));
  console.error(`Unknown item id(s): ${wanted.filter((w) => !known.has(w)).join(', ')}`);
  process.exitCode = 1;
}

const report = [];
for (const item of items) {
  const rawHistory = await readJson(join(RAW, `${item.id}.history.json`), null);
  const rawOffers = await readJson(join(RAW, `${item.id}.offers.json`), null);
  if (!rawHistory && !rawOffers) {
    report.push(`- ${item.name ?? item.query}: no raw data, skipped`);
    continue;
  }
  const { history, stats } = normalizeHistory(rawHistory);
  const offers = normalizeOffers(rawOffers).slice(0, 5);
  const prev = prices[item.id];
  if (stats && offers[0] && offers[0].price < stats.current) stats.current = offers[0].price;
  prices[item.id] = { fetchedAt: new Date().toISOString(), history, stats, offers };

  const v = verdict(prices[item.id], item.targetPrice);
  const was = prev?.stats?.current;
  const delta = was && stats ? ` (was ${was.toFixed(2)})` : '';
  report.push(`- ${item.name ?? item.query}: ${stats ? stats.current.toFixed(2) : '—'}${delta} → ${v.label.toUpperCase()} — ${v.reason}`);
}

await writeJson(PRICES, prices);
console.log(`Updated ${PRICES}\n${report.join('\n')}`);
