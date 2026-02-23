#!/bin/bash
# Fetch Orderly Network stats for content calendar
# Usage: bash fetch-orderly-stats.sh

echo "📊 Orderly Network Stats"
echo "========================"
echo ""

# Volume stats
VOLUME=$(curl -s "https://api-evm.orderly.org/v1/public/volume/stats")
echo "Volume:"
echo "$VOLUME" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data;
const fmt = n => n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toFixed(0);
console.log('  Today:      \$' + fmt(d.perp_volume_today));
console.log('  Yesterday:  \$' + fmt(d.perp_volume_last_1_day));
console.log('  7 days:     \$' + fmt(d.perp_volume_last_7_days));
console.log('  30 days:    \$' + fmt(d.perp_volume_last_30_days));
console.log('  YTD:        \$' + fmt(d.perp_volume_ytd));
console.log('  All time:   \$' + fmt(d.perp_volume_ltd));
"

echo ""

# Number of brokers (DEXs)
BROKERS=$(curl -s "https://api-evm.orderly.org/v1/public/broker/name")
echo "$BROKERS" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data.rows;
console.log('DEXs on Orderly: ' + d.length);
console.log('Names: ' + d.map(b => b.broker_name).join(', '));
"

echo ""

# Trading pairs count
PAIRS=$(curl -s "https://api-evm.orderly.org/v1/public/info")
echo "$PAIRS" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data.rows;
console.log('Trading pairs: ' + d.length);
const symbols = d.map(r => r.symbol.replace('PERP_','').replace('_USDC',''));
console.log('Includes: ' + symbols.slice(0,15).join(', ') + '...');
"

echo ""

# Top traders
echo "Top 5 traders (24h volume):"
cd /Users/brandonkatz/.openclaw/workspace/orderly-mcp && bash get-top-traders.sh 2>/dev/null | head -10

echo ""

# ORDER token price
ORDER=$(curl -s "https://api.coingecko.com/api/v3/simple/price?ids=orderly-network&vs_currencies=usd&include_24hr_change=true" 2>/dev/null)
echo "$ORDER" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))['orderly-network'];
  console.log('ORDER token: \$' + d.usd + ' (' + (d.usd_24h_change > 0 ? '+' : '') + d.usd_24h_change.toFixed(1) + '% 24h)');
} catch { console.log('ORDER token: price unavailable'); }
"

echo ""
echo "========================"
echo "Data pulled: $(date '+%Y-%m-%d %H:%M %Z')"
