/**
 * Landing & New Cards Page Builder
 *
 * data/known-cards.json 을 읽어 첫 등장 날짜별로
 * pages/NewCards/{year}/{month}/{YYYY-MM-DD}.html 을 생성하고,
 * pages/landing.html 은 최신 날짜 페이지로 리다이렉트합니다.
 *
 * Usage:
 *   node buildLanding.js
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const KNOWN_FILE      = path.join(__dirname, 'data', 'known-cards.json');
const PAGES_DIR       = path.join(__dirname, 'pages');
const NEW_CARDS_DIR   = path.join(PAGES_DIR, 'NewCards');
const EXCLUDE_CONFIG  = path.join(__dirname, 'config', 'image-exclude.json');

function resolveCardsJson() {
  const files = fs.readdirSync(__dirname).filter(f => /^default-cards.*\.json$/i.test(f));
  if (files.length === 0) { console.error('default-cards JSON 없음'); process.exit(1); }
  files.sort((a, b) => b.localeCompare(a));
  return path.join(__dirname, files[0]);
}

// known-cards.json files 필드에서 포맷 추출
// "decklists/Modern/2026/06/18/player.txt" → "Modern"
function extractFormats(files) {
  return new Set(files.map(f => f.split('/')[1]).filter(Boolean));
}

// Scryfall JSON 한 번 스캔 — 모든 카드의 최신 판본 이미지 수집
// config/image-exclude.json 로드
function loadExcludeConfig() {
  if (!fs.existsSync(EXCLUDE_CONFIG)) return {};
  try { return JSON.parse(fs.readFileSync(EXCLUDE_CONFIG, 'utf8')); } catch { return {}; }
}

function isExcludedSet(card, cfg) {
  const nameContains = cfg.excludeSetNameContains || [];
  const types        = cfg.excludeSetTypes        || [];
  const codes        = cfg.excludeSetCodes        || [];
  const setName = card.set_name || '';
  const setType = card.set_type || '';
  const setCode = (card.set || '').toLowerCase();
  return nameContains.some(s => setName.includes(s))
      || types.includes(setType)
      || codes.includes(setCode);
}

// 수록 번호 비교 (예: "10a" < "10b" < "11")
function cmpCollectorNum(a, b) {
  const parse = s => { const m = String(s).match(/^(\d+)([a-z]*)$/i); return m ? [parseInt(m[1],10), m[2].toLowerCase()] : [Infinity, '']; };
  const [an, as] = parse(a);
  const [bn, bs] = parse(b);
  return an !== bn ? an - bn : as.localeCompare(bs);
}

// 덱 파일 이름 ↔ Scryfall 이름 매핑
// MTGO 덱 파일의 표기 방식:
//   split 카드  → "Cease/Desist"  (Scryfall: "Cease // Desist")
//   adventure/DFC → "Zanarkand, Ancient Metropolis"  (Scryfall: "Zanarkand, Ancient Metropolis // Lasting Fayth")
function matchNeeded(scryfallName, needed) {
  if (needed.has(scryfallName)) return scryfallName;
  if (!scryfallName.includes(' // ')) return null;
  // 앞면 이름만 (adventure / DFC)
  const front = scryfallName.split(' // ')[0];
  if (needed.has(front)) return front;
  // 공백 없이 / 로 연결 (split 카드)
  const slashJoined = scryfallName.replace(/ \/\/ /g, '/');
  if (needed.has(slashJoined)) return slashJoined;
  return null;
}

async function fetchAllCardImages(cardNames) {
  const needed = new Set(cardNames);
  // name → { imageUrl, setName, rarity, releasedAt, collectorNumber }
  const result = new Map();
  const excludeCfg = loadExcludeConfig();

  console.log(`Scanning Scryfall JSON for ${needed.size} cards…`);
  const rl = readline.createInterface({
    input: fs.createReadStream(resolveCardsJson(), { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let card;
    try { card = JSON.parse(line.endsWith(',') ? line.slice(0,-1) : line); } catch { continue; }
    if (!card.name) continue;
    const deckName = matchNeeded(card.name, needed);
    if (!deckName) continue;
    if (card.lang && card.lang !== 'en') continue;
    if (isExcludedSet(card, excludeCfg)) continue;
    const img = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '';
    if (!img) continue;
    const prev = result.get(deckName);
    const releasedAt = card.released_at || '';
    const collectorNumber = card.collector_number || '';
    // 최신 세트 우선, 같은 세트면 가장 빠른 수록 번호 우선
    if (!prev || releasedAt > prev.releasedAt ||
        (releasedAt === prev.releasedAt && cmpCollectorNum(collectorNumber, prev.collectorNumber) < 0)) {
      result.set(deckName, {
        imageUrl:        img,
        setName:         card.set_name || card.set?.toUpperCase() || '',
        rarity:          card.rarity || '',
        releasedAt,
        collectorNumber,
        scryfallUri:     card.scryfall_uri || '',
      });
    }
  }
  console.log(`  → ${result.size} images found`);
  return result;
}

const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const RARITY_COLOR = { mythic: '#e8a020', rare: '#c0a060', uncommon: '#8ab4d4', common: '#aaa' };
const RARITY_LABEL = { mythic: 'M', rare: 'R', uncommon: 'U', common: 'C' };
const FORMAT_PRIORITY = ['Standard','Pioneer','Modern','Legacy','Vintage','Pauper','Premodern'];

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// _meta.json 캐시: dirAbsPath → eventUrl | null
const dirUrlCache = new Map();
function getEventUrl(relFilePath) {
  const dir = path.join(__dirname, path.dirname(relFilePath));
  if (!dirUrlCache.has(dir)) {
    const metaPath = path.join(dir, '_meta.json');
    let url = null;
    if (fs.existsSync(metaPath)) {
      try { url = JSON.parse(fs.readFileSync(metaPath, 'utf8')).eventUrl || null; } catch {}
    }
    dirUrlCache.set(dir, url);
  }
  return dirUrlCache.get(dir);
}

// MTGO 이벤트 URL에서 표시용 레이블 추출
// "https://www.mtgo.com/decklist/modern-league-2026-06-18#deck_Player" → "Modern League"
function eventLabel(url) {
  const cleanUrl = url.split('#')[0];
  const m = cleanUrl.match(/\/decklist\/(.+?)-(20\d{2}-\d{2}-\d{2})\d*$/);
  if (!m) return 'MTGO';
  return m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderCard(name, scryfallMeta, eventUrls) {
  const meta   = scryfallMeta.get(name) || {};
  const img    = meta.imageUrl || '';
  const rColor = RARITY_COLOR[meta.rarity] || '#aaa';
  const rLabel = RARITY_LABEL[meta.rarity] || '?';

  const scryfallLink = meta.scryfallUri
    ? `<a class="card-ext-link" href="${escHtml(meta.scryfallUri)}" target="_blank" rel="noopener">Scryfall ↗</a>`
    : '';

  const mtgoLinks = [...(eventUrls || [])].map(u =>
    `<a class="card-ext-link" href="${escHtml(u)}" target="_blank" rel="noopener">${escHtml(eventLabel(u))} ↗</a>`
  ).join('');

  return `
    <div class="card-item">
      <div class="card-img-wrap">
        ${img
          ? `<img src="${escHtml(img)}" alt="${escHtml(name)}" loading="lazy">`
          : `<div class="card-no-img">${escHtml(name)}</div>`}
      </div>
      <div class="card-info">
        <div class="card-name-line">
          <span class="card-rarity" style="color:${rColor}">${rLabel}</span>
          <span class="card-name">${escHtml(name)}</span>
        </div>
        <span class="card-set">${escHtml(meta.setName)}</span>
        ${scryfallLink || mtgoLinks ? `<div class="card-links">${scryfallLink}${mtgoLinks}</div>` : ''}
      </div>
    </div>`;
}

function buildPageHtml(date, groups, scryfallMeta, cardEventUrls, uniqueCount, prevDate, nextDate, rootPrefix) {
  const sections = [...groups.entries()].map(([fmt, names]) => `
  <div class="fmt-group">
    <h2 class="fmt-heading">${escHtml(fmt)}</h2>
    <div class="card-grid">
      ${names.map(n => renderCard(n, scryfallMeta, cardEventUrls.get(n))).join('')}
    </div>
  </div>`).join('');

  const prevLink = prevDate
    ? `<a class="nav-link" href="${rootPrefix}${prevDate.replace(/-/g,'/').slice(0,7)}/${prevDate}.html">← ${prevDate}</a>`
    : `<span class="nav-link disabled">←</span>`;
  const nextLink = nextDate
    ? `<a class="nav-link" href="${rootPrefix}${nextDate.replace(/-/g,'/').slice(0,7)}/${nextDate}.html">→ ${nextDate}</a>`
    : `<span class="nav-link disabled">→</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New Cards – ${date}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  background: #0f1117;
  color: #e0e0e0;
  padding: 28px 32px 48px;
}
.page-header { margin-bottom: 8px; }
.page-header h1 { font-size: 1.3rem; font-weight: 700; color: #e0e0e0; margin-bottom: 4px; }
.page-header .subtitle { font-size: 0.82rem; color: #555; }

.date-nav {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  margin-top: 12px;
}
.nav-link {
  font-size: 0.78rem;
  color: #4a7fd4;
  text-decoration: none;
  padding: 3px 8px;
  border: 1px solid #2e3050;
  border-radius: 4px;
}
.nav-link:hover { background: #1a2540; }
.nav-link.disabled { color: #333; border-color: #1e2030; pointer-events: none; }

.fmt-group { margin-bottom: 32px; }
.fmt-heading {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #93c5fd;
  background: #1a2540;
  border-top: 1px solid #2e3050;
  border-bottom: 1px solid #2e3050;
  padding: 7px 10px;
  margin-bottom: 16px;
}
.card-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.card-item { width: 160px; display: flex; flex-direction: column; gap: 6px; }
.card-img-wrap img { width: 160px; border-radius: 8px; display: block; }
.card-no-img {
  width: 160px; height: 223px; border-radius: 8px;
  background: #1a1d2e; display: flex; align-items: center;
  justify-content: center; font-size: 0.75rem; color: #555;
  padding: 8px; text-align: center;
}
.card-info { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; }
.card-name-line { display: flex; align-items: baseline; gap: 5px; }
.card-rarity { font-size: 0.68rem; font-weight: 700; flex-shrink: 0; }
.card-name { font-size: 0.78rem; color: #ccc; line-height: 1.3; }
.card-set { font-size: 0.68rem; color: #555; }
.card-links { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.card-ext-link {
  font-size: 0.62rem;
  color: #4a7fd4;
  text-decoration: none;
  padding: 1px 5px;
  border: 1px solid #2e3050;
  border-radius: 3px;
  white-space: nowrap;
}
.card-ext-link:hover { background: #1a2540; color: #93c5fd; }
</style>
</head>
<body>
<div class="page-header">
  <h1>New Cards · ${date}</h1>
  <p class="subtitle">${uniqueCount} card${uniqueCount !== 1 ? 's' : ''} appearing in competitive MTGO decklists for the first time</p>
</div>
<div class="date-nav">${prevLink}${nextLink}</div>
${sections}
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(KNOWN_FILE)) {
    console.error('data/known-cards.json 없음. 먼저 buildKnownCards.js 를 실행하세요.');
    process.exit(1);
  }

  const knownData = JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8'));
  console.log(`Loaded ${knownData.cardCount} cards`);

  // 날짜별 그룹: Map<date, Map<cardName, Set<format>>>
  // 카드별 이벤트 URL: Map<cardName, Set<eventUrl>>
  const byDate = new Map();
  const cardEventUrls = new Map(); // name → Set<eventUrl>
  for (const [name, { date, files }] of Object.entries(knownData.cards)) {
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(name, extractFormats(files));

    const urls = new Set();
    for (const f of files) {
      const u = getEventUrl(f);
      if (u) {
        const player = path.basename(f, '.txt');
        urls.add(`${u}#deck_${player}`);
      }
    }
    cardEventUrls.set(name, urls);
  }

  const allDates = [...byDate.keys()].sort();
  console.log(`Debut dates: ${allDates.length}`);

  // Scryfall JSON 한 번 스캔
  const allNames = Object.keys(knownData.cards);
  const scryfallMeta = await fetchAllCardImages(allNames);

  // 각 날짜별 페이지 생성
  let generated = 0;
  for (let i = 0; i < allDates.length; i++) {
    const date      = allDates[i];
    const prevDate  = i > 0 ? allDates[i - 1] : null;
    const nextDate  = i < allDates.length - 1 ? allDates[i + 1] : null;
    const cardMap   = byDate.get(date); // Map<name, Set<format>>

    // 포맷별 그룹화 (FORMAT_PRIORITY 순)
    const groups = new Map();
    for (const [name, formats] of cardMap) {
      for (const fmt of formats) {
        if (!groups.has(fmt)) groups.set(fmt, []);
        groups.get(fmt).push(name);
      }
    }

    // 그룹 순서 정렬
    const sortedGroups = new Map(
      [...groups.entries()].sort((a, b) => {
        const ia = FORMAT_PRIORITY.indexOf(a[0]);
        const ib = FORMAT_PRIORITY.indexOf(b[0]);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a[0].localeCompare(b[0]);
      })
    );

    // 각 그룹 내 레어도 → 이름 순 정렬
    for (const names of sortedGroups.values()) {
      names.sort((a, b) => {
        const ra = RARITY_ORDER[scryfallMeta.get(a)?.rarity] ?? 9;
        const rb = RARITY_ORDER[scryfallMeta.get(b)?.rarity] ?? 9;
        return ra !== rb ? ra - rb : a.localeCompare(b);
      });
    }

    // 출력 경로: pages/NewCards/YYYY/MM/YYYY-MM-DD.html
    const [year, month] = date.split('-');
    const outDir = path.join(NEW_CARDS_DIR, year, month);
    fs.mkdirSync(outDir, { recursive: true });

    // rootPrefix: NewCards 루트로의 상대 경로 (prev/next 링크용)
    const rootPrefix = '../../';

    const html = buildPageHtml(date, sortedGroups, scryfallMeta, cardEventUrls, cardMap.size, prevDate, nextDate, rootPrefix);
    fs.writeFileSync(path.join(outDir, `${date}.html`), html, 'utf8');
    generated++;
  }

  console.log(`Generated ${generated} pages under pages/NewCards/`);

  // landing.html → 최신 날짜 페이지로 리다이렉트
  const latestDate = allDates.at(-1);
  const [ly, lm] = latestDate.split('-');
  const landingTarget = `NewCards/${ly}/${lm}/${latestDate}.html`;
  const landingHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${landingTarget}">
</head><body></body></html>`;
  fs.writeFileSync(path.join(PAGES_DIR, 'landing.html'), landingHtml, 'utf8');
  console.log(`landing.html → ${landingTarget}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
