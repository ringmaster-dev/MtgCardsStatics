#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "==> [1/4] Building known cards index..."
node buildKnownCards.js

echo ""
echo "==> [2/4] Building set pages..."
for html in pages/Sets/*.html; do
  set=$(basename "$html" .html)
  printf "  → %-6s" "$set"
  node buildSetPage.js --set "$set" 2>&1 | grep -o 'Saved:.*' || true
done

echo ""
echo "==> [3/4] Building NewCards pages..."
node buildLanding.js

echo ""
echo "==> [4/4] Building index page..."
node buildIndex.js

echo ""
echo "Done."
