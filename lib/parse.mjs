// Turn raw idealo MCP responses into the compact shape the app stores.

/** "1.234,56 €" | "£12.99" | "12,99" -> 1234.56 (null when unparseable) */
export function parsePrice(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const s = text.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    // German style: dots are thousands, comma is decimal
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // English style: commas are thousands
    normalized = s.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** idealo product id from an OffersOfProduct URL, e.g. ".../OffersOfProduct/201952086_-..." */
export function productIdFromUrl(url) {
  const m = typeof url === 'string' && url.match(/OffersOfProduct\/(\d+)/);
  return m ? m[1] : null;
}

/** get_product_price_history response -> { history, stats } */
export function normalizeHistory(raw) {
  const trend = raw?.priceTrend ?? raw;
  if (!trend || !Array.isArray(trend.history)) return { history: [], stats: null };
  const history = trend.history
    .map((h) => ({ t: h.dateTimeISO ?? new Date(h.dateTime).toISOString(), p: parsePrice(h.price) }))
    .filter((h) => h.p !== null && !Number.isNaN(Date.parse(h.t)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const st = trend.statistics ?? {};
  const prices = history.map((h) => h.p);
  const stats = prices.length
    ? {
        current: parsePrice(st.currentPrice) ?? prices[prices.length - 1],
        min: parsePrice(st.minPrice) ?? Math.min(...prices),
        max: parsePrice(st.maxPrice) ?? Math.max(...prices),
        avg: parsePrice(st.avgPrice) ?? prices.reduce((a, b) => a + b, 0) / prices.length,
        lowestDate: st.lowestPriceDate ?? null,
        periodDays: trend.periodDays ?? null,
      }
    : null;
  return { history, stats };
}

/** get_product_offers response -> offers sorted by total price incl. shipping */
export function normalizeOffers(raw) {
  const offers = Array.isArray(raw?.offers) ? raw.offers : Array.isArray(raw) ? raw : [];
  return offers
    .map((o) => {
      const price = parsePrice(o.price);
      const shipping = parsePrice(o.minShippingCost) ?? 0;
      return {
        shop: o.shop?.name ?? 'Unknown shop',
        rating: o.shop?.rating?.avg ?? null,
        ratingCount: o.shop?.rating?.count ?? null,
        price,
        shipping,
        total: price === null ? null : Math.round((price + shipping) * 100) / 100,
        delivery: o.delivery?.deliveryText ?? null,
        returnDays: o.freeReturnDays ?? null,
        url: o.relocatorUrl ?? null,
      };
    })
    .filter((o) => o.total !== null)
    .sort((a, b) => a.total - b.total);
}
