/**
 * MTGO Decklist Downloader
 *
 * Usage:
 *   node downloadDecklists.js                        # 이번 달만
 *   node downloadDecklists.js --month 2026/03        # 2026년 3월만
 *   node downloadDecklists.js --from 2026/01         # 2026년 1월부터 현재까지
 *   node downloadDecklists.js --from 2026/01 --to 2026/03  # 범위 지정
 *   node downloadDecklists.js --force                # 이미 있는 파일도 덮어씀
 *
 * 폴더 구조: decklists/{포맷}/{년}/{월}/{일}/{플레이어}.txt
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// --- CLI args ---
const args = process.argv.slice(2);
const FORCE = args.includes('--force');

function parseYearMonth(str) {
  // 수락 형식: "2026/01", "2026-01", "2026/1"
  const m = str && str.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

const now = new Date();
const currentYM = { year: now.getFullYear(), month: now.getMonth() + 1 };

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const monthArg = getArg('--month');
let fromArg = getArg('--from');
let toArg   = getArg('--to');

// --month 은 --from/--to 를 같은 달로 묶는 단축 옵션
if (monthArg) {
  if (fromArg || toArg) {
    console.error('--month 는 --from/--to 와 함께 쓸 수 없습니다.');
    process.exit(1);
  }
  fromArg = monthArg;
  toArg   = monthArg;
}

if (monthArg && !parseYearMonth(monthArg)) {
  console.error(`Invalid --month value: "${monthArg}". Use format YYYY/MM (예: 2026/03)`);
  process.exit(1);
}
if (fromArg && !parseYearMonth(fromArg)) {
  console.error(`Invalid --from value: "${fromArg}". Use format YYYY/MM (예: 2026/01)`);
  process.exit(1);
}
if (toArg && !parseYearMonth(toArg)) {
  console.error(`Invalid --to value: "${toArg}". Use format YYYY/MM (예: 2026/03)`);
  process.exit(1);
}

const FROM_YM = parseYearMonth(fromArg) || currentYM;
const TO_YM   = parseYearMonth(toArg)   || currentYM;

const OUTPUT_DIR = path.join(__dirname, 'decklists');
const BASE_URL = 'https://www.mtgo.com';
const PAGE_TIMEOUT = 30000;
const DATA_TIMEOUT = 20000;

// Known MTGO formats (longer names first to avoid partial match)
const FORMATS = [
  'Duel Commander', 'Premodern', 'Standard', 'Pioneer', 'Modern',
  'Legacy', 'Vintage', 'Pauper', 'Contraption',
];

// MTGO internal format codes → folder names
const FORMAT_CODE_MAP = {
  CSTANDARD: 'Standard', CMODERN: 'Modern', CLEGACY: 'Legacy',
  CVINTAGE: 'Vintage', CPAUPER: 'Pauper', CPIONEER: 'Pioneer',
  CPREMODERN: 'Premodern', CDUELCOMMANDER: 'Duel Commander',
  STANDARD: 'Standard', MODERN: 'Modern', LEGACY: 'Legacy',
  VINTAGE: 'Vintage', PAUPER: 'Pauper', PIONEER: 'Pioneer',
  PREMODERN: 'Premodern',
};

function extractFormat(name) {
  if (!name) return null;
  for (const fmt of FORMATS) {
    if (name.toLowerCase().includes(fmt.toLowerCase())) return fmt;
  }
  return name.split(' ').slice(0, 2).join(' ');
}

function normalizeEventData(data) {
  const eventName = data.name || data.description || '';
  const formatCode = (data.format || '').toUpperCase();
  let format = FORMAT_CODE_MAP[formatCode] || extractFormat(eventName) || 'Unknown';

  let dateStr = data.publish_date || '';
  if ((!dateStr || dateStr === '0000-00-00') && data.starttime) {
    dateStr = data.starttime.substring(0, 10);
  }
  const [year = '0000', month = '00', day = '00'] = dateStr.split('-');
  return { eventName, format, year, month, day };
}

function parseEventUrl(url) {
  const m = url.match(/\/decklist\/(.+?)-(20\d{2})-(\d{2})-(\d{2})\d*(?:$|[^-\d])/);
  if (!m) return null;
  const slug = m[1].replace(/-/g, ' ');
  return {
    formatFromUrl: extractFormat(slug) || 'Unknown',
    year: m[2], month: m[3], day: m[4],
  };
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\r\n]/g, '_').replace(/\s+/g, ' ').trim();
}

function buildDeckContent(deck) {
  const mainMap = new Map();
  for (const card of deck.main_deck || []) {
    const name = card.card_attributes?.card_name;
    if (!name) continue;
    mainMap.set(name, (mainMap.get(name) || 0) + parseInt(card.qty, 10));
  }
  const sideMap = new Map();
  for (const card of deck.sideboard_deck || []) {
    const name = card.card_attributes?.card_name;
    if (!name) continue;
    sideMap.set(name, (sideMap.get(name) || 0) + parseInt(card.qty, 10));
  }

  const sortedMain = [...mainMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sortedSide = [...sideMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let output = sortedMain.map(([name, count]) => `${count} ${name}`).join('\r\n');
  output += '\r\n\r\n\r\n';
  output += sortedSide.map(([name, count]) => `${count} ${name}`).join('\r\n');
  output += '\r\n';
  return output;
}

// Build list of monthly pages for the FROM→TO range (oldest first)
function buildMonthPages() {
  const pages = [];
  let y = FROM_YM.year;
  let m = FROM_YM.month;

  while (y < TO_YM.year || (y === TO_YM.year && m <= TO_YM.month)) {
    const mm = String(m).padStart(2, '0');
    const isCurrentMonth = y === currentYM.year && m === currentYM.month;
    pages.push({
      url: isCurrentMonth ? `${BASE_URL}/decklists` : `${BASE_URL}/decklists/${y}/${mm}`,
      year: y,
      month: m,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return pages;
}

// 요청 연/월의 이벤트 링크만 반환. 데이터 없는 달은 현재 월로 폴백되므로,
// URL 날짜가 요청한 연/월과 일치하지 않으면 폴백으로 간주하고 제외한다.
async function getEventLinksFromPage(page, url, expectedYM) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: PAGE_TIMEOUT });
  } catch (e) {}

  try {
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/decklist/"]').length > 5,
      { timeout: DATA_TIMEOUT }
    );
  } catch (e) {
    await page.waitForTimeout(8000);
  }

  let links = [];
  try {
    links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="/decklist/"]'))
        .map(a => ({ href: a.href, text: a.textContent.trim().replace(/\s+/g, ' ') }))
        .filter(l => /\/decklist\/[a-z]/.test(l.href))
    );
  } catch (e) {
    return [];
  }

  // URL 날짜 기준으로 요청한 연/월과 일치하는 이벤트만 통과
  const mm = String(expectedYM.month).padStart(2, '0');
  const yy = String(expectedYM.year);
  return links.filter(l => {
    const parsed = parseEventUrl(l.href);
    return parsed && parsed.year === yy && parsed.month === mm;
  });
}

async function fetchEventData(page, url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: PAGE_TIMEOUT });
    } catch (e) {}

    try {
      await page.waitForFunction(
        () => window.MTGO && window.MTGO.decklists && window.MTGO.decklists.data,
        { timeout: DATA_TIMEOUT }
      );
      return await page.evaluate(() => JSON.parse(JSON.stringify(window.MTGO.decklists.data)));
    } catch (e) {
      if (attempt < retries) await page.waitForTimeout(3000);
    }
  }
  return null;
}

async function main() {
  const monthPages = buildMonthPages();
  const rangeLabel = FROM_YM.year === TO_YM.year && FROM_YM.month === TO_YM.month
    ? `${FROM_YM.year}/${String(FROM_YM.month).padStart(2, '0')}`
    : `${FROM_YM.year}/${String(FROM_YM.month).padStart(2, '0')} ~ ${TO_YM.year}/${String(TO_YM.month).padStart(2, '0')}`;
  console.log(`Range: ${rangeLabel}${FORCE ? '  [force overwrite]' : '  [skip existing]'}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 덱리스트 데이터는 HTML에 내장돼 있어 이미지/폰트/CSS/미디어는 불필요.
  // 해당 리소스 요청을 차단해 페이지 로딩 속도를 크게 높인다.
  const BLOCKED_TYPES = new Set(['image', 'font', 'stylesheet', 'media']);
  await page.route('**/*', route => {
    if (BLOCKED_TYPES.has(route.request().resourceType())) {
      route.abort();
    } else {
      route.continue();
    }
  });

  // Collect all event links across months (deduplicated)
  const seenHrefs = new Set();
  const allEvents = [];
  let emptyMonths = 0;
  for (const mp of monthPages) {
    const ym = `${mp.year}/${String(mp.month).padStart(2, '0')}`;
    process.stdout.write(`Loading ${ym} ... `);
    const links = await getEventLinksFromPage(page, mp.url, mp);
    if (links.length === 0) {
      console.log('데이터 없음 (스킵)');
      emptyMonths++;
      continue;
    }
    for (const link of links) {
      if (!seenHrefs.has(link.href)) {
        seenHrefs.add(link.href);
        allEvents.push(link);
      }
    }
    console.log(`${links.length} events (누적 ${seenHrefs.size})`);
  }
  console.log(`\nTotal unique events: ${allEvents.length}${emptyMonths ? ` (데이터 없는 달: ${emptyMonths}개)` : ''}\n`);

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of allEvents) {
    const label = event.text || event.href;
    process.stdout.write(`Processing: ${label} ... `);

    let data;
    try {
      data = await fetchEventData(page, event.href);
    } catch (e) {
      console.log(`FAILED (${e.message.split('\n')[0]})`);
      failed++;
      continue;
    }

    if (!data) {
      console.log('FAILED (timeout)');
      failed++;
      continue;
    }

    if (!data.decklists || data.decklists.length === 0) {
      console.log('SKIPPED (no decklists)');
      skipped++;
      continue;
    }

    let { format, year, month, day } = normalizeEventData(data);
    if (format === 'Unknown' || year === '0000') {
      const urlParsed = parseEventUrl(event.href);
      if (urlParsed) {
        if (format === 'Unknown') format = urlParsed.formatFromUrl;
        if (year === '0000') { year = urlParsed.year; month = urlParsed.month; day = urlParsed.day; }
      }
    }

    const dir = path.join(OUTPUT_DIR, format, year, month, day);
    fs.mkdirSync(dir, { recursive: true });

    // 이벤트 메타데이터 저장 (buildLanding.js 에서 MTGO 링크 생성에 사용)
    const metaPath = path.join(dir, '_meta.json');
    if (FORCE || !fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, JSON.stringify({ eventUrl: event.href }, null, 2), 'utf8');
    }

    let savedCount = 0;
    let skippedCount = 0;
    for (const deck of data.decklists) {
      try {
        const filename = sanitizeFilename(deck.player || 'unknown') + '.txt';
        const filepath = path.join(dir, filename);
        if (!FORCE && fs.existsSync(filepath)) {
          skippedCount++;
          continue;
        }
        fs.writeFileSync(filepath, buildDeckContent(deck), 'utf8');
        savedCount++;
      } catch (e) {
        console.warn(`\n  Warning: skipped deck (${deck.player || '?'}): ${e.message}`);
      }
    }

    const rel = path.relative(__dirname, dir);
    if (savedCount > 0) {
      console.log(`OK — ${savedCount} saved${skippedCount > 0 ? `, ${skippedCount} skipped` : ''} → ${rel}`);
    } else {
      console.log(`SKIPPED (all ${skippedCount} files already exist) → ${rel}`);
    }
    saved += savedCount;
    skipped += skippedCount;
  }

  await browser.close();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Done. ${saved} files saved, ${skipped} skipped, ${failed} events failed.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
