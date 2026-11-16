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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist: string[];
  protocols: SnapshotProtocol[];
}

export interface ModelConstants {
  base_multiple: number;
  [key: string]: any;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  farm_steps: string[];
  model: {
    implied: number;
    growth_pct: number;
    growth_mult: number;
    maturity_mult: number;
    age: number | null;
    category_multiple: number;
    size_discount: number;
  };
  category_multiple: number;
  size_discount: number;
}

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
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiple: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  symbol: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_multiples: Record<string, number>;
  global_median_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export interface SnapshotError {
  message: string;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  maturity_max_days: 1095,
  size_threshold_usd: 100000000
};

export const MODEL_VERSION = 'radar-2';
export const EARLY_ROWS = 200;
export const LIVE_ROWS = 24;

function median(values: number[]): number {
  if (values.length === 0) return MODEL.base_multiple;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const asOfDate = new Date(asOf);
  const listedDate = new Date(listedAt);
  if (isNaN(asOfDate.getTime()) || isNaN(listedDate.getTime())) return null;
  const diffTime = asOfDate.getTime() - listedDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'bridge',
  'canonical bridge',
  'liquid staking',
  'liquid restaking',
  'restaked btc',
  'cex'
]);

const EXCLUDED_START_NAMES = [
  'binance',
  'coinbase',
  'bybit',
  'kraken',
  'bitget',
  'okx',
  'bitfinex',
  'gemini'
];

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.tvl_usd <= 0) return false;

  if (p.category) {
    const catLower = p.category.toLowerCase().trim();
    if (EXCLUDED_CATEGORIES.has(catLower)) return false;
  }

  const name = p.name.trim();
  const nameLower = name.toLowerCase();

  if (/\s+(v\d+|\d+\.\d+)$/i.test(name)) return false;

  const words = nameLower.split(/[^a-z0-9]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) {
    return false;
  }

  for (const start of EXCLUDED_START_NAMES) {
    if (nameLower.startsWith(start + ' ') || nameLower === start) {
      return false;
    }
  }

  return true;
}

export function computeCategoryMultiples(protocols: SnapshotProtocol[]): { globalMedian: number; categoryMultiples: Record<string, number> } {
  const tokenizedRatios: number[] = [];
  const catRatios: Record<string, number[]> = {};

  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      tokenizedRatios.push(ratio);
      if (p.category) {
        const cat = p.category.trim();
        if (!catRatios[cat]) catRatios[cat] = [];
        catRatios[cat].push(ratio);
      }
    }
  }

  const globalMedian = tokenizedRatios.length > 0 ? median(tokenizedRatios) : MODEL.base_multiple;
  const categoryMultiples: Record<string, number> = {};

  const allCategories = new Set<string>();
  for (const p of protocols) {
    if (p.category) allCategories.add(p.category.trim());
  }

  for (const cat of allCategories) {
    const ratios = catRatios[cat] || [];
    const peers = ratios.length;
    let mult: number;
    if (peers >= 3) {
      mult = median(ratios);
    } else {
      const catMedian = peers > 0 ? median(ratios) : globalMedian;
      mult = (catMedian * peers + globalMedian * 3) / (peers + 3);
    }
    categoryMultiples[cat] = clamp(mult, 0.02, 3);
  }

  return { globalMedian, categoryMultiples };
}

export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  globalMedian: number,
  categoryMultiples: Record<string, number>
) {
  const cat = p.category ? p.category.trim() : null;
  const catMult = (cat && categoryMultiples[cat] !== undefined) ? categoryMultiples[cat] : globalMedian;
  const base = p.tvl_usd * catMult;

  const growthPct = p.change_7d !== null ? clamp(p.change_7d, -60, 120) : 0;
  const growthMult = 1 + (growthPct / 100) * 0.5;

  const age = ageDays(asOf, p.listed_at);
  const effectiveAge = age ?? 365;
  const maturityMult = 0.6 + Math.min(effectiveAge, 1095) / 1095 * 0.4;

  const sizeVal = p.tvl_usd > 100000000 ? 1 / (1 + 0.18 * Math.max(0, Math.log10(p.tvl_usd / 100000000))) : 1;
  const sizeDiscount = Math.max(0.45, sizeVal);

  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * sizeDiscount));

  return {
    implied,
    growthPct,
    growthMult,
    maturityMult,
    age,
    categoryMultiple: catMult,
    sizeDiscount
  };
}

