'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const DECKLISTS_DIR = path.join(__dirname, 'decklists');
const OUT_FILE      = path.join(__dirname, 'pages', 'pauper.html');

function resolveCardsJson() {
  const files = fs.readdirSync(__dirname).filter(f => /^default-cards.*\.json$/i.test(f));
  if (files.length === 0) { console.error('default-cards JSON 없음'); process.exit(1); }
  files.sort((a, b) => b.localeCompare(a));
  return path.join(__dirname, files[0]);
}

function parseCollectorNum(cn) {
  const m = (cn || '').match(/^(\d+)([a-z]*)$/i);
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [Infinity, ''];
}
function cmpCollectorNum(a, b) {
  const [an, as] = parseCollectorNum(a);
  const [bn, bs] = parseCollectorNum(b);
  return an !== bn ? an - bn : as.localeCompare(bs);
}

function collectPauperCards() {
  const formatDir = path.join(DECKLISTS_DIR, 'Pauper');
  if (!fs.existsSync(formatDir)) { console.error('Pauper decklists 없음'); process.exit(1); }

  const cardDecks = new Map();
  let totalDecks = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.txt')) continue;
      totalDecks++;
      const seen = new Set();
      for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*\d+\s+(.+)$/);
        if (m) seen.add(m[1].trim());
      }
      for (const name of seen) cardDecks.set(name, (cardDecks.get(name) || 0) + 1);
    }
  }
  walk(formatDir);
  return { cardDecks, totalDecks };
}

// split 카드 이름 매칭 ("Cease/Desist" ↔ "Cease // Desist")
function matchNeeded(scryfallName, needed) {
  if (needed.has(scryfallName)) return scryfallName;
  if (!scryfallName.includes(' // ')) return null;
  const front = scryfallName.split(' // ')[0];
  if (needed.has(front)) return front;
  const slashJoined = scryfallName.replace(/ \/\/ /g, '/');
  if (needed.has(slashJoined)) return slashJoined;
  return null;
}

// 각 카드의 가장 최근 common 인쇄 세트 + collector_number 조회
async function buildCardIndex(cardNames) {
  const needed = new Set(cardNames);
  // deckName → { setCode, setName, releasedAt, collectorNumber }
  const cardInfo = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(resolveCardsJson(), { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let card;
    try { card = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line); } catch { continue; }
    if (!card.name) continue;
    const deckName = matchNeeded(card.name, needed);
    if (!deckName) continue;
    if (card.lang && card.lang !== 'en') continue;
    if (card.rarity !== 'common') continue;
    if ((card.type_line || '').includes('Basic Land')) continue;

    const releasedAt = card.released_at || '';
    const prev = cardInfo.get(deckName);
    if (!prev || releasedAt > prev.releasedAt ||
        (releasedAt === prev.releasedAt &&
         cmpCollectorNum(card.collector_number, prev.collectorNumber) < 0)) {
      cardInfo.set(deckName, {
        setCode:         card.set,
        setName:         card.set_name || card.set?.toUpperCase() || '',
        releasedAt,
        collectorNumber: card.collector_number || '',
      });
    }
  }
  return cardInfo;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildHtml(setColumns, totalDecks) {
  const cols = setColumns.map(({ setCode, setName, releasedAt, cards }) => {
    const items = cards.map(({ name, deckCount, collectorNumber }) => {
      const pct = (deckCount / totalDecks * 100).toFixed(1);
      return `      <li title="${deckCount} decks · ${pct}%"><span class="cn">${escHtml(collectorNumber)}</span>${escHtml(name)}</li>`;
    }).join('\n');
    return `
  <div class="set-col">
    <div class="set-hd">
      <span class="set-code">${escHtml(setCode.toUpperCase())}</span>
      <span class="set-name">${escHtml(setName)}</span>
      <span class="set-meta">${releasedAt.slice(0,7)} · ${cards.length} cards</span>
    </div>
    <ul class="card-list">
${items}
    </ul>
  </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pauper — Cards by Set</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  background: #0f1117;
  color: #e0e0e0;
  padding: 24px 20px 48px;
}
h1 { font-size: 1.3rem; font-weight: 700; margin-bottom: 4px; }
.meta { color: #555; font-size: 0.8rem; margin-bottom: 20px; }

.columns {
  display: flex;
  flex-direction: row;
  gap: 0;
  overflow-x: auto;
  align-items: flex-start;
}
.set-col {
  min-width: 180px;
  max-width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #1e2030;
}
.set-col:last-child { border-right: none; }

.set-hd {
  position: sticky;
  top: 0;
  background: #1a1d2e;
  border-bottom: 1px solid #2e3050;
  padding: 8px 10px 6px;
  z-index: 1;
}
.set-code {
  display: block;
  font-size: 0.9rem;
  font-weight: 700;
  color: #93c5fd;
  letter-spacing: 0.05em;
}
.set-name {
  display: block;
  font-size: 0.72rem;
  color: #aaa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.set-meta {
  display: block;
  font-size: 0.68rem;
  color: #444;
  margin-top: 2px;
}

.card-list {
  list-style: none;
  padding: 6px 0;
}
.card-list li {
  padding: 3px 10px;
  font-size: 0.78rem;
  color: #ccc;
  border-bottom: 1px solid #14161f;
  display: flex;
  gap: 6px;
  align-items: baseline;
  cursor: default;
}
.card-list li:hover { background: #1a1d2e; color: #fff; }
.cn {
  color: #444;
  font-size: 0.7rem;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}
</style>
</head>
<body>
<h1>Pauper — Cards by Set</h1>
<p class="meta">${totalDecks.toLocaleString()} decks · Generated ${new Date().toISOString().slice(0,10)} · newest set leftmost · sorted by collector number</p>
<div class="columns">
${cols}
</div>
</body>
</html>`;
}

async function main() {
  process.stdout.write('Collecting Pauper decklists… ');
  const { cardDecks, totalDecks } = collectPauperCards();
  console.log(`${totalDecks} decks, ${cardDecks.size} unique cards`);

  process.stdout.write('Looking up Scryfall JSON for common printings… ');
  const cardInfo = await buildCardIndex([...cardDecks.keys()]);
  console.log(`${cardInfo.size} cards matched`);

  // 세트별 그룹화
  const bySet = new Map();
  for (const [name, deckCount] of cardDecks) {
    const info = cardInfo.get(name);
    if (!info) continue;
    const { setCode, setName, releasedAt, collectorNumber } = info;
    if (!bySet.has(setCode)) bySet.set(setCode, { setCode, setName, releasedAt, cards: [] });
    bySet.get(setCode).cards.push({ name, deckCount, collectorNumber });
  }

  // 세트: 최신 순, 카드: collector number 순
  const setColumns = [...bySet.values()]
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

  for (const col of setColumns) {
    col.cards.sort((a, b) => cmpCollectorNum(a.collectorNumber, b.collectorNumber));
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, buildHtml(setColumns, totalDecks), 'utf8');
  console.log(`Saved: ${OUT_FILE}  (${setColumns.length} sets)`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
