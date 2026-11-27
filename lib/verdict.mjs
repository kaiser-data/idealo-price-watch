// Buy-or-wait verdict from a 30-day price history and an optional target price.

const DAY = 24 * 60 * 60 * 1000;
const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Change in % between the price 7 days ago and now (negative = falling). */
export function weekTrend(history) {
  if (!history?.length) return 0;
  const last = history[history.length - 1];
  const cutoff = Date.parse(last.t) - 7 * DAY;
  const before = [...history].reverse().find((h) => Date.parse(h.t) <= cutoff) ?? history[0];
  if (!before.p) return 0;
  return ((last.p - before.p) / before.p) * 100;
}

/**
 * @param {{history: {t:string,p:number}[], stats: {current:number,min:number,max:number,avg:number}|null}} prices
 * @param {number|null} targetPrice
 * @returns {{action:'buy'|'deal'|'wait'|'unknown', label:string, reason:string, position:number|null, trend:number}}
 */
export function verdict(prices, targetPrice = null) {
  const s = prices?.stats;
  if (!s || !Number.isFinite(s.current)) {
    return { action: 'unknown', label: 'No data yet', reason: 'Run /price-check in Claude Code to fetch prices.', position: null, trend: 0 };
  }
  const { current, min, max, avg } = s;
  const range = max - min;
  // 0 = at the 30-day low, 1 = at the 30-day high
  const position = range > 0 ? Math.min(1, Math.max(0, (current - min) / range)) : 0;
  const trend = weekTrend(prices.history);
  const euro = (n) => EUR.format(n);

  if (Number.isFinite(targetPrice) && targetPrice > 0 && current <= targetPrice) {
    return { action: 'buy', label: 'Buy now', reason: `Target hit: ${euro(current)} is at or below your ${euro(targetPrice)}.`, position, trend };
  }
  if (current <= min * 1.02) {
    return { action: 'buy', label: 'Buy now', reason: `At the 30-day low (${euro(min)}).`, position, trend };
  }
  if (current <= avg * 0.95) {
    return { action: 'deal', label: 'Good deal', reason: `${Math.round((1 - current / avg) * 100)}% below the 30-day average of ${euro(avg)}.`, position, trend };
  }
  if (trend <= -3) {
    return { action: 'wait', label: 'Wait', reason: `Falling ${Math.abs(trend).toFixed(1)}% this week — it may drop further.`, position, trend };
  }
  if (current >= avg * 1.03) {
    return { action: 'wait', label: 'Wait', reason: `${Math.round((current / avg - 1) * 100)}% above the 30-day average; it was ${euro(min)} recently.`, position, trend };
  }
  return { action: 'wait', label: 'Wait', reason: `Normal price. The 30-day low was ${euro(min)} — set a target near it.`, position, trend };
}
