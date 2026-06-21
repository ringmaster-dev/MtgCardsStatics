/**
 * MTG Set Page Builder
 *
 * 세트별 HTML 페이지 생성. 각 페이지에는 해당 세트 카드 중
 * 지정 포맷(Standard / Pioneer / Modern / Legacy / Vintage / Pauper)에서
 * 실제 사용되는 카드 목록이 포맷별 컬럼으로 표시됩니다.
 *
 * Usage:
 *   node buildSetPage.js --set dsk
 *   node buildSetPage.js --set mh3 --from 2026/06
 *   node buildSetPage.js --set dsk --out ./pages
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const DECKLISTS_DIR = path.join(__dirname, 'decklists');
const FORMATS = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper'];

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
function getArgEarly(name) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null; }

const SET_CODE  = (getArg('--set') || '').toLowerCase();
const FROM_STR  = getArg('--from');
const TO_STR    = getArg('--to');
const OUT_DIR   = getArg('--out') || path.join(__dirname, 'pages', 'Sets');

function parseYearMonth(str) {
  const m = str && str.match(/^(\d{4})[\/\-](\d{1,2})$/);
  return m ? { year: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null;
}

const FROM_YM = FROM_STR ? parseYearMonth(FROM_STR) : null;
const TO_YM   = TO_STR   ? parseYearMonth(TO_STR)   : null;

if (!SET_CODE) { console.error('Error: --set <code> is required (예: --set dsk)'); process.exit(1); }
if (FROM_STR && !FROM_YM) { console.error(`Invalid --from: "${FROM_STR}"`); process.exit(1); }
if (TO_STR   && !TO_YM)   { console.error(`Invalid --to: "${TO_STR}"`);   process.exit(1); }

// --- Scryfall JSON 자동 탐색 ---
function resolveCardsJson() {
  const explicit = getArgEarly('--cards-json');
  if (explicit) return explicit;
  const files = fs.readdirSync(__dirname).filter(f => /^default-cards.*\.json$/i.test(f));
  if (files.length === 0) {
    console.error('Error: default-cards JSON 파일을 찾을 수 없습니다.');
    process.exit(1);
  }
  files.sort((a, b) => b.localeCompare(a));
  if (files.length > 1) console.warn(`Warning: ${files[0]} 사용`);
  return path.join(__dirname, files[0]);
}
const CARDS_JSON = resolveCardsJson();

// --- Collector number 비교 ---
function parseCollectorNum(cn) {
  const m = (cn || '').match(/^(\d+)([a-z]*)$/i);
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [Infinity, ''];
}
function cmpCollectorNum(a, b) {
  const [an, as] = parseCollectorNum(a);
  const [bn, bs] = parseCollectorNum(b);
  return an !== bn ? an - bn : as.localeCompare(bs);
}

// --- Decklist parser ---
function parseDeckFile(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/);
  const main = new Map(), side = new Map();
  let section = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { section++; continue; }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const qty = parseInt(m[1], 10), name = m[2].trim();
    (section === 0 ? main : side).set(name, ((section === 0 ? main : side).get(name) || 0) + qty);
  }
  return { main, side };
}

// 포맷 덱리스트 파일 목록 + 실제 데이터 날짜 범위
function collectFiles(format) {
  const formatDir = path.join(DECKLISTS_DIR, format);
  if (!fs.existsSync(formatDir)) return { files: [], minDate: null, maxDate: null };
  const files = [];
  let minDate = null, maxDate = null;
  for (const year of fs.readdirSync(formatDir).filter(f => /^\d{4}$/.test(f))) {
    const yearDir = path.join(formatDir, year);
    for (const month of fs.readdirSync(yearDir).filter(f => /^\d{2}$/.test(f))) {
      const ym = { year: parseInt(year, 10), month: parseInt(month, 10) };
      if (FROM_YM && ym.year * 100 + ym.month < FROM_YM.year * 100 + FROM_YM.month) continue;
      if (TO_YM   && ym.year * 100 + ym.month > TO_YM.year * 100 + TO_YM.month)   continue;
      const monthDir = path.join(yearDir, month);
      for (const day of fs.readdirSync(monthDir).filter(f => /^\d{2}$/.test(f))) {
        const dateStr = `${year}-${month}-${day}`;
        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;
        const dayDir = path.join(monthDir, day);
        for (const file of fs.readdirSync(dayDir).filter(f => f.endsWith('.txt'))) {
          files.push(path.join(dayDir, file));
        }
      }
    }
  }
  return { files, minDate, maxDate };
}

// 포맷별 카드 집계 → Map<name, {deckCount, totalCopies}>
function aggregateFormat(format) {
  const { files, minDate, maxDate } = collectFiles(format);
  const cardMap = new Map();
  let deckCount = 0;
  for (const filepath of files) {
    let parsed;
    try { parsed = parseDeckFile(filepath); } catch { continue; }
    deckCount++;
    const deckCards = new Map();
    for (const [n, q] of parsed.main) deckCards.set(n, (deckCards.get(n) || 0) + q);
    for (const [n, q] of parsed.side) deckCards.set(n, (deckCards.get(n) || 0) + q);
    for (const [name, qty] of deckCards) {
      if (!cardMap.has(name)) cardMap.set(name, { deckCount: 0, totalCopies: 0 });
      const e = cardMap.get(name);
      e.deckCount++;
      e.totalCopies += qty;
    }
  }
  return { cardMap, deckCount, minDate, maxDate };
}

// JSON 스트리밍으로 세트 카드 추출
async function streamSetCards(setCode) {
  const setCards = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(CARDS_JSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let card;
    try { card = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line); } catch { continue; }
    if (card.set !== setCode) continue;
    if (card.lang && card.lang !== 'en') continue;
    if ((card.type_line || '').includes('Basic')) continue;
    const name = card.name;
    if (!name) continue;
    const existing = setCards.get(name);
    if (existing && cmpCollectorNum(existing.collector_number, card.collector_number) <= 0) continue;
    setCards.set(name, {
      name,
      collector_number: card.collector_number || '',
      set_name:  card.set_name  || setCode.toUpperCase(),
      rarity:    card.rarity    || '',
      type_line: card.type_line || '',
      mana_cost: card.mana_cost || '',
      cmc:       card.cmc       ?? 0,
      scryfall_uri: card.scryfall_uri || '',
      image_uri: card.image_uris?.normal
        || card.card_faces?.[0]?.image_uris?.normal
        || '',
    });
  }
  return setCards;
}

// --- HTML 생성 ---
const RARITY_CLASS = { common: 'rc', uncommon: 'ru', rare: 'rr', mythic: 'rm' };
const RARITY_LABEL = { common: 'C', uncommon: 'U', rare: 'R', mythic: 'M' };

// 사용 빈도에 따른 heat 레벨 (0~4)
function heatLevel(deckCount, maxDecks) {
  if (!deckCount || !maxDecks) return 0;
  const ratio = deckCount / maxDecks;
  if (ratio >= 0.5) return 4;
  if (ratio >= 0.25) return 3;
  if (ratio >= 0.1) return 2;
  return 1;
}

function buildHtml(setCode, setName, cards, formatStats, dataMinDate, dataMaxDate) {
  // 포맷별 최대 덱 수 (heat 계산 기준)
  const maxDecks = {};
  for (const fmt of FORMATS) {
    maxDecks[fmt] = formatStats[fmt].deckCount;
  }

  // 카드 행 생성
  const rows = cards.map(card => {
    const cells = FORMATS.map(fmt => {
      const stat = formatStats[fmt].cardMap.get(card.name);
      if (!stat) return `<td class="empty">–</td>`;
      const heat = heatLevel(stat.deckCount, maxDecks[fmt]);
      const avg  = (stat.totalCopies / stat.deckCount).toFixed(2);
      return `<td class="heat${heat}" title="${stat.deckCount} decks · avg ${avg}x">${stat.deckCount}</td>`;
    });

    const rarityClass = RARITY_CLASS[card.rarity] || '';
    const rarityLabel = RARITY_LABEL[card.rarity] || '?';
    const nameCell = card.scryfall_uri
      ? `<a href="${card.scryfall_uri}" target="_blank" rel="noopener">${escHtml(card.name)}</a>`
      : escHtml(card.name);

    return `    <tr>
      <td class="cn">${escHtml(card.collector_number)}</td>
      <td class="rarity ${rarityClass}" title="${card.rarity}">${rarityLabel}</td>
      <td class="name"${card.image_uri ? ` data-img="${card.image_uri}"` : ''}>${nameCell}</td>
      ${cells.join('\n      ')}
    </tr>`;
  }).join('\n');

  const fmtHeaders = FORMATS.map(f => `<th class="fmt">${f}</th>`).join('\n      ');

  const dateRange = [
    FROM_YM ? `${FROM_YM.year}/${String(FROM_YM.month).padStart(2, '0')}` : null,
    TO_YM   ? `${TO_YM.year}/${String(TO_YM.month).padStart(2, '0')}` : null,
  ].filter(Boolean).join(' – ');

  const formatTotals = FORMATS.map(fmt =>
    `<span class="fmt-total">${fmt}: ${formatStats[fmt].deckCount.toLocaleString()} decks</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(setName)} (${setCode.toUpperCase()}) — MTGO Usage</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  background: #0f1117;
  color: #e0e0e0;
  padding: 24px 16px 48px;
}

h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
.meta { color: #888; font-size: 0.85rem; margin-bottom: 8px; }
.fmt-totals { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 0; }
.fmt-total { color: #aaa; font-size: 0.8rem; }

/* Filter bar */
.filter-bar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.filter-bar label { color: #aaa; font-size: 0.8rem; }
.filter-bar select, .filter-bar input {
  background: #1e2030; color: #e0e0e0; border: 1px solid #333;
  border-radius: 4px; padding: 4px 8px; font-size: 0.85rem;
}

/* Table */
.table-wrap { overflow-x: auto; }
.centered-wrap { width: fit-content; margin: 0 auto; }

table {
  border-collapse: collapse;
  width: auto;
}

thead th {
  position: sticky;
  top: 0;
  background: #1a1d2e;
  color: #aaa;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 10px;
  border-bottom: 1px solid #2e3050;
  white-space: nowrap;
  z-index: 1;
}

thead th.fmt { text-align: center; }

tbody tr:hover { background: #1a1d2e; }
tbody tr { border-bottom: 1px solid #1e2030; }

td {
  padding: 5px 10px;
  vertical-align: middle;
  white-space: nowrap;
}

/* Fixed columns */
td.cn   { color: #666; font-size: 0.8rem; width: 42px; text-align: right; }
td.rarity { width: 28px; text-align: center; font-weight: 700; font-size: 0.8rem; }
td.name { white-space: normal; min-width: 180px; }
td.name a { color: #93c5fd; text-decoration: none; }
td.name a:hover { text-decoration: underline; }

/* Rarity colors */
.rc { color: #9ca3af; }
.ru { color: #34d399; }
.rr { color: #f59e0b; }
.rm { color: #f87171; }

/* Usage cells */
td.empty { color: #333; text-align: center; }


td.heat1 { background: #1a2a1a; color: #6a9a6a; text-align: center; }
td.heat2 { background: #1e3a1e; color: #7dbb7d; text-align: center; }
td.heat3 { background: #1e4e1e; color: #90d490; text-align: center; }
td.heat4 { background: #1a621a; color: #a8f0a8; text-align: center; font-weight: 600; }

/* Rarity filter hidden rows */
tr.hidden { display: none; }

footer { margin-top: 32px; color: #444; font-size: 0.75rem; }

#card-preview {
  position: fixed;
  pointer-events: none;
  z-index: 1000;
  display: none;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.7));
}
#card-preview img {
  width: 220px;
  border-radius: 10px;
  display: block;
}
</style>
</head>
<body>

<h1>${escHtml(setName)} <span style="color:#666;font-weight:400">${setCode.toUpperCase()}</span></h1>
<p class="meta">${cards.length} cards${(()=>{
  const order = ['mythic','rare','uncommon','common'];
  const counts = order.map(r => {
    const n = cards.filter(c => c.rarity === r).length;
    return n ? `<span class="${RARITY_CLASS[r]}">${RARITY_LABEL[r]}</span>&thinsp;${n}` : '';
  }).filter(Boolean).join(' &nbsp;');
  return counts ? ` (${counts})` : '';
})()} used across formats${dateRange ? ` · ${dateRange}` : ''}</p>
<div class="fmt-totals">${formatTotals}</div>
<p class="meta" style="margin-bottom:20px">Generated ${new Date().toISOString().slice(0, 10)} · Data: ${dataMinDate} – ${dataMaxDate}</p>

<div id="card-preview"><img src="" alt=""></div>

<div class="table-wrap">
<div class="centered-wrap">
<div class="filter-bar">
  <label>Rarity</label>
  <select id="rarityFilter" onchange="applyFilters()">
    <option value="">All</option>
    <option value="rm">Mythic</option>
    <option value="rr">Rare</option>
    <option value="ru">Uncommon</option>
    <option value="rc">Common</option>
  </select>
  <label style="margin-left:8px">Name</label>
  <input id="nameFilter" type="search" placeholder="Search…" oninput="applyFilters()" style="width:180px">
</div>
<table id="mainTable">
  <thead>
    <tr>
      <th>#</th>
      <th>R</th>
      <th style="text-align:left">Card</th>
      ${fmtHeaders}
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>
</div>

<script>
function applyFilters() {
  const rarity = document.getElementById('rarityFilter').value;
  const name   = document.getElementById('nameFilter').value.toLowerCase();
  document.querySelectorAll('#mainTable tbody tr').forEach(tr => {
    const rarityMatch = !rarity || tr.querySelector('.rarity')?.classList.contains(rarity);
    const nameMatch   = !name   || tr.querySelector('.name')?.textContent.toLowerCase().includes(name);
    tr.classList.toggle('hidden', !(rarityMatch && nameMatch));
  });
}

(function () {
  const preview = document.getElementById('card-preview');
  const img     = preview.querySelector('img');
  const PAD     = 16; // 커서와 이미지 사이 간격

  document.addEventListener('mouseover', e => {
    const cell = e.target.closest('td.name[data-img]');
    if (!cell) return;
    img.src = cell.dataset.img;
    preview.style.display = 'block';
  });

  document.addEventListener('mouseout', e => {
    if (!e.target.closest('td.name[data-img]')) return;
    preview.style.display = 'none';
    img.src = '';
  });

  document.addEventListener('mousemove', e => {
    if (preview.style.display === 'none') return;
    const W = preview.offsetWidth, H = preview.offsetHeight;
    let x = e.clientX + PAD, y = e.clientY + PAD;
    if (x + W > window.innerWidth)  x = e.clientX - W - PAD;
    if (y + H > window.innerHeight) y = e.clientY - H - PAD;
    preview.style.left = x + 'px';
    preview.style.top  = y + 'px';
  });
})();
</script>
</body>
</html>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Main ---
async function main() {
  // Step 1: 포맷별 카드 집계
  console.log(`Aggregating decklists for ${FORMATS.length} formats…`);
  const formatStats = {};
  let dataMinDate = null, dataMaxDate = null;
  for (const fmt of FORMATS) {
    process.stdout.write(`  ${fmt.padEnd(12)}`);
    const result = aggregateFormat(fmt);
    formatStats[fmt] = result;
    if (result.minDate && (!dataMinDate || result.minDate < dataMinDate)) dataMinDate = result.minDate;
    if (result.maxDate && (!dataMaxDate || result.maxDate > dataMaxDate)) dataMaxDate = result.maxDate;
    console.log(`${result.deckCount} decks, ${result.cardMap.size} unique cards`);
  }

  // Step 2: JSON 스트리밍으로 세트 카드 추출
  process.stdout.write(`\nStreaming JSON for set "${SET_CODE.toUpperCase()}"… `);
  const setCards = await streamSetCards(SET_CODE);
  if (setCards.size === 0) {
    console.log(`\nNo cards found for set "${SET_CODE}".`);
    process.exit(1);
  }
  const setName = [...setCards.values()][0].set_name;
  console.log(`${setCards.size} unique non-Basic cards in ${setName}`);

  // Step 3: 사용된 카드만 필터 후 번호 순 정렬
  const used = [...setCards.values()].filter(card =>
    FORMATS.some(fmt => formatStats[fmt].cardMap.has(card.name))
  );
  used.sort((a, b) => cmpCollectorNum(a.collector_number, b.collector_number));
  console.log(`Used in at least one format: ${used.length} cards`);

  // Step 4: HTML 생성
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${SET_CODE}.html`);
  const html = buildHtml(SET_CODE, setName, used, formatStats, dataMinDate, dataMaxDate);
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`\nSaved: ${outFile}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
