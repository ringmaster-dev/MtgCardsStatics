/**
 * MTG Set Index Page Builder
 *
 * pages/ 폴더의 세트 HTML 파일을 스캔하고,
 * Scryfall JSON에서 출시일을, whatsinstandard.com API에서
 * Standard 합법 여부를 읽어 두 패널 인덱스 페이지(pages/index.html)를 생성합니다.
 *
 * Usage:
 *   node buildIndex.js
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const https    = require('https');

const PAGES_DIR  = path.join(__dirname, 'pages');
const SETS_DIR   = path.join(PAGES_DIR, 'Sets');
const STANDARD_API = 'https://whatsinstandard.com/api/v6/standard.json';

// --- Scryfall JSON 자동 탐색 ---
function resolveCardsJson() {
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

// pages/Sets/ 에서 세트 코드 목록 수집
function collectSetCodes() {
  if (!fs.existsSync(SETS_DIR)) return [];
  return fs.readdirSync(SETS_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''));
}

// whatsinstandard.com API에서 현재 Standard 합법 세트 코드 집합 반환
function fetchStandardSets() {
  return new Promise((resolve, reject) => {
    https.get(STANDARD_API, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const today = new Date().toISOString().slice(0, 10);
          const codes = new Set(
            (data.sets || [])
              .filter(s => {
                const enter = s.enterDate?.exact;
                const exit  = s.exitDate?.exact;
                return (!enter || enter <= today) && (!exit || exit > today);
              })
              .map(s => (s.code || '').toLowerCase())
              .filter(Boolean)
          );
          resolve(codes);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Scryfall JSON 스트리밍으로 세트 메타데이터 수집
async function fetchSetMeta(setCodes) {
  const needed = new Set(setCodes);
  const meta   = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(CARDS_JSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    if (meta.size === needed.size) break;
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let card;
    try { card = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line); } catch { continue; }
    if (!card.set || !needed.has(card.set) || meta.has(card.set)) continue;
    if (card.lang && card.lang !== 'en') continue;
    meta.set(card.set, {
      code:        card.set,
      name:        card.set_name || card.set.toUpperCase(),
      released_at: card.released_at || '0000-00-00',
      set_type:    card.set_type || '',
    });
  }

  return meta;
}

// --- HTML 생성 ---
function renderSection(label, sets) {
  if (sets.length === 0) return '';
  const items = sets.map(s => `
      <a class="set-item" href="Sets/${s.code}.html" target="setFrame" data-code="${s.code}" title="${s.released_at}">
        <span class="set-code">${s.code.toUpperCase()}</span>
        <span class="set-name">${escHtml(s.name)}</span>
      </a>`).join('');
  return `
    <div class="section-label">${label}</div>
    ${items}`;
}

function buildHtml(standardSets, otherSets) {
  const allSections = renderSection('Standard', standardSets)
    + (otherSets.length > 0 ? renderSection('Other', otherSets) : '');

  const defaultSrc = fs.existsSync(path.join(PAGES_DIR, 'landing.html')) ? 'landing.html'
    : ((standardSets[0] || otherSets[0])?.code || '') + '.html';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MTGO Set Usage</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  background: #0f1117;
  color: #e0e0e0;
  overflow: hidden;
}

.layout {
  display: flex;
  height: 100vh;
}

/* --- Left sidebar --- */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #2e3050;
  background: #13151f;
}

.sidebar-header {
  padding: 16px 14px 12px;
  border-bottom: 1px solid #2e3050;
  flex-shrink: 0;
}

.sidebar-header h1 {
  font-size: 0.95rem;
  font-weight: 700;
  color: #e0e0e0;
  margin-bottom: 8px;
}

