/**
 * MTG Card Usage Analyzer
 *
 * Usage:
 *   node analyzeCards.js                          # 모든 포맷, 전체 기간
 *   node analyzeCards.js --format Modern          # 특정 포맷만
 *   node analyzeCards.js --from 2026/06           # 특정 월부터
 *   node analyzeCards.js --from 2026/05 --to 2026/06
 *   node analyzeCards.js --top 20                 # 상위 N개만 출력
 *   node analyzeCards.js --main-only              # 메인덱만 (사이드보드 제외)
 *   node analyzeCards.js --side-only              # 사이드보드만
 *   node analyzeCards.js --output cards.json      # JSON 파일로 출력
 *   node analyzeCards.js --output cards.csv       # CSV 파일로 출력
 *
 * 출력: 포맷별로 카드 이름, 사용 덱 수, 총 장수, 평균 장수
 */

const fs = require('fs');
const path = require('path');

const DECKLISTS_DIR = path.join(__dirname, 'decklists');

// --- CLI args ---
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

function hasFlag(name) {
  return args.includes(name);
}

const FORMAT_FILTER = getArg('--format');
const FROM_STR      = getArg('--from');
const TO_STR        = getArg('--to');
const TOP_N         = parseInt(getArg('--top') || '0', 10);
const OUTPUT_FILE   = getArg('--output');
const MAIN_ONLY     = hasFlag('--main-only');
const SIDE_ONLY     = hasFlag('--side-only');

function parseYearMonth(str) {
  const m = str && str.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

const FROM_YM = FROM_STR ? parseYearMonth(FROM_STR) : null;
const TO_YM   = TO_STR   ? parseYearMonth(TO_STR)   : null;

if (FROM_STR && !FROM_YM) { console.error(`Invalid --from: "${FROM_STR}"`); process.exit(1); }
if (TO_STR   && !TO_YM)   { console.error(`Invalid --to: "${TO_STR}"`);   process.exit(1); }

// --- Decklist parser ---
// Section: 0 = main, 1 = sideboard (첫 번째 빈 줄 이후)
function parseDeckFile(filepath) {
  const text = fs.readFileSync(filepath, 'utf8');
  const lines = text.split(/\r?\n/);

  const main = new Map();
  const side = new Map();
  let section = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      section++;
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const qty  = parseInt(m[1], 10);
    const name = m[2].trim();
    const target = section === 0 ? main : side;
    target.set(name, (target.get(name) || 0) + qty);
  }
  return { main, side };
}

// --- File discovery ---
function collectFiles() {
  const formats = fs.readdirSync(DECKLISTS_DIR).filter(f => {
    const full = path.join(DECKLISTS_DIR, f);
    return fs.statSync(full).isDirectory() && !f.startsWith('.');
  });

  const results = [];

  for (const format of formats) {
    if (FORMAT_FILTER && format.toLowerCase() !== FORMAT_FILTER.toLowerCase()) continue;

    const formatDir = path.join(DECKLISTS_DIR, format);
    const years = fs.readdirSync(formatDir).filter(f => /^\d{4}$/.test(f));

    for (const year of years) {
      const yearDir = path.join(formatDir, year);
      const months = fs.readdirSync(yearDir).filter(f => /^\d{2}$/.test(f));

      for (const month of months) {
        const ym = { year: parseInt(year, 10), month: parseInt(month, 10) };

        if (FROM_YM) {
          const ymVal = ym.year * 100 + ym.month;
          const fromVal = FROM_YM.year * 100 + FROM_YM.month;
          if (ymVal < fromVal) continue;
        }
        if (TO_YM) {
          const ymVal = ym.year * 100 + ym.month;
          const toVal = TO_YM.year * 100 + TO_YM.month;
          if (ymVal > toVal) continue;
        }

        const monthDir = path.join(yearDir, month);
        const days = fs.readdirSync(monthDir).filter(f => /^\d{2}$/.test(f));

        for (const day of days) {
          const dayDir = path.join(monthDir, day);
          const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.txt'));

          for (const file of files) {
            results.push({ format, filepath: path.join(dayDir, file) });
          }
        }
      }
    }
  }

  return results;
}

