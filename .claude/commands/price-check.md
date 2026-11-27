---
description: Refresh Price Watch — resolve pending products and pull fresh idealo prices
---

Refresh the Price Watch data in this project using the idealo MCP tools.

1. Read `data/watchlist.json`. If it doesn't exist, run `npm run seed` first.
2. For every item **without** a `productRef` (added in the app, still pending):
   - Call `mcp__idealo__search_products` with `query` = the item's `query` and `country` = its `country`.
   - Pick the best match: prefer `itemType: "PRODUCT"`, the name that matches the query most closely, and skip spare parts, accessories, refurbished single offers and clones.
   - Fill in `productRef`, `name`, `variant` (the result's `nameDelta`, or null), `url` and `imageUrl` from that result. Keep `id`, `query`, `country`, `targetPrice` and `addedAt` unchanged.
   - If nothing fits, leave the item pending and say so in the report.
   - Save `data/watchlist.json` (keep the `{ "items": [...] }` shape, 2-space JSON).
3. For every item that has a `productRef`, call these two tools with that `productRef` and the item's `country`. They don't depend on each other, so send all the calls in one batch:
   - `mcp__idealo__get_product_price_history` → write the full JSON response to `data/raw/<id>.history.json`
   - `mcp__idealo__get_product_offers` (first page only) → write the full JSON response to `data/raw/<id>.offers.json`
4. Run `npm run ingest`. It normalizes the raw files into `data/prices.json` and prints one verdict line per product.
5. Report back briefly: products with **BUY NOW** or **GOOD DEAL** first, including price, target and best shop. Then one line for the rest. Mention anything still pending. The app at http://127.0.0.1:4321 picks up the new data automatically.

$ARGUMENTS