.sidebar-search {
  width: 100%;
  background: #1e2030;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 0.82rem;
}
.sidebar-search::placeholder { color: #555; }

.set-list {
  overflow-y: auto;
  flex: 1;
  padding-bottom: 8px;
}

.section-label {
  padding: 7px 14px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #93c5fd;
  background: #1a2540;
  border-top: 1px solid #2e3050;
  border-bottom: 1px solid #2e3050;
  margin-top: 8px;
}

.section-label:first-child {
  border-top: none;
  margin-top: 0;
}

.set-item {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 7px;
  padding: 6px 14px;
  text-decoration: none;
  color: #ccc;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}

.set-item:hover {
  background: #1a1d2e;
  color: #e0e0e0;
}

.set-item.active {
  background: #1a1d2e;
  border-left-color: #4a7fd4;
  color: #e0e0e0;
}

.set-code {
  font-size: 0.72rem;
  font-weight: 700;
  color: #4a7fd4;
  letter-spacing: 0.06em;
  flex-shrink: 0;
  width: 2.8rem;
}

.set-name {
  font-size: 0.85rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.set-item.hidden { display: none; }
.section-label.hidden { display: none; }

/* --- Sidebar footer --- */
.sidebar-footer {
  flex-shrink: 0;
  border-top: 1px solid #2e3050;
  padding: 8px 10px;
}

.sidebar-footer a {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #4a7fd4;
  text-decoration: none;
  padding: 7px 10px;
  border-radius: 5px;
  border: 1px solid #2e3050;
  text-align: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.sidebar-footer a:hover {
  background: #1a2540;
  color: #93c5fd;
  border-color: #4a7fd4;
}

/* --- Resize handle --- */
.resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: #2e3050;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
}
.resize-handle:hover,
.resize-handle.dragging {
  background: #4a7fd4;
}

/* --- Right frame --- */
.frame-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.set-frame {
  flex: 1;
  border: none;
  background: #0f1117;
}
</style>
</head>
<body>

<div class="layout" id="layout">
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h1>MTGO Set Usage</h1>
      <input class="sidebar-search" type="search" placeholder="Search sets…" oninput="filterSets(this.value)">
    </div>
    <div class="set-list" id="setList">
      ${allSections}
    </div>
    <div class="sidebar-footer">
      <a href="landing.html" target="setFrame">New Cards</a>
      <a href="about.html" target="setFrame">About</a>
    </div>
  </nav>

  <div class="resize-handle" id="resizeHandle"></div>

  <div class="frame-wrap">
    <iframe class="set-frame" name="setFrame" id="setFrame" src="${defaultSrc}"></iframe>
  </div>
</div>

<script>
(function () {
  const first = document.querySelector('.set-item');
  if (first) first.classList.add('active');
})();

document.getElementById('setList').addEventListener('click', e => {
  const item = e.target.closest('.set-item');
  if (!item) return;
  document.querySelectorAll('.set-item').forEach(el => el.classList.remove('active'));
  item.classList.add('active');
});

function filterSets(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.set-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.classList.toggle('hidden', !!lower && !text.includes(lower));
  });
  document.querySelectorAll('.section-label').forEach(label => {
    let next = label.nextElementSibling;
    let allHidden = true;
    while (next && !next.classList.contains('section-label')) {
      if (!next.classList.contains('hidden')) { allHidden = false; break; }
      next = next.nextElementSibling;
    }
    label.classList.toggle('hidden', allHidden);
  });
}

// --- Sidebar resize ---
(function () {
  const handle  = document.getElementById('resizeHandle');
  const sidebar = document.getElementById('sidebar');
  const frame   = document.getElementById('setFrame');

  // 실제 세트 이름 너비를 측정해 min/max 결정
  function measureLimits() {
    const ruler = document.createElement('span');
    ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;' +
      'font-size:0.85rem;font-family:inherit;';
    document.body.appendChild(ruler);

    const codeEl  = document.querySelector('.set-code');
    const codeW   = codeEl ? codeEl.getBoundingClientRect().width : 45;
    const overhead = 3 + 14 + codeW + 7 + 14; // border + pad-l + code + gap + pad-r

    let minTW = Infinity, maxTW = 0;
    document.querySelectorAll('.set-name').forEach(el => {
      ruler.textContent = el.textContent;
      const w = ruler.offsetWidth;
      if (w < minTW) minTW = w;
      if (w > maxTW) maxTW = w;
    });
    document.body.removeChild(ruler);

    return { min: Math.ceil(overhead + minTW) + 10, max: Math.ceil(overhead + maxTW) + 10 };
  }

  const { min: MIN_W, max: MAX_W } = measureLimits();
  sidebar.style.width = MAX_W + 'px';
  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    frame.style.pointerEvents = 'none'; // prevent iframe from eating events
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.min(MAX_W, Math.max(MIN_W, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    frame.style.pointerEvents = '';
    document.body.style.cursor = '';
  });
})();
</script>
</body>
</html>`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Main ---
async function main() {
  const codes = collectSetCodes();
  if (codes.length === 0) {
    console.log('pages/ 에 세트 HTML이 없습니다. 먼저 buildSetPage.js 를 실행하세요.');
    process.exit(0);
  }
  console.log(`Found ${codes.length} set page(s): ${codes.join(', ')}`);

  process.stdout.write('Fetching Standard set list from whatsinstandard.com… ');
  let standardCodes = new Set();
  try {
    standardCodes = await fetchStandardSets();
    console.log(`${standardCodes.size} sets in Standard`);
  } catch (e) {
    console.warn(`failed (${e.message}) — Standard 구분 없이 진행`);
  }

  process.stdout.write('Fetching set metadata from Scryfall JSON… ');
  const meta = await fetchSetMeta(codes);
  console.log('done');

  const today = new Date().toISOString().slice(0, 10);
  const sets = codes
    .map(code => meta.get(code) || { code, name: code.toUpperCase(), released_at: '0000-00-00', set_type: '' })
    .filter(s => s.released_at <= today);
  sets.sort((a, b) => b.released_at.localeCompare(a.released_at));

  const standardSets = sets.filter(s => standardCodes.has(s.code));
  const otherSets    = sets.filter(s => !standardCodes.has(s.code));

  const outFile = path.join(PAGES_DIR, 'index.html');
  fs.writeFileSync(outFile, buildHtml(standardSets, otherSets), 'utf8');
  console.log(`Saved: ${outFile}  (${standardSets.length} Standard, ${otherSets.length} Other)`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
