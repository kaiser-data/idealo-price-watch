import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePrice, normalizeHistory, normalizeOffers, productIdFromUrl } from '../lib/parse.mjs';
import { verdict, weekTrend } from '../lib/verdict.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../examples/data/raw/${name}`, import.meta.url)));

test('parsePrice handles German, English and junk input', () => {
  assert.equal(parsePrice('198,99 €'), 198.99);
  assert.equal(parsePrice('1.234,56 €'), 1234.56);
  assert.equal(parsePrice('£1,299.00'), 1299);
  assert.equal(parsePrice('0,00 €'), 0);
  assert.equal(parsePrice(42.5), 42.5);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice('n/a'), null);
});

test('productIdFromUrl extracts the idealo id', () => {
  assert.equal(productIdFromUrl('https://www.idealo.de/preisvergleich/OffersOfProduct/201952086_-wh-1000xm5-black-sony.html'), '201952086');
  assert.equal(productIdFromUrl('https://example.com'), null);
});

test('normalizeHistory reads a real price-history response', () => {
  const { history, stats } = normalizeHistory(fixture('airpods.history.json'));
  assert.equal(history.length, 31);
  assert.deepEqual(stats && [stats.current, stats.min, stats.max, stats.avg], [169.99, 163.99, 206.99, 194.88]);
  assert.ok(Date.parse(history[0].t) < Date.parse(history.at(-1).t));
});

test('normalizeHistory tolerates null and empty responses', () => {
  assert.deepEqual(normalizeHistory({ priceTrend: null }), { history: [], stats: null });
  assert.deepEqual(normalizeHistory(null), { history: [], stats: null });
});

test('normalizeOffers sorts by total price including shipping', () => {
  const offers = normalizeOffers({
    offers: [
      { price: '100,00 €', minShippingCost: '9,99 €', shop: { name: 'A' } },
      { price: '105,00 €', minShippingCost: '0,00 €', shop: { name: 'B' } },
      { price: 'broken', shop: { name: 'C' } },
    ],
  });
  assert.deepEqual(offers.map((o) => [o.shop, o.total]), [['B', 105], ['A', 109.99]]);
});

const series = (prices) => ({
  history: prices.map((p, i) => ({ t: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(), p })),
  stats: { current: prices.at(-1), min: Math.min(...prices), max: Math.max(...prices), avg: prices.reduce((a, b) => a + b) / prices.length },
});

test('verdict: target hit → buy', () => {
  assert.equal(verdict(series([200, 200, 200, 180]), 185).action, 'buy');
});

test('verdict: at the 30-day low → buy', () => {
  assert.equal(verdict(series([220, 210, 200, 190]), null).action, 'buy');
});

test('verdict: well below average but above low → deal', () => {
  const v = verdict(series([150, 220, 220, 220, 220, 220, 220, 220, 190]), null);
  assert.equal(v.action, 'deal');
});

test('verdict: above average → wait', () => {
  const v = verdict(series([180, 180, 180, 180, 180, 180, 180, 200]), null);
  assert.equal(v.action, 'wait');
});

test('verdict: no data → unknown', () => {
  assert.equal(verdict(null).action, 'unknown');
  assert.equal(verdict({ history: [], stats: null }).action, 'unknown');
});

test('weekTrend compares now with 7 days ago', () => {
  const s = series([100, 100, 100, 100, 100, 100, 100, 100, 90]);
  assert.equal(Math.round(weekTrend(s.history)), -10);
});

test('real fixtures produce sensible verdicts', () => {
  const airpods = normalizeHistory(fixture('airpods.history.json'));
  assert.equal(verdict(airpods, 175).action, 'buy'); // 169.99 ≤ target 175
  const sw = normalizeHistory(fixture('switch2.history.json'));
  assert.equal(verdict(sw, null).action, 'wait'); // 439.99, low was 399.90
});
