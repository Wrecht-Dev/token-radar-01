# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wrecht-Dev/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wrecht-Dev/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — every protocol that records no token, ranked by what its launch would be worth, with a concrete farm plan for each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` (Node 22, standard library only) reads a sealed snapshot of every protocol DefiLlama tracks and writes a ranked board:

- **198 rows** — all 40 of the snapshot's watchlist, plus 158 early pre-token protocols below the $50M floor. Nothing is hard-coded by name: the same function scores every row.
- **Implied value, comps-calibrated** — `TVL × category comp ratio × growth multiplier × maturity multiplier`. The comp ratio is the median market-cap / TVL of the live-token protocols in the same category (at least 3 comparables, otherwise the global median), capped at 2.00. Growth is the seven-day TVL change, clamped to −60%…+120% at half weight. Maturity is how long the protocol has run with no token: `0.60 + min(age, 1095) / 1095 × 0.40`.
- **Set aside, not ranked** — 144 wrapped, staked or bridged products of tokens that already trade (WBTC, staked ETH, bridges…), versioned pools and exchange products. They are listed in the dashboard with the reason, never ranked as launches.
- **Live tokens kept apart** — 24 protocols whose token already trades, shown with the market's own values as the board's price reference.
- **A farm plan per row** — seven steps derived from the protocol's category, chains, TVL and age, each naming what it costs in dollars or gas and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

That writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's dataset), `out/dashboard/` (the static page — no network, no framework) and `out/dossier.json` (the judge's summary, built with `vendor/makefun-board.ts`). The dashboard renders from `out/dashboard/index.html`: a sortable, filterable board, a detail view for every protocol with its model inputs and farm plan, the live-token view and the method tab.

## The dashboard

Open `dashboard/index.html` beside `data.js` (or the built `out/` directory) in any browser. No network: every byte it shows ships with the page. Hash routes: `#/board` (with `?category=&chain=&watchlist=&sort=&q=` filters), `#/protocol/<slug>` for a protocol's detail view, `#/live`, `#/method`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
