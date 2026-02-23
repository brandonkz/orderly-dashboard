#!/bin/bash
# Fetch bullish Orderly stats for social content
# Compares current vs previous period, finds standout metrics
# Usage: bash fetch-bullish-stats.sh

echo "🔥 Orderly Bullish Stats Finder"
echo "================================"
echo ""

# Volume stats
curl -s "https://api-evm.orderly.org/v1/public/volume/stats" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data;
const fmt = n => n >= 1e9 ? '\$' + (n/1e9).toFixed(2)+'B' : n >= 1e6 ? '\$' + (n/1e6).toFixed(1)+'M' : '\$' + (n/1e3).toFixed(1)+'K';

console.log('📊 PLATFORM VOLUME');
console.log('  Today:     ' + fmt(d.perp_volume_today));
console.log('  Yesterday: ' + fmt(d.perp_volume_last_1_day));
console.log('  7 days:    ' + fmt(d.perp_volume_last_7_days));
console.log('  30 days:   ' + fmt(d.perp_volume_last_30_days));
console.log('  YTD:       ' + fmt(d.perp_volume_ytd));
console.log('  All time:  ' + fmt(d.perp_volume_ltd));
console.log('');
"

# Per-broker volume (last 7d vs previous)
echo "📊 BROKER VOLUME (7 day)"
curl -s "https://api-evm.orderly.org/v1/public/volume/broker/daily" 2>/dev/null | node -e "
try {
  const raw = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const rows = raw.data?.rows || [];
  // Aggregate per broker
  const now = new Date();
  const brokers = {};
  rows.forEach(r => {
    const d = new Date(r.date);
    const daysAgo = (now - d) / 86400000;
    const id = r.broker_id;
    if (!brokers[id]) brokers[id] = { name: r.broker_name || id, cur: 0, prev: 0 };
    if (daysAgo <= 7) brokers[id].cur += r.perp_volume || 0;
    else if (daysAgo <= 14) brokers[id].prev += r.perp_volume || 0;
  });
  
  const ranked = Object.values(brokers)
    .filter(b => b.cur > 10000)
    .map(b => ({
      ...b,
      change: b.prev > 0 ? ((b.cur - b.prev) / b.prev * 100) : 999
    }))
    .sort((a,b) => b.change - a.change);
  
  console.log('  Top movers (WoW volume change):');
  ranked.slice(0, 15).forEach((b, i) => {
    const fmt = n => n >= 1e6 ? '\$' + (n/1e6).toFixed(1)+'M' : '\$' + (n/1e3).toFixed(1)+'K';
    const arrow = b.change > 0 ? '🟢 +' : '🔴 ';
    const chg = b.change >= 999 ? 'NEW' : b.change.toFixed(0) + '%';
    console.log('  ' + (i+1) + '. ' + b.name + ': ' + fmt(b.cur) + ' (' + arrow + chg + ')');
  });
  
  console.log('');
  console.log('  Top by raw volume:');
  const byVol = Object.values(brokers).filter(b => b.cur > 10000).sort((a,b) => b.cur - a.cur);
  byVol.slice(0, 10).forEach((b, i) => {
    const fmt = n => n >= 1e9 ? '\$' + (n/1e9).toFixed(2)+'B' : n >= 1e6 ? '\$' + (n/1e6).toFixed(1)+'M' : '\$' + (n/1e3).toFixed(1)+'K';
    console.log('  ' + (i+1) + '. ' + b.name + ': ' + fmt(b.cur));
  });
} catch(e) { console.log('  Broker daily endpoint not available: ' + e.message); }
console.log('');
" 2>/dev/null

# Top traders
echo "📊 TOP TRADERS (24h)"
cd /Users/brandonkatz/.openclaw/workspace/orderly-mcp && bash get-top-traders.sh 2>/dev/null | grep -E "^\s+[0-9]" | head -5
echo ""

# DEX count
echo "📊 ECOSYSTEM"
curl -s "https://api-evm.orderly.org/v1/public/broker/name" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data.rows;
console.log('  Total DEXs: ' + d.length);
"

# Trading pairs
curl -s "https://api-evm.orderly.org/v1/public/info" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data.rows;
console.log('  Trading pairs: ' + d.length);
const stock = d.filter(r => /TSLA|NVDA|AAPL|AMZN|GOOG|META|MSFT|COIN/.test(r.symbol));
if (stock.length) console.log('  Stock perps: ' + stock.map(r => r.symbol.replace('PERP_','').replace('_USDC','')).join(', '));
"

# ORDER token
echo ""
echo "📊 ORDER TOKEN"
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=orderly-network&vs_currencies=usd&include_24hr_change=true&include_7d_change=true" 2>/dev/null | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))['orderly-network'];
  console.log('  Price: \$' + d.usd);
  console.log('  24h: ' + (d.usd_24h_change > 0 ? '+' : '') + (d.usd_24h_change||0).toFixed(1) + '%');
} catch { console.log('  Price unavailable'); }
"

echo ""
echo "================================"
echo "Pulled: $(date '+%Y-%m-%d %H:%M %Z')"
