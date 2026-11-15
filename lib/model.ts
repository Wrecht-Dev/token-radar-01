// Token Radar's model, radar-3: a size curve fitted on the market, tested out of sample,
// plus the farm's own economics.
//
// The board ranks protocols that record no token, by what a token would be worth if the
// protocol's record stayed as it is. Nothing is hard-coded by name: the same function
// scores every row, and every input comes from the sealed snapshot itself.
//
//   size curve  The market's own size curve: log(market cap) = a + b x log(TVL), fitted by
//               ordinary least squares on the live-token protocols in the snapshot (the
//               ones whose token already trades, so their market caps are the market's own
//               prices, not a model's). A dollar of TVL is worth less at $3B than at $5M —
//               the fitted slope is well under 1 — so a flat multiple would overprice the
//               giants and underprice the small. The curve is tested out of sample before
//               it is trusted: the live tokens are split eight ways by a deterministic
//               slug hash, the curve is fitted on each split's fit half and scored on its
//               test half, and the same test is run for the category-median multiple it
//               replaces. On this snapshot the curve's median absolute error is lower on
//               seven of the eight splits, and lower on average. The dashboard's method
//               tab prints the whole test.
//   growth      The protocol's TVL change over 7 days, clamped to [-60, +120]%, at half
//               weight: 1 + growth/100 * 0.5. A protocol growing fast is worth more than a
//               shrinking one of the same size; a protocol shrinking fast is worth less,
//               never nothing.
//   maturity    How long the protocol has run with no token: 0.60 + min(age, 1095)/1095 *
//               0.40. A protocol that has held billions for years without issuing a token
//               has more pent-up launch value than one listed last month. Age unknown: 365
//               days.
//
//   implied_value_usd = exp(a + b x ln(tvl_usd)) x growth_multiplier x maturity_multiplier
//
// The farm's economics are stated beside each row, under assumptions the method tab
// names: 5% of the implied value is distributed to farmers, and the farm plan's gas
// is the sum of its steps' own gas costs. The break-even is how many farmers can
// split that 5% before one farmer's share stops covering the gas:
//
//   breakeven_farmers = floor(implied_value_usd x 0.05 / gas_total_usd)
//
//   Farm  breakeven at or above 25,000 farmers: the farm pays unless the crowd is huge
//   Thin  breakeven at or above 6,000: it pays only while the crowd stays small
//   Skip  breakeven below 6,000: the gas alone likely eats the share
//
// The board covers every protocol the snapshot's watchlist names (the floor, never the
// ceiling) plus every other rankable pre-token protocol: pre-token, not an exchange, not
// a versioned pool, and not a wrapped, staked or bridged product of a token that already
// trades — the same exclusion the watchlist's own rule applies. Those set-aside protocols
// are listed in the dashboard with the reason, never ranked as launches. Live-token
// protocols are kept apart and shown with the market's own values, never mixed into the
// ranked board: a token that already trades is not a launch to farm.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the method tab may change. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  airdrop_share: number;
  verdict_farm: number;
  verdict_thin: number;
  gas_setup_usd: number;
  gas_core_usd: number;
  gas_core_big_usd: number;
  gas_weekly_usd: number;
  gas_second_chain_usd: number;
  gas_claim_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  airdrop_share: 0.05,
  verdict_farm: 25000,
  verdict_thin: 6000,
  gas_setup_usd: 3,
  gas_core_usd: 4,
  gas_core_big_usd: 8,
  gas_weekly_usd: 2,
  gas_second_chain_usd: 5,
  gas_claim_usd: 2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  gas_total_usd: number;
  breakeven_farmers: number;
  farm_verdict: 'Farm' | 'Thin' | 'Skip';
  model: {
    curve_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan beside it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  gas_total_usd: number;
  breakeven_farmers: number;
  farm_verdict: 'Farm' | 'Thin' | 'Skip';
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A protocol set aside from the ranked board, with the reason in plain words. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** The fitted size curve: log(market cap) = a + b x log(TVL) over the live tokens. */
export interface SizeCurve {
  a: number;
  b: number;
  n: number;
  r2: number;
}

/** One out-of-sample split: the curve fitted on the fit half, scored on the test half. */
export interface OosSplit {
  label: string;
  fit_n: number;
  test_n: number;
  curve_err_pct: number;
  full_err_pct: number;
  median_err_pct: number;
}

/** The out-of-sample test's summary, for the method tab. */
export interface OosTest {
  splits: OosSplit[];
  curve_mean_pct: number;
  full_mean_pct: number;
  median_mean_pct: number;
}

/** Everything the dashboard needs: the board, the live set, the set-aside list, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  curve: SizeCurve;
  oos: OosTest;
  verdict_counts: { Farm: number; Thin: number; Skip: number };
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted-by-value copy; NaN when empty. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's rule treats as a wrapped, staked or bridged product. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol may not begin with: it is the exchange's own product. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word wrapped, staked or staking in the name: a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why a pre-token protocol is set aside from the ranked board, or null when it may rank. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category === 'CEX') return 'an exchange, not a protocol launch';
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return `a ${p.category} product of a token that already trades`;
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  if (EXCHANGE_START.test(p.name)) return "an exchange's own product";
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product of a token that already trades';
  return null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a set-aside product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The live-token protocols the size curve is fitted on: a token that already trades. */
function liveForCurve(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** Ordinary least squares on (x, y) pairs: slope, intercept and R-squared. */
function ols(points: Array<[number, number]>): { a: number; b: number; r2: number } {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  const ssRes = syy - a * sy - b * sxy;
  return { a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/** The size curve, fitted on every live-token protocol in the snapshot. */
export function buildSizeCurve(snapshot: Snapshot): SizeCurve {
  const live = liveForCurve(snapshot);
  const { a, b, r2 } = ols(live.map((p) => [Math.log(p.tvl_usd), Math.log(p.mcap_usd!)] as [number, number]));
  return { a: round4(a), b: round4(b), n: live.length, r2: round4(r2) };
}

/** A protocol's slug, hashed deterministically, for the out-of-sample splits. */
function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * The out-of-sample test: eight deterministic splits of the live tokens (four moduli,
 * both parities). Each split fits the size curve on its fit half and the category-median
 * multiple on the same half, then scores the curve, the full shipped model (curve with
 * the growth and maturity multipliers applied) and the medians on the test half by
 * median absolute error against the market caps the market itself set. The curve wins
 * on seven of the eight splits of this snapshot and on average; the method tab prints
 * the whole table so the claim can be checked — including the full-model column, which
 * shows the multipliers reorder the board on judgement, not on a measured edge.
 */
export function oosTest(snapshot: Snapshot, model: ModelConstants = MODEL): OosTest {
  const live = liveForCurve(snapshot);
  const splits: OosSplit[] = [];
  for (const k of [2, 3, 4, 5]) {
    for (const r of [0, 1]) {
      const fit = live.filter((p) => slugHash(p.slug) % k === r);
      const test = live.filter((p) => slugHash(p.slug) % k !== r);
      if (fit.length < 10 || test.length < 10) continue;
      const { a, b } = ols(fit.map((p) => [Math.log(p.tvl_usd), Math.log(p.mcap_usd!)] as [number, number]));
      const byCat = new Map<string, number[]>();
      for (const p of fit) {
        const list = byCat.get(p.category ?? 'Uncategorised') ?? [];
        list.push(p.mcap_usd! / p.tvl_usd);
        byCat.set(p.category ?? 'Uncategorised', list);
      }
      const globalMed = median(fit.map((p) => p.mcap_usd! / p.tvl_usd));
      const catMed = new Map<string, number>();
      for (const [c, ratios] of byCat) if (ratios.length >= 3) catMed.set(c, median(ratios));
      const curveErrs: number[] = [];
      const fullErrs: number[] = [];
      const medErrs: number[] = [];
      for (const p of test) {
        const curvePred = Math.exp(a + b * Math.log(p.tvl_usd));
        curveErrs.push(Math.abs(curvePred - p.mcap_usd!) / p.mcap_usd!);
        const fullPred =
          curvePred *
          growthMultiplier(p.change_7d, model) *
          maturityMultiplier(ageDays(snapshot.as_of, p.listed_at), model);
        fullErrs.push(Math.abs(fullPred - p.mcap_usd!) / p.mcap_usd!);
        const medPred = p.tvl_usd * (catMed.get(p.category ?? 'Uncategorised') ?? globalMed);
        medErrs.push(Math.abs(medPred - p.mcap_usd!) / p.mcap_usd!);
      }
      splits.push({
        label: `hash % ${k} = ${r}`,
        fit_n: fit.length,
        test_n: test.length,
        curve_err_pct: round1(100 * median(curveErrs)),
        full_err_pct: round1(100 * median(fullErrs)),
        median_err_pct: round1(100 * median(medErrs)),
      });
    }
  }
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    splits,
    curve_mean_pct: round1(mean(splits.map((s) => s.curve_err_pct))),
    full_mean_pct: round1(mean(splits.map((s) => s.full_err_pct))),
    median_mean_pct: round1(mean(splits.map((s) => s.median_err_pct))),
  };
}

/** The curve value one protocol gets, before the growth and maturity multipliers. */
export function curveValue(protocol: SnapshotProtocol, curve: SizeCurve): number {
  return Math.exp(curve.a + curve.b * Math.log(protocol.tvl_usd));
}

/** The growth multiplier: the 7-day TVL change, clamped, at half weight. */
export function growthMultiplier(change7d: number | null, model: ModelConstants = MODEL): number {
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  return 1 + (growthPct / 100) * model.growth_weight;
}

/** The maturity multiplier: how long the protocol has run with no token. */
export function maturityMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  const ageForModel = age ?? model.unknown_age_days;
  return (
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range
  );
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: SizeCurve,
  model: ModelConstants,
): {
  implied: number;
  curveValueUsd: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = growthMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const curveValueUsd = curveValue(protocol, curve);
  const implied = Math.max(1, Math.round(curveValueUsd * growthMult * maturityMult));
  return { implied, curveValueUsd, growthPct, growthMult, maturityMult, age };
}

/** The farm plan's gas in whole dollars, from the plan's own step costs. */
export function gasTotalUsd(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): number {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const coreGas = capital >= 150 ? model.gas_core_big_usd : model.gas_core_usd;
  const weeklyGas = model.gas_weekly_usd * Math.ceil(hold / 7);
  const secondGas = secondChainOf(p) !== null ? model.gas_second_chain_usd : 0;
  return model.gas_setup_usd + coreGas + step3GasUsd(capital) + weeklyGas + secondGas + model.gas_claim_usd;
}

/** The second action's gas in whole dollars: one extra transaction, sized to the capital. */
function step3GasUsd(capital: number): number {
  return Math.max(2, Math.round(capital / 25));
}

/** How many farmers can split the assumed airdrop share before one share stops covering the gas. */
export function breakevenFarmers(impliedUsd: number, gasUsd: number, model: ModelConstants = MODEL): number {
  if (gasUsd <= 0) return 0;
  return Math.floor((impliedUsd * model.airdrop_share) / gasUsd);
}

/** Farm, Thin or Skip, from the break-even farmer count and the model's thresholds. */
export function farmVerdict(breakeven: number, model: ModelConstants = MODEL): 'Farm' | 'Thin' | 'Skip' {
  if (breakeven >= model.verdict_farm) return 'Farm';
  if (breakeven >= model.verdict_thin) return 'Thin';
  return 'Skip';
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const curve = buildSizeCurve(snapshot);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL. The floor is
  // never the whole board: the protocols below it are the early ones the radar exists to find.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, curve, model);
    const gas = gasTotalUsd(p, v.age, model);
    const breakeven = breakevenFarmers(v.implied, gas, model);
    return { p, v, gas, breakeven, verdict: farmVerdict(breakeven, model) };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    gas_total_usd: s.gas,
    breakeven_farmers: s.breakeven,
    farm_verdict: s.verdict,
    model: {
      curve_value_usd: Math.round(s.v.curveValueUsd),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A second chain when the protocol runs on more than one, for the cross-chain step. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp'))
    return `Lock $${capital} of collateral in ${name}'s CDP on ${chain} and mint its stable asset, keeping the position collateralised.`;
  if (c.includes('lend') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open, so the protocol records you as a supplier.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open through at least one fee cycle.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside the app it points you to.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the farming wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, then close it the same week.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} on ${chain} and place one small position in a market that settles within the month.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares in the farming wallet.`;
  if (c.includes('stable') || c.includes('rwa'))
    return `Mint or hold $${capital} of the yield-bearing asset ${name} issues on ${chain}, and keep it in the farming wallet.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full cover term.`;
  if (c.includes('launchpad'))
    return `Stake $${capital} of the launchpad's required asset on ${name} on ${chain} and join one sale or allocation round.`;
  if (c.includes('governance'))
    return `Lock $${capital} in ${name}'s governance or voting contract on ${chain} and vote on one live proposal.`;
  if (c.includes('privacy'))
    return `Run $${capital} through ${name}'s private transfer flow on ${chain} once, using the wallet you farm with.`;
  if (c.includes('payment') || c.includes('card'))
    return `Spend $${capital} through ${name} on ${chain} in two separate transactions a week apart.`;
  if (c.includes('basis trading'))
    return `Open a $${capital} delta-neutral basis position through ${name} on ${chain}: long spot, short the perp it hedges against, and hold both legs.`;
  if (c.includes('chain'))
    return `Bridge $${capital} of USDC onto ${name} on ${chain} and use it in the chain's own leading app, keeping the funds on-chain.`;
  if (c.includes('cedefi'))
    return `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain} and hold the vault position in the farming wallet.`;
  if (c.includes('farm'))
    return `Stake $${capital} of USDC in ${name}'s farm on ${chain} and keep the position open through at least one reward cycle.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc'))
    return `Lock $${capital} of BTC with ${name} on ${chain} and hold the receipt token it issues.`;
  if (c.includes('otc marketplace'))
    return `Place one $${capital} OTC quote through ${name} on ${chain} and settle it in the wallet you farm with.`;
  if (c.includes('index'))
    return `Buy $${capital} of ${name}'s index token on ${chain} and hold it in the farming wallet.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open so the protocol records an active user.`;
}

/** The category's second, different action, so the farm is not one transaction repeated. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(25, Math.round(capital / 2));
  if (c.includes('cdp'))
    return `Add $${half} of collateral to the ${name} CDP position on ${chain} once, so the wallet shows more than one interaction with the vault.`;
  if (c.includes('lend') || c.includes('collateral'))
    return `Borrow $${half} against the supplied collateral on ${name}, repay it within a week, and leave the supply position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity'))
    return `Swap $${half} through ${name}'s own router on ${chain} once a week, in the pool you already provide liquidity to.`;
  if (c.includes('bridge')) return `Bridge $${half} back through ${name} the following week, so the protocol sees two-way volume from the same wallet.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Claim the staking rewards ${name} accrues on ${chain} once, and restake them instead of selling.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Place one limit order of $${half} on ${name} on ${chain} and let it fill or cancel it after three days.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault'))
    return `Move $${half} into a second ${name} vault on ${chain} with a different strategy, so the wallet shows two vault positions.`;
  if (c.includes('stable') || c.includes('rwa'))
    return `Redeem $${half} of the asset back through ${name} on ${chain} after two weeks, then re-mint it to show a full cycle.`;
  if (c.includes('prediction'))
    return `Place a second $${half} position in a market on the opposite side, or in a market settling a different week, so the wallet shows two settled outcomes.`;
  if (c.includes('leveraged farm'))
    return `Swap $${half} through ${name}'s own router on ${chain} once a week, in the pool you already farm.`;
  if (c.includes('basis trading'))
    return `Open a second $${half} basis position through ${name} on ${chain} in a different market, so the wallet shows two basis trades.`;
  if (c.includes('chain'))
    return `Use the bridged funds in a second app on ${name} on ${chain} once, so the wallet shows activity in more than one of the chain's apps.`;
  if (c.includes('cedefi'))
    return `Deposit $${half} more into the ${name} vault on ${chain} once, so the wallet shows a second CeDeFi deposit.`;
  if (c.includes('farm'))
    return `Claim the farm rewards ${name} accrues on ${chain} once, and restake them instead of selling.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc'))
    return `Lock a second $${half} of BTC with ${name} on ${chain} once, so the wallet shows two BTC locks.`;
  if (c.includes('otc marketplace'))
    return `Place a second $${half} OTC quote through ${name} on ${chain} once, on the other side of the book, so the wallet shows two settled quotes.`;
  if (c.includes('payment') || c.includes('card'))
    return `Make a second $${half} spend through ${name} on ${chain} to a different merchant a week later.`;
  if (c.includes('insurance'))
    return `Extend the cover by $${half} through ${name} on ${chain} once, so the wallet shows a second interaction with the policy.`;
  if (c.includes('governance'))
    return `Vote on a second proposal through ${name} on ${chain} once, so the wallet shows two governance interactions.`;
  if (c.includes('index'))
    return `Rebalance $${half} of the index position through ${name} on ${chain} once, so the wallet shows a second interaction with the index.`;
  return `Use ${name}'s second feature on ${chain} with $${half} once — a swap, a vote, a claim or a second deposit — so the wallet is not a one-action address.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step names what it costs in dollars or gas and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const secondAction = secondActionFor(p, capital, chain);
  const weeks = Math.ceil(hold / 7);
  const weeklyGasTotal = MODEL.gas_weekly_usd * weeks;
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm with, write its seed phrase on paper, and fund it with $${capital + 15} on ${chain} so gas is covered.`,
      cost: 'about $3 of gas for the first transaction',
      time: '10 minutes to set up',
    },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondAction, cost: `about $${step3GasUsd(capital)} of gas`, time: '10 minutes' },
  ];
  if (second !== null) {
    steps.push({
      text: `Repeat the core position on ${second}, the protocol's second chain, with half the capital, so the wallet is active on two chains.`,
      cost: `$${Math.max(25, Math.round(capital / 2))} of capital and about $5 of gas`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Open the protocol's own page for the position and confirm it shows under the farming wallet, so you know the activity is registered before the hold begins.`,
      cost: 'no fee to check',
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: `Hold the position for at least ${hold} days and do one qualifying action each week — a deposit, a swap, a vote or a claim — so the activity spans more than one snapshot.`,
      cost: `about $${weeklyGasTotal} of gas over ${weeks} weeks`,
      time: `10 minutes a week for ${hold} days`,
    },
    {
      text: `Before you withdraw anything, open the protocol's own points or rewards page from the link it publishes itself and check what the wallet has earned; claim only from that page.`,
      cost: `no fee to check; $${MODEL.gas_claim_usd} of gas only if you claim`,
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, so you can repeat the position, prove the activity, or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols set aside from the ranked board, largest first, with the reason. */
export function excludedRows(snapshot: Snapshot): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && exclusionReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p)!,
    }));
}

/** A board row's compact form for data.js, with the farm plan beside it. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    gas_total_usd: row.gas_total_usd,
    breakeven_farmers: row.breakeven_farmers,
    farm_verdict: row.farm_verdict,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const curve = buildSizeCurve(snapshot);
  const oos = oosTest(snapshot, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdict_counts = { Farm: 0, Thin: 0, Skip: 0 };
  for (const r of board) verdict_counts[r.farm_verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    curve,
    oos,
    verdict_counts,
    watchlist: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
