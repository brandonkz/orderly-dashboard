#!/usr/bin/env node
/**
 * Fetch comprehensive Orderly Network data for content generation
 * Pulls: volume, fees, traders, PnL rankings, positions, deposits by chain, builders, ecosystem stats
 */

const fmt = n => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};

const INDEXER = 'https://orderly-dashboard-query-service.orderly.network';
const API = 'https://api-evm.orderly.org/v1/public';

const BROKERS = [
  { id: 'woofi_pro', name: 'WOOFi Pro' },
  { id: 'orderly', name: 'Orderly' },
  { id: 'logx', name: 'LogX' },
  { id: 'sharpe_ai', name: 'Sharpe AI' },
  { id: 'vooi', name: 'vooi.io' },
  { id: 'citrex', name: 'Citrex Markets' },
  { id: 'rage_trade', name: 'Rage Trade' },
  { id: 'book_x', name: 'BookX' },
  { id: 'filament', name: 'Filament' },
  { id: 'btse_dex', name: 'BTSE DEX' },
  { id: 'saros', name: 'Saros' },
  { id: 'jojo', name: 'JOJO' },
  { id: 'kodiak_fi', name: 'KodiakFi' },
  { id: 'ascendex', name: 'AscendEX' },
  { id: 'empyreal', name: 'Empyreal' },
  { id: 'emdx_dex', name: 'EMDX' },
  { id: 'bitoro_network', name: 'Bitoro Network' },
  { id: 'linear_finance', name: 'Linear Finance' },
  { id: 'raydium', name: 'Raydium' },
  { id: 'quick_perps', name: 'QuickSwap' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const output = { ts: new Date().toISOString() };

  // 1. Platform volume
  console.log('Fetching platform volume...');
  const vol = await fetchJSON(`${API}/volume/stats`);
  if (vol?.data) {
    output.volume = {
      today: vol.data.perp_volume_today,
      '7d': vol.data.perp_volume_last_7_days,
      '30d': vol.data.perp_volume_last_30_days,
      ytd: vol.data.perp_volume_ytd,
      allTime: vol.data.perp_volume_ltd,
    };
    console.log(`  All-time: ${fmt(output.volume.allTime)}`);
  }

  // 2. Daily stats (7d)
  console.log('Fetching daily stats...');
  const daily = await fetchJSON(`${INDEXER}/daily_orderly_perp?param=${encodeURIComponent(JSON.stringify({ days: 7 }))}`);
  if (daily?.data) {
    const dates = daily.data.daytime.slice(-7);
    const rows = daily.data.data.slice(-7);
    output.daily = dates.map((d, i) => ({
      date: d,
      volume: rows[i].trading_volume,
      fees: rows[i].trading_fee,
      trades: rows[i].trading_count,
      users: rows[i].trading_user_count,
      liquidations: rows[i].liquidation_count,
      liquidationAmount: rows[i].liquidation_amount,
      newPositions: rows[i].opening_count,
    }));
    const totalUsers = rows.reduce((s, r) => s + r.trading_user_count, 0);
    const totalTrades = rows.reduce((s, r) => s + r.trading_count, 0);
    const totalLiqs = rows.reduce((s, r) => s + r.liquidation_count, 0);
    const avgUsers = Math.round(totalUsers / 7);
    const peakUsers = Math.max(...rows.map(r => r.trading_user_count));
    const peakDay = dates[rows.findIndex(r => r.trading_user_count === peakUsers)];
    console.log(`  Avg daily users: ${avgUsers.toLocaleString()} | Peak: ${peakUsers.toLocaleString()} (${peakDay})`);
    console.log(`  7d trades: ${totalTrades.toLocaleString()} | 7d liquidations: ${totalLiqs.toLocaleString()}`);
    output.dailySummary = { avgUsers, peakUsers, peakDay, totalTrades7d: totalTrades, totalLiquidations7d: totalLiqs };
  }

  // 3. Top traders by volume
  console.log('Fetching top traders by volume...');
  const topVol = await fetchJSON(`${INDEXER}/ranking/trading_volume?param=${encodeURIComponent(JSON.stringify({ days: 7, size: 10 }))}`);
  if (topVol?.data) {
    output.topTradersByVolume = topVol.data.account_ids.map((a, i) => ({
      address: topVol.data.address?.[i] || a.slice(0, 10) + '...',
      volume: topVol.data.volume[i],
    }));
    console.log(`  #1 trader: ${fmt(output.topTradersByVolume[0].volume)} (7d)`);
    const top10total = output.topTradersByVolume.reduce((s, t) => s + t.volume, 0);
    console.log(`  Top 10 combined: ${fmt(top10total)}`);
    output.topTradersByVolume.top10total = top10total;
  }

  // 4. Top PnL traders
  console.log('Fetching top PnL traders...');
  const topPnl = await fetchJSON(`${INDEXER}/ranking/realized_pnl?param=${encodeURIComponent(JSON.stringify({ days: 7, size: 10 }))}`);
  if (topPnl?.data?.rows) {
    // Aggregate by address (same trader can appear multiple times for different symbols)
    const byAddr = {};
    for (const row of topPnl.data.rows) {
      const addr = row.address;
      if (!byAddr[addr]) byAddr[addr] = { address: addr, broker: row.broker_id, totalPnl: 0, symbols: [] };
      byAddr[addr].totalPnl += parseFloat(row.total_realized_pnl);
      byAddr[addr].symbols.push(row.symbol.replace('PERP_', '').replace('_USDC', ''));
    }
    output.topPnlTraders = Object.values(byAddr).sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 5);
    const best = output.topPnlTraders[0];
    console.log(`  Best PnL: ${fmt(best.totalPnl)} (${best.symbols.join(', ')})`);
  }

  // 5. Top positions (biggest open positions)
  console.log('Fetching biggest positions...');
  const topPos = await fetchJSON(`${INDEXER}/ranking/positions?param=${encodeURIComponent(JSON.stringify({ days: 7, size: 10 }))}`);
  if (topPos?.data?.rows) {
    output.biggestPositions = topPos.data.rows.slice(0, 5).map(r => ({
      address: r.address,
      symbol: r.symbol.replace('PERP_', '').replace('_USDC', ''),
      holding: parseFloat(r.holding),
      broker: r.broker_id,
    }));
    console.log(`  Biggest position: ${output.biggestPositions[0].holding} ${output.biggestPositions[0].symbol}`);
  }

  // 6. Ecosystem stats
  console.log('Fetching ecosystem stats...');
  const brokerList = await fetchJSON(`${API}/broker/name`);
  const pairList = await fetchJSON(`${API}/info`);
  const chainInfo = await fetchJSON(`${API}/chain_info`);
  output.ecosystem = {
    totalDEXs: brokerList?.data?.rows?.length || 0,
    totalPairs: pairList?.data?.rows?.length || 0,
    totalChains: chainInfo?.data?.rows?.length || 0,
  };
  console.log(`  ${output.ecosystem.totalDEXs} DEXs | ${output.ecosystem.totalPairs} pairs | ${output.ecosystem.totalChains} chains`);

  // 7. Top builders by 7d volume (rate-limited)
  console.log('Fetching builder volumes (this takes ~40s due to rate limits)...');
  const builderResults = [];
  for (const b of BROKERS) {
    try {
      const d = await fetchJSON(`${API}/volume/stats?broker_id=${b.id}`);
      if (d?.data) {
        builderResults.push({
          name: b.name,
          id: b.id,
          week: d.data.perp_volume_last_7_days || 0,
          month: d.data.perp_volume_last_30_days || 0,
          allTime: d.data.perp_volume_ltd || 0,
        });
      }
      await sleep(1500);
    } catch {}
  }
  builderResults.sort((a, b) => b.week - a.week);
  output.topBuilders = builderResults.filter(b => b.week > 0).slice(0, 10);
  console.log('  Top 5 builders by 7d volume:');
  output.topBuilders.slice(0, 5).forEach((b, i) => console.log(`    ${i + 1}. ${b.name}: ${fmt(b.week)}/7d (${fmt(b.allTime)} all-time)`));

  // 8. Chains by deposits (DefiLlama)
  console.log('Fetching chain deposits from DefiLlama...');
  try {
    const protocols = await fetchJSON('https://api.llama.fi/protocols');
    const ob = protocols?.find(p => p.slug === 'orderly-bridge');
    if (ob?.chainTvls) {
      output.chainDeposits = Object.entries(ob.chainTvls)
        .sort((a, b) => b[1] - a[1])
        .map(([chain, tvl]) => ({ chain, tvl }));
      output.totalTVL = ob.tvl;
      console.log('  Top 5 chains by deposits:');
      output.chainDeposits.slice(0, 5).forEach((c, i) => console.log(`    ${i + 1}. ${c.chain}: ${fmt(c.tvl)}`));
      console.log(`  Total TVL: ${fmt(output.totalTVL)}`);
    }
  } catch (e) { console.log('  DefiLlama fetch failed:', e.message); }

  // 9. Funding rates
  console.log('Fetching funding rates...');
  const symbols = ['PERP_BTC_USDC', 'PERP_ETH_USDC', 'PERP_SOL_USDC', 'PERP_XAU_USDC', 'PERP_XAG_USDC', 'PERP_TSLA_USDC', 'PERP_NVDA_USDC'];
  output.fundingRates = {};
  for (const sym of symbols) {
    try {
      const d = await fetchJSON(`${API}/funding_rate/${sym}`);
      if (d?.data) {
        const name = sym.replace('PERP_', '').replace('_USDC', '');
        output.fundingRates[name] = {
          rate: d.data.est_funding_rate,
          rateAnnualized: (d.data.est_funding_rate * 24 * 365 * 100).toFixed(1) + '%',
        };
      }
      await sleep(500);
    } catch {}
  }
  console.log('  Funding rates:', Object.entries(output.fundingRates).map(([k, v]) => `${k}: ${v.rateAnnualized}`).join(', '));

  // 10. ORDER token price
  console.log('Fetching ORDER price...');
  try {
    const order = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=orderly-network&vs_currencies=usd&include_24hr_change=true');
    if (order?.['orderly-network']) {
      output.orderToken = {
        price: order['orderly-network'].usd,
        change24h: order['orderly-network'].usd_24h_change,
      };
      console.log(`  ORDER: $${output.orderToken.price} (${output.orderToken.change24h > 0 ? '+' : ''}${output.orderToken.change24h?.toFixed(1)}% 24h)`);
    }
  } catch {}

  // Output summary
  console.log('\n========================================');
  console.log('📊 ORDERLY DATA SUMMARY');
  console.log('========================================\n');

  if (output.volume) {
    console.log(`💰 Volume: ${fmt(output.volume['7d'])} (7d) | ${fmt(output.volume.allTime)} (all-time)`);
  }
  if (output.dailySummary) {
    console.log(`👥 Users: ${output.dailySummary.avgUsers.toLocaleString()} avg/day | ${output.dailySummary.peakUsers.toLocaleString()} peak (${output.dailySummary.peakDay})`);
    console.log(`📈 Trades: ${output.dailySummary.totalTrades7d.toLocaleString()} (7d) | Liquidations: ${output.dailySummary.totalLiquidations7d.toLocaleString()}`);
  }
  if (output.topPnlTraders?.length) {
    console.log(`\n🏆 TOP PnL TRADERS (7d):`);
    output.topPnlTraders.forEach((t, i) => {
      const short = t.address.slice(0, 6) + '...' + t.address.slice(-4);
      console.log(`  ${i + 1}. ${short}: ${fmt(t.totalPnl)} on ${t.symbols.join(', ')}`);
    });
  }
  if (output.topBuilders?.length) {
    console.log(`\n🏗️ TOP BUILDERS (7d volume):`);
    output.topBuilders.slice(0, 5).forEach((b, i) => console.log(`  ${i + 1}. ${b.name}: ${fmt(b.week)}`));
  }
  if (output.chainDeposits?.length) {
    console.log(`\n⛓️ TOP CHAINS BY DEPOSITS:`);
    output.chainDeposits.slice(0, 5).forEach((c, i) => console.log(`  ${i + 1}. ${c.chain}: ${fmt(c.tvl)}`));
  }
  if (output.ecosystem) {
    console.log(`\n🌐 ECOSYSTEM: ${output.ecosystem.totalDEXs} DEXs | ${output.ecosystem.totalPairs} pairs | ${output.ecosystem.totalChains} chains`);
  }

  // Write JSON for other scripts to consume
  const fs = require('fs');
  const outPath = '/Users/brandonkatz/.openclaw/workspace/orderly-content/latest-data.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Data saved to ${outPath}`);
}

main().catch(console.error);
