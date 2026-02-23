#!/usr/bin/env node
/**
 * Fetch bullish Orderly stats for Mon/Wed/Fri content drops
 * Finds the best stories: broker growth, volume spikes, ecosystem milestones
 */

const BROKERS = [
  { id: 'raydium', name: 'Raydium' },
  { id: 'woofi_pro', name: 'WOOFi Pro' },
  { id: 'quick_perps', name: 'QuickSwap' },
  { id: 'logx', name: 'LogX' },
  { id: 'orderly', name: 'Orderly' },
  { id: 'empyreal', name: 'Empyreal' },
  { id: 'sharpe_ai', name: 'Sharpe AI' },
  { id: 'kodiak_fi', name: 'KodiakFi' },
  { id: 'ascendex', name: 'AscendEX' },
  { id: 'emdx_dex', name: 'EMDX' },
  { id: 'bitoro_network', name: 'Bitoro Network' },
  { id: 'vooi', name: 'vooi.io' },
  { id: 'linear_finance', name: 'Linear Finance' },
  { id: 'saros', name: 'Saros' },
  { id: 'jojo', name: 'JOJO' },
  { id: 'citrex', name: 'Citrex Markets' },
  { id: 'rage_trade', name: 'Rage Trade' },
  { id: 'book_x', name: 'BookX' },
  { id: 'filament', name: 'Filament' },
  { id: 'btse_dex', name: 'BTSE DEX' },
];

const fmt = n => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  console.log('🔥 ORDERLY BULLISH STATS');
  console.log('========================\n');

  // 1. Platform totals
  const vol = (await fetchJSON('https://api-evm.orderly.org/v1/public/volume/stats')).data;
  console.log('📊 PLATFORM VOLUME');
  console.log(`  Today:     ${fmt(vol.perp_volume_today)}`);
  console.log(`  7 days:    ${fmt(vol.perp_volume_last_7_days)}`);
  console.log(`  30 days:   ${fmt(vol.perp_volume_last_30_days)}`);
  console.log(`  YTD:       ${fmt(vol.perp_volume_ytd)}`);
  console.log(`  All time:  ${fmt(vol.perp_volume_ltd)}`);
  console.log('');

  // 2. Per-broker stats — find growth stories
  console.log('📊 BROKER BREAKDOWN (hunting for bullish stories...)\n');
  
  const results = [];
  for (const b of BROKERS) {
    try {
      const d = (await fetchJSON(`https://api-evm.orderly.org/v1/public/volume/stats?broker_id=${b.id}`)).data;
      if (!d) continue;
      
      const daily7 = d.perp_volume_last_7_days || 0;
      const daily30 = d.perp_volume_last_30_days || 0;
      
      // Estimate previous 7 days from 30-day minus 7-day (rough)
      const prev7est = Math.max(0, (daily30 - daily7) / 3.28); // ~3.28 weeks remaining
      const wowChange = prev7est > 1000 ? ((daily7 - prev7est) / prev7est * 100) : null;
      
      results.push({
        name: b.name,
        id: b.id,
        today: d.perp_volume_today || 0,
        yesterday: d.perp_volume_last_1_day || 0,
        week: daily7,
        month: daily30,
        ytd: d.perp_volume_ytd || 0,
        allTime: d.perp_volume_ltd || 0,
        wowEst: wowChange,
      });
    } catch {}
  }

  // Sort by weekly volume
  results.sort((a, b) => b.week - a.week);
  
  console.log('  BY WEEKLY VOLUME:');
  results.filter(r => r.week > 1000).forEach((r, i) => {
    const wow = r.wowEst !== null ? ` (est ${r.wowEst > 0 ? '+' : ''}${r.wowEst.toFixed(0)}% WoW)` : '';
    console.log(`  ${i + 1}. ${r.name}: ${fmt(r.week)} /7d${wow}`);
  });

  console.log('');
  console.log('  GROWTH STORIES (estimated WoW increase):');
  const growers = results
    .filter(r => r.wowEst !== null && r.wowEst > 20 && r.week > 10000)
    .sort((a, b) => b.wowEst - a.wowEst);
  
  if (growers.length > 0) {
    growers.forEach(r => {
      console.log(`  🟢 ${r.name}: +${r.wowEst.toFixed(0)}% WoW (${fmt(r.week)} this week)`);
    });
  } else {
    console.log('  No major WoW spikes detected this week');
  }

  console.log('');
  console.log('  ALL-TIME VOLUME LEADERS:');
  results.sort((a, b) => b.allTime - a.allTime);
  results.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name}: ${fmt(r.allTime)}`);
  });

  // 3. Ecosystem count
  console.log('');
  const brokerList = (await fetchJSON('https://api-evm.orderly.org/v1/public/broker/name')).data.rows;
  const pairList = (await fetchJSON('https://api-evm.orderly.org/v1/public/info')).data.rows;
  console.log(`📊 ECOSYSTEM: ${brokerList.length} DEXs, ${pairList.length} trading pairs`);

  // 4. ORDER token
  console.log('');
  try {
    const order = (await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=orderly-network&vs_currencies=usd&include_24hr_change=true'))['orderly-network'];
    console.log(`📊 ORDER: $${order.usd} (${order.usd_24h_change > 0 ? '+' : ''}${(order.usd_24h_change || 0).toFixed(1)}% 24h)`);
  } catch { console.log('📊 ORDER: price unavailable'); }

  // 5. Generate tweet suggestions (SAFE METRICS ONLY — no raw volume numbers)
  console.log('\n');
  console.log('✍️  SUGGESTED TWEETS (pick the best)\n');
  console.log('⚠️  NOTE: Do NOT use single trader $ amounts (inflated). Volume numbers are OK.\n');

  // Ecosystem scale
  console.log(`1. "${brokerList.length} DEXs live on Orderly. ${pairList.length} trading pairs. One shared orderbook across EVM + Solana. No code required to launch."`);
  console.log('');

  // Broker spotlight
  if (results[0]) {
    const top = results.sort((a, b) => b.week - a.week).filter(r => r.name !== 'Orderly')[0];
    if (top) {
      console.log(`2. "${top.name} is live on Orderly. No matching engine. No liquidity bootstrap. Just plug in, set your fees, and earn. ${brokerList.length - 1} other teams figured this out already."`);
      console.log('');
    }
  }

  // Growth story (relative, not absolute)
  if (growers[0]) {
    const g = growers[0];
    console.log(`3. "${g.name} volume up ~${g.wowEst.toFixed(0)}% week over week on Orderly. The no-code DEX play is working."`);
    console.log('');
  }

  // Stock perps
  const stockPairs = pairList.filter(r => /TSLA|NVDA|AAPL|AMZN|GOOG|META|MSFT|COIN/.test(r.symbol));
  if (stockPairs.length > 0) {
    const names = stockPairs.map(r => r.symbol.replace('PERP_','').replace('_USDC','')).join(', ');
    console.log(`4. "Stock perps live on Orderly: ${names}. No KYC. No market hours. Trade NVDA at 3 AM on a Sunday."`);
    console.log('');
  }

  // Omnichain angle
  console.log(`5. "${brokerList.length} frontends. One liquidity pool. Solana and EVM traders filling against the same orderbook. That's omnichain done right."`);
  console.log('');

  // Builder CTA
  console.log(`6. "If you have a community that trades, you're leaving money on the table. Launch your own perp DEX on Orderly. No code. You keep the fees. ${brokerList.length} teams already did."`);
  console.log('');

  console.log('========================');
  console.log(`Pulled: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`);
}

main().catch(console.error);