export function stepText(step: FarmStep): string {
  return `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0] : 'Multi-chain';
  const name = p.name;
  const cat = (p.category || '').toLowerCase();

  let steps: FarmStep[] = [];

  if (cat.includes('dex') || cat.includes('amm')) {
    steps = [
      { text: `Provide liquidity on ${name} using ${chain} to earn trading fee shares and incentive rewards.`, cost: '$15-40 in gas fees', time: '15 minutes once' },
      { text: `Stake LP tokens in ${name} gauges on ${chain} to maximize yield capture.`, cost: 'Free; gas only', time: '10 minutes once' },
      { text: `Participate in ${name} governance voting on ${chain} to earn weekly emission bribes.`, cost: 'Free', time: '10 minutes weekly' },
      { text: `Monitor pool impermanent loss and rebalance liquidity ranges on ${name} as needed.`, cost: '$10-25 in gas fees', time: '15 minutes bi-weekly' }
    ];
  } else if (cat.includes('lending') || cat.includes('borrow')) {
    steps = [
      { text: `Deposit blue-chip collateral into ${name} on ${chain} to establish a healthy borrow position.`, cost: '$20-50 in gas fees', time: '15 minutes once' },
      { text: `Borrow stablecoins against your collateral on ${name} to maintain conservative LTV ratios.`, cost: '$15-30 in borrow fees', time: '10 minutes once' },
      { text: `Provide borrowed assets into ${name} earning pools on ${chain} for delta-neutral yield.`, cost: '$10-20 in gas fees', time: '10 minutes once' },
      { text: `Regularly check health factor and repay debt incrementally on ${name}.`, cost: '$10-20 in gas fees', time: '10 minutes weekly' }
    ];
  } else if (cat.includes('yield') || cat.includes('aggregator')) {
    steps = [
      { text: `Deposit single-asset funds into optimized vaults on ${name} on ${chain}.`, cost: '$20-45 in gas fees', time: '15 minutes once' },
      { text: `Stake vault receipt tokens in ${name} safety modules to accrue bonus platform rewards.`, cost: 'Free; gas only', time: '10 minutes once' },
      { text: `Compound or harvest unclaimed reward tokens on ${name} periodically.`, cost: '$10-20 in gas fees', time: '10 minutes weekly' },
      { text: `Review vault strategy updates and adjust allocations on ${name}.`, cost: '$10-20 in gas fees', time: '15 minutes monthly' }
    ];
  } else if (cat.includes('bridge')) {
    steps = [
      { text: `Transfer assets across chains using ${name} bridge routing on ${chain}.`, cost: '$10-30 bridge fee + gas', time: '15 minutes once' },
      { text: `Provide liquidity to ${name} bridge pools on ${chain} to earn cross-chain transfer fees.`, cost: '$20-40 in gas fees', time: '15 minutes once' },
      { text: `Stake bridge LP tokens to earn protocol revenue share on ${name}.`, cost: 'Free; gas only', time: '10 minutes once' },
      { text: `Claim accrued cross-chain fee distributions on ${name}.`, cost: '$10-20 in gas fees', time: '10 minutes weekly' }
    ];
  } else if (cat.includes('perp') || cat.includes('derivatives')) {
    steps = [
      { text: `Deposit margin collateral into ${name} trading accounts on ${chain}.`, cost: '$20-50 in gas fees', time: '15 minutes once' },
      { text: `Open leveraged perpetual positions on ${name} with strict risk management.`, cost: '$15-35 in trading fees', time: '20 minutes active' },
      { text: `Provide liquidity to ${name} insurance or market maker vaults on ${chain}.`, cost: '$25-50 in gas fees', time: '15 minutes once' },
      { text: `Claim trading fee rebates and staking rewards on ${name}.`, cost: '$10-20 in gas fees', time: '10 minutes weekly' }
    ];
  } else if (cat.includes('restak') || cat.includes('liquid restaking')) {
    steps = [
      { text: `Restake LST or native assets into ${name} on ${chain} to secure AVS networks.`, cost: '$25-60 in gas fees', time: '15 minutes once' },
      { text: `Delegate restaked assets to high-performing operators on ${name}.`, cost: 'Free; gas only', time: '10 minutes once' },
      { text: `Compound EigenLayer and ${name} points across supported reward seasons.`, cost: 'Free', time: '5 minutes weekly' },
      { text: `Monitor operator slashing risks and adjust delegations on ${name}.`, cost: '$15-30 in gas fees', time: '15 minutes monthly' }
    ];
  } else if (cat.includes('chain') || cat.includes('layer 2') || cat.includes('layer-2')) {
    steps = [
      { text: `Bridge native assets to ${name} network using official gateways.`, cost: '$10-25 in L1 gas fees', time: '15 minutes once' },
      { text: `Deploy capital into core DeFi applications building on ${name}.`, cost: '$15-30 in gas fees', time: '20 minutes once' },
      { text: `Participate in ${name} ecosystem incentive programs and testnets.`, cost: 'Free; gas only', time: '15 minutes weekly' },
      { text: `Bridge funds back to L1 securely when exiting ${name} ecosystem.`, cost: '$15-40 in gas/bridge fees', time: '30 minutes once' }
    ];
  } else {
    steps = [
      { text: `Connect Web3 wallet to ${name} application dashboard on ${chain}.`, cost: 'Free', time: '5 minutes once' },
      { text: `Deposit supported assets into ${name} primary protocol contracts.`, cost: '$20-50 in gas fees', time: '15 minutes once' },
      { text: `Stake position tokens or claim early participation rewards on ${name}.`, cost: 'Free; gas only', time: '10 minutes once' },
      { text: `Monitor position health and compound rewards on ${name} regularly.`, cost: '$10-20 in gas fees', time: '10 minutes weekly' }
    ];
  }

  return steps;
}

function buildBoardRows(snapshot: Snapshot): BoardRow[] {
  const { globalMedian, categoryMultiples } = computeCategoryMultiples(snapshot.protocols);

  const protocolMap = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    protocolMap.set(p.slug, p);
  }

  const selectedSlugs = new Set<string>();
  const orderedProtocols: SnapshotProtocol[] = [];

  for (const slug of snapshot.watchlist) {
    const p = protocolMap.get(slug);
    if (p && !selectedSlugs.has(slug)) {
      selectedSlugs.add(slug);
      orderedProtocols.push(p);
    }
  }

  const rankable = snapshot.protocols.filter(p => !selectedSlugs.has(p.slug) && isRankable(p));
  const rankableWithModel = rankable.map(p => ({
    p,
    mod: impliedValue(p, snapshot.as_of, globalMedian, categoryMultiples)
  }));
  rankableWithModel.sort((a, b) => b.mod.implied - a.mod.implied || b.p.tvl_usd - a.p.tvl_usd);

  for (const item of rankableWithModel) {
    if (orderedProtocols.length >= EARLY_ROWS) break;
    selectedSlugs.add(item.p.slug);
    orderedProtocols.push(item.p);
  }

  const allRowsWithModel = orderedProtocols.map(p => {
    const mod = impliedValue(p, snapshot.as_of, globalMedian, categoryMultiples);
    return { p, mod };
  });

  allRowsWithModel.sort((a, b) => b.mod.implied - a.mod.implied || b.p.tvl_usd - a.p.tvl_usd);

  const rows: BoardRow[] = allRowsWithModel.map((item, index) => {
    const age = item.mod.age;
    const steps = farmSteps(item.p, age);
    const farmStepTexts = steps.map(stepText);
    return {
      rank: index + 1,
      slug: item.p.slug,
      name: item.p.name,
      category: item.p.category,
      chains: item.p.chains,
      tvl_usd: item.p.tvl_usd,
      change_7d: item.p.change_7d,
      listed_at: item.p.listed_at,
      age_days: age,
      implied_value_usd: item.mod.implied,
      farm_steps: farmStepTexts,
      model: {
        implied: item.mod.implied,
        growth_pct: item.mod.growthPct,
        growth_mult: item.mod.growthMult,
        maturity_mult: item.mod.maturityMult,
        age: item.mod.age,
        category_multiple: item.mod.categoryMultiple,
        size_discount: item.mod.sizeDiscount
      },
      category_multiple: item.mod.categoryMultiple,
      size_discount: item.mod.sizeDiscount
    };
  });

  return rows;
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  return buildBoardRows(snapshot);
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  const tokenized = snapshot.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0);
  tokenized.sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0));
  return tokenized.slice(0, LIVE_ROWS).map(p => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    symbol: p.symbol
  }));
}

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
    growth_multiplier: row.model.growth_mult,
    maturity_multiplier: row.model.maturity_mult,
    category_multiple: row.category_multiple,
    farm_steps: row.farm_steps
  };
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { globalMedian, categoryMultiples } = computeCategoryMultiples(snapshot.protocols);
  const board = buildBoardRows(snapshot);
  const live = liveRows(snapshot);
  const watchlistSet = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter(r => !watchlistSet.has(r.slug)).length,
    live_size: live.length,
    category_multiples: categoryMultiples,
    global_median_multiple: globalMedian,
    rows: board.map(radarRow),
    live
  };
  return { board, radar };
}

export function parseSnapshot(jsonStr: string): Snapshot {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON snapshot object');
    }
    return data as Snapshot;
  } catch (err: any) {
    throw new Error(`Failed to parse snapshot JSON: ${err.message}`);
  }
}

export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) {
    return `Board row count ${rows.length} is out of range [100, 4000]`;
  }

  const rowSlugs = new Set(rows.map(r => r.slug));
  for (const w of snapshot.watchlist) {
    if (!rowSlugs.has(w)) {
      return `Watchlist slug ${w} missing from board rows`;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.rank !== i + 1) {
      return `Invalid rank at index ${i}: expected ${i + 1}, got ${row.rank}`;
    }
    if (i > 0 && rows[i - 1].implied_value_usd < row.implied_value_usd) {
      return `Implied values not non-increasing at index ${i}: ${rows[i - 1].implied_value_usd} < ${row.implied_value_usd}`;
    }

    if (!row.farm_steps || row.farm_steps.length < 4 || row.farm_steps.length > 6) {
      return `Row ${row.slug} has invalid farm steps count: ${row.farm_steps?.length}`;
    }
    for (const stepStr of row.farm_steps) {
      if (typeof stepStr !== 'string' || stepStr.length < 20 || stepStr.length > 600) {
        return `Row ${row.slug} has farm step text length out of bounds [20, 600]: ${stepStr?.length}`;
      }
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};`;
}
