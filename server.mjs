#!/usr/bin/env node
// Zero-dependency local server: static UI + a tiny JSON API over data/*.json.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, PRICES, WATCHLIST, readJson, writeJson } from './lib/store.mjs';
import { verdict } from './lib/verdict.mjs';

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '127.0.0.1';
const PUBLIC = join(ROOT, 'public');
const COUNTRIES = new Set(['DE', 'AT', 'GB', 'UK', 'FR', 'IT', 'ES']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function parseTarget(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw Object.assign(new Error('Target price must be a positive number'), { status: 400 });
  return Math.round(n * 100) / 100;
}

async function state() {
  const { items } = await readJson(WATCHLIST, { items: [] });
  const prices = await readJson(PRICES, {});
  return {
    items: items.map((item) => ({ ...item, prices: prices[item.id] ?? null, verdict: verdict(prices[item.id], item.targetPrice) })),
  };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'items', id?]
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, await state());

  if (parts[1] !== 'items') return send(res, 404, { error: 'Not found' });
  const list = await readJson(WATCHLIST, { items: [] });

  if (req.method === 'POST' && parts.length === 2) {
    const b = await body(req);
    const query = String(b.query ?? '').trim().slice(0, 200);
    if (!query) return send(res, 400, { error: 'Enter a product name' });
    const country = String(b.country ?? 'DE').toUpperCase();
    if (!COUNTRIES.has(country)) return send(res, 400, { error: 'Unknown marketplace' });
    const item = { id: randomUUID().slice(0, 8), query, name: null, variant: null, country, productRef: null, url: null, imageUrl: null, targetPrice: parseTarget(b.targetPrice), addedAt: new Date().toISOString() };
    list.items.push(item);
    await writeJson(WATCHLIST, list);
    return send(res, 201, item);
  }

  const idx = list.items.findIndex((i) => i.id === parts[2]);
  if (parts.length !== 3 || idx === -1) return send(res, 404, { error: 'Item not found' });

  if (req.method === 'PATCH') {
    const b = await body(req);
    if ('targetPrice' in b) list.items[idx].targetPrice = parseTarget(b.targetPrice);
    await writeJson(WATCHLIST, list);
    return send(res, 200, list.items[idx]);
  }
  if (req.method === 'DELETE') {
    const [removed] = list.items.splice(idx, 1);
    await writeJson(WATCHLIST, list);
    return send(res, 200, removed);
  }
  return send(res, 405, { error: 'Method not allowed' });
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, err.status ?? 500, { error: err.status ? err.message : 'Server error' });
  }
});

server.listen(PORT, HOST, () => console.log(`Price Watch running at http://${HOST}:${PORT}`));
