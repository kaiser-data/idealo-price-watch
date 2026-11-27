# Price Watch

**A local watchlist that tells you whether to buy a product now or wait, based on its last 30 days of idealo prices.**

Add a product and an optional target price. Run `/price-check` in Claude Code. Each product gets a verdict:

| Verdict | When |
|---|---|
| **Buy now** | The price is at or below your target, or within 2% of the 30-day low |
| **Good deal** | At least 5% below the 30-day average |
| **Wait** | Prices fell more than 3% this week, the price is above average, or it's a normal price with a recent lower low |

Each card shows a 30-day price chart with your target line, where today's price sits between the 30-day low and high, and the cheapest shop including shipping.

## Why Claude fetches the prices

The [idealo MCP server](https://mcp.idealo.com/mcp) needs an OAuth login. Claude Code already has that login. So the app doesn't call idealo itself: the `/price-check` command in `.claude/commands/` has Claude search idealo, download the price history and offers, and save the raw responses. `npm run ingest` then turns them into `data/prices.json`. The app reads that file. Your watchlist and prices stay on your machine in `data/`, which git ignores.

```
browser ──▶ server.mjs ──▶ data/watchlist.json, data/prices.json
                                 ▲
Claude Code /price-check ──▶ idealo MCP ──▶ data/raw/*.json ──▶ npm run ingest
```

## Run it

Requires Node 20 or newer. There are no dependencies to install.

```sh
npm run seed     # first run only: real example data (Sony XM5, AirPods Pro 3, Switch 2)
npm start        # http://127.0.0.1:4321
```

Then in Claude Code, in this folder:

```
/price-check
```

New products show as *pending* until the next `/price-check`. The page refreshes when you switch back to its tab, and once a minute. To check every morning, schedule `/price-check` with Claude Code's `/schedule` or `/loop`.

## Markets

DE (default), AT, FR, IT, ES and UK. You choose the market for each product.

## Development

```sh
npm test         # parser + verdict tests on real idealo fixtures
npm run check    # syntax check
```

| Path | What it does |
|---|---|
| `server.mjs` | Static UI plus a JSON API: `GET /api/state`, `POST /api/items`, `PATCH`/`DELETE /api/items/:id` |
| `lib/parse.mjs` | Turns idealo price strings ("1.234,56 €") and MCP responses into numbers and plain records |
| `lib/verdict.mjs` | The buy-or-wait rules |
| `scripts/ingest.mjs` | Converts the raw MCP responses into `data/prices.json` |
| `public/` | The dashboard (plain HTML, CSS and JS; light and dark mode) |
| `examples/data/` | Real idealo responses from 27 Nov 2026, used by `npm run seed` and the tests |

Prices come from idealo. This project is not affiliated with idealo.