// --- Aggregation ---
// formatData: Map<format, Map<cardName, { deckCount, totalCopies }>>
function aggregate(files) {
  const formatData = new Map();

  for (const { format, filepath } of files) {
    let parsed;
    try {
      parsed = parseDeckFile(filepath);
    } catch (e) {
      console.warn(`Warning: skipped ${filepath} (${e.message})`);
      continue;
    }

    if (!formatData.has(format)) formatData.set(format, new Map());
    const cardMap = formatData.get(format);

    const sources = [];
    if (!SIDE_ONLY) sources.push(parsed.main);
    if (!MAIN_ONLY) sources.push(parsed.side);

    // 이 덱에서 등장한 카드 (중복 제거, 메인+사이드 합산)
    const deckCards = new Map();
    for (const src of sources) {
      for (const [name, qty] of src) {
        deckCards.set(name, (deckCards.get(name) || 0) + qty);
      }
    }

    for (const [name, qty] of deckCards) {
      if (!cardMap.has(name)) cardMap.set(name, { deckCount: 0, totalCopies: 0 });
      const entry = cardMap.get(name);
      entry.deckCount++;
      entry.totalCopies += qty;
    }
  }

  return formatData;
}

// --- Output helpers ---
function sortedCards(cardMap) {
  const entries = [...cardMap.entries()].map(([name, stat]) => ({
    name,
    deckCount:   stat.deckCount,
    totalCopies: stat.totalCopies,
    avgCopies:   parseFloat((stat.totalCopies / stat.deckCount).toFixed(2)),
  }));
  entries.sort((a, b) => b.deckCount - a.deckCount || b.totalCopies - a.totalCopies);
  return TOP_N > 0 ? entries.slice(0, TOP_N) : entries;
}

function printTable(format, cards, totalDecks) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  Format: ${format}  (${totalDecks} decks, ${cards.length} unique cards)`);
  console.log(`${'─'.repeat(72)}`);
  console.log(`  ${'Card Name'.padEnd(38)} ${'Decks'.padStart(6)} ${'Copies'.padStart(7)} ${'Avg'.padStart(5)}`);
  console.log(`${'─'.repeat(72)}`);
  for (const c of cards) {
    const name = c.name.length > 37 ? c.name.slice(0, 36) + '…' : c.name;
    console.log(
      `  ${name.padEnd(38)} ${String(c.deckCount).padStart(6)} ${String(c.totalCopies).padStart(7)} ${String(c.avgCopies).padStart(5)}`
    );
  }
}

function toJson(formatData, deckCounts) {
  const result = {};
  for (const [format, cardMap] of formatData) {
    result[format] = {
      totalDecks: deckCounts.get(format) || 0,
      cards: sortedCards(cardMap),
    };
  }
  return JSON.stringify(result, null, 2);
}

function toCsv(formatData, deckCounts) {
  const rows = ['format,card_name,deck_count,total_copies,avg_copies'];
  for (const [format, cardMap] of formatData) {
    for (const c of sortedCards(cardMap)) {
      const name = c.name.includes(',') ? `"${c.name}"` : c.name;
      rows.push(`${format},${name},${c.deckCount},${c.totalCopies},${c.avgCopies}`);
    }
  }
  return rows.join('\n');
}

// --- Main ---
function main() {
  const filterDesc = [
    FORMAT_FILTER ? `format=${FORMAT_FILTER}` : null,
    FROM_YM ? `from=${FROM_YM.year}/${String(FROM_YM.month).padStart(2,'0')}` : null,
    TO_YM   ? `to=${TO_YM.year}/${String(TO_YM.month).padStart(2,'0')}` : null,
    MAIN_ONLY ? 'main-only' : SIDE_ONLY ? 'side-only' : null,
    TOP_N > 0 ? `top-${TOP_N}` : null,
  ].filter(Boolean).join(', ');

  console.log(`Scanning: ${DECKLISTS_DIR}`);
  if (filterDesc) console.log(`Filters : ${filterDesc}`);

  const files = collectFiles();
  console.log(`Found   : ${files.length} decklist files`);

  if (files.length === 0) {
    console.log('No files matched. Check --format / --from / --to options.');
    return;
  }

  const formatData = aggregate(files);

  // 포맷별 덱 수 계산
  const deckCounts = new Map();
  for (const { format } of files) {
    deckCounts.set(format, (deckCounts.get(format) || 0) + 1);
  }

  if (OUTPUT_FILE) {
    const ext = path.extname(OUTPUT_FILE).toLowerCase();
    let content;
    if (ext === '.json') {
      content = toJson(formatData, deckCounts);
    } else if (ext === '.csv') {
      content = toCsv(formatData, deckCounts);
    } else {
      console.error('--output 파일 확장자는 .json 또는 .csv 만 지원합니다.');
      process.exit(1);
    }
    fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
    console.log(`\nSaved to: ${OUTPUT_FILE}`);
  } else {
    for (const [format, cardMap] of formatData) {
      const cards = sortedCards(cardMap);
      printTable(format, cards, deckCounts.get(format));
    }
    console.log(`\n${'═'.repeat(72)}`);
  }
}

main();
