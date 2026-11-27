const $ = (sel, root = document) => root.querySelector(sel);
const grid = $('#grid');
const tpl = $('#card-tpl');
let state = { items: [] };
let filter = 'all';
try { filter = localStorage.getItem('pw-filter') || 'all'; } catch {}

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const money = (n) => (Number.isFinite(n) ? fmt.format(n) : '—');
const ORDER = { buy: 0, deal: 1, wait: 2, unknown: 3 };
const SVG = 'http://www.w3.org/2000/svg';

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

async function call(method, path, payload) {
  const res = await fetch(path, {
    method,
    headers: payload ? { 'content-type': 'application/json' } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function chart(history, target) {
  const W = 300, H = 90, PAD_T = 8, PAD_B = 16;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img' });
  if (!history?.length) {
    const t = svg('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' });
    t.textContent = 'No price history yet';
    root.append(t);
    return root;
  }
  const ps = history.map((h) => h.p);
  let lo = Math.min(...ps), hi = Math.max(...ps);
  if (Number.isFinite(target) && target > 0 && target >= lo * 0.85) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const t0 = Date.parse(history[0].t), t1 = Date.parse(history.at(-1).t) || t0 + 1;
  const x = (t) => ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * W;
  const y = (p) => PAD_T + (1 - (p - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  // Step line: idealo prices hold until they change
  let d = `M${x(history[0].t)},${y(ps[0])}`;
  for (let i = 1; i < history.length; i++) d += `H${x(history[i].t)}V${y(ps[i])}`;
  root.append(svg('path', { d: `${d}V${H - PAD_B}H0Z`, class: 'area' }));
  root.append(svg('path', { d, class: 'line', 'vector-effect': 'non-scaling-stroke' }));
  if (Number.isFinite(target) && target >= lo && target <= hi) {
    root.append(svg('line', { x1: 0, x2: W, y1: y(target), y2: y(target), class: 'target', 'vector-effect': 'non-scaling-stroke' }));
  }
  root.append(svg('circle', { cx: x(history.at(-1).t), cy: y(ps.at(-1)), r: 4.5, class: 'now', 'vector-effect': 'non-scaling-stroke' }));
  const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const l = svg('text', { x: 0, y: H - 2, class: 'lbl' }); l.textContent = day(history[0].t);
  const r = svg('text', { x: W, y: H - 2, class: 'lbl', 'text-anchor': 'end' }); r.textContent = 'today';
  root.append(l, r);
  root.setAttribute('aria-label', `30-day price from ${money(ps[0])} to ${money(ps.at(-1))}`);
  return root;
}

function card(item) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const v = item.verdict;
  const s = item.prices?.stats;
  const pending = !item.productRef;
  node.dataset.action = v.action;

  const img = $('.thumb img', node);
  if (item.imageUrl) img.src = item.imageUrl; else { img.remove(); $('.thumb', node).classList.add('empty'); }

  const h2 = $('h2', node);
  if (item.url) {
    const a = Object.assign(document.createElement('a'), { href: item.url, target: '_blank', rel: 'noopener noreferrer', textContent: item.name || item.query });
    h2.append(a);
  } else h2.textContent = item.name || item.query;
  $('.variant', node).textContent = item.variant || (pending ? `Searching for “${item.query}”` : '');
  const fetched = item.prices?.fetchedAt ? new Date(item.prices.fetchedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  $('.meta', node).textContent = [item.country, pending ? 'pending' : fetched && `checked ${fetched}`].filter(Boolean).join(' · ');

  $('.price', node).textContent = s ? money(s.current) : '—';
  const delta = $('.delta', node);
  if (s) {
    const diff = ((s.current - s.avg) / s.avg) * 100;
    delta.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs 30-day avg ${money(s.avg)}`;
    delta.classList.add(diff < -0.5 ? 'down' : diff > 0.5 ? 'up' : 'flat');
  } else delta.textContent = pending ? 'waiting for /price-check' : '';

  const pill = $('.pill', node);
  pill.dataset.action = v.action;
  pill.textContent = pending ? 'Pending' : v.label;
  $('.reason', node).textContent = v.reason;

  if (item.prices?.history?.length) $('.chart', node).append(chart(item.prices.history, item.targetPrice));
  else $('.chart', node).remove();

  if (s && v.position !== null) {
    $('.range-dot', node).style.left = `${v.position * 100}%`;
    $('.lo', node).textContent = `low ${money(s.min)}`;
    $('.mid', node).textContent = '30-day range';
    $('.hi', node).textContent = `high ${money(s.max)}`;
  } else $('.range', node).remove();

  const input = $('.target input', node);
  input.value = item.targetPrice ?? '';
  input.addEventListener('change', async () => {
    try {
      await call('PATCH', `/api/items/${item.id}`, { targetPrice: input.value.trim() || null });
      toast(input.value ? `Target set to ${money(Number(input.value.replace(',', '.')))}` : 'Target cleared');
      load();
    } catch (e) { toast(e.message); input.value = item.targetPrice ?? ''; }
  });

  const best = item.prices?.offers?.[0];
  const shop = $('.shop', node);
  if (best?.url) {
    shop.href = best.url;
    shop.textContent = `${best.shop} →`;
    const small = document.createElement('small');
    small.textContent = `${money(best.total)} incl. shipping${best.delivery ? ' · ' + best.delivery : ''}`;
    shop.append(small);
  } else shop.remove();

  $('.remove', node).addEventListener('click', async () => {
    if (!confirm(`Stop watching ${item.name || item.query}?`)) return;
    try { await call('DELETE', `/api/items/${item.id}`); load(); } catch (e) { toast(e.message); }
  });
  return node;
}

function summary(items) {
  const priced = items.filter((i) => i.prices?.stats);
  const buy = items.filter((i) => i.verdict.action === 'buy' || i.verdict.action === 'deal');
  const savings = priced.reduce((sum, i) => sum + Math.max(0, i.prices.stats.max - i.prices.stats.current), 0);
  const stats = [
    { n: items.length, t: 'products watched' },
    { n: buy.length, t: 'worth buying now', cls: buy.length ? 'good' : '' },
    { n: items.filter((i) => !i.productRef).length, t: 'pending /price-check' },
    { n: money(savings), t: 'below 30-day highs' },
  ];
  $('#summary').replaceChildren(...stats.map((s) => {
    const d = document.createElement('div');
    d.className = `stat ${s.cls || ''}`;
    const b = document.createElement('b'); b.textContent = s.n;
    const sp = document.createElement('span'); sp.textContent = s.t;
    d.append(b, sp);
    return d;
  }));
  const latest = priced.map((i) => i.prices.fetchedAt).sort().at(-1);
  $('#updated').textContent = latest ? `Last check: ${new Date(latest).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not checked yet';
}

function render() {
  const items = [...state.items].sort((a, b) => ORDER[a.verdict.action] - ORDER[b.verdict.action] || (a.verdict.position ?? 1) - (b.verdict.position ?? 1));
  const shown = items.filter((i) => filter === 'all' || (filter === 'buy' ? ['buy', 'deal'].includes(i.verdict.action) : ['wait', 'unknown'].includes(i.verdict.action)));
  summary(state.items);
  for (const b of document.querySelectorAll('#filters button')) b.setAttribute('aria-selected', String(b.dataset.filter === filter));
  if (!shown.length) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.textContent = state.items.length ? 'Nothing in this view.' : 'Your watchlist is empty — add a product above.';
    grid.replaceChildren(e);
  } else grid.replaceChildren(...shown.map(card));
}

async function load() {
  try { state = await call('GET', '/api/state'); render(); } catch (e) { toast(e.message); }
}

$('#add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await call('POST', '/api/items', data);
    form.reset();
    toast('Added — run /price-check in Claude Code to fetch prices');
    load();
  } catch (e) { toast(e.message); }
});

$('#filters').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  filter = b.dataset.filter;
  try { localStorage.setItem('pw-filter', filter); } catch {}
  render();
});

// Pick up a /price-check run without a manual reload
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(load, 60_000);
load();
