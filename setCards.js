/**
 * MTG Set × Format Card Analyzer
 *
 * 지정된 세트에 수록된 카드 중, 지정된 포맷의 덱리스트에서 실제로 사용된 카드 목록 출력
 *
 * Usage:
 *   node setCards.js --set dsk --format Modern
 *   node setCards.js --set mh3 --format Legacy
 *   node setCards.js --set blb --format Pauper --from 2026/06
 *   node setCards.js --set dsk --format Modern --top 20
 *   node setCards.js --set dsk --format Modern --main-only
 *   node setCards.js --set dsk --format Modern --output result.json
 *   node setCards.js --set dsk --format Modern --output result.csv
 *   node setCards.js --list-sets                          # 세트 코드 목록
 *
 * Options:
 *   --set <code>       세트 코드 (예: dsk, mh3, blb) — 대소문자 무관
 *   --format <name>    포맷 이름 (예: Modern, Legacy, Pauper)
 *   --from <YYYY/MM>   덱리스트 기간 시작
 *   --to   <YYYY/MM>   덱리스트 기간 끝
 *   --top  <N>         상위 N개만 출력
 *   --main-only        메인덱만 집계
 *   --side-only        사이드보드만 집계
 *   --output <file>    .json 또는 .csv 파일로 저장
 *   --list-sets        JSON에 포함된 세트 코드·이름 목록 출력
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const DECKLISTS_DIR = path.join(__dirname, 'decklists');

function resolveCardsJson() {
  const explicit = getArgEarly('--cards-json');
  if (explicit) return explicit;
  const files = fs.readdirSync(__dirname).filter(f => /^default-cards.*\.json$/i.test(f));
  if (files.length === 0) {
    console.error('Error: default-cards JSON 파일을 찾을 수 없습니다.\n       --cards-json <경로> 로 직접 지정하거나, 같은 폴더에 default-cards-*.json 을 두세요.');
    process.exit(1);
  }
  if (files.length > 1) {
    // 파일명 내림차순 → 가장 최신 날짜 파일 선택
    files.sort((a, b) => b.localeCompare(a));
    console.warn(`Warning: default-cards JSON이 여러 개 있어 가장 최신 파일을 사용합니다: ${files[0]}`);
  }
  return path.join(__dirname, files[0]);
}

// getArg 보다 먼저 --cards-json 인수를 읽어야 하므로 별도 함수
function getArgEarly(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

const CARDS_JSON = resolveCardsJson();

// --- CLI args ---
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
function hasFlag(name) { return args.includes(name); }

const SET_CODE      = (getArg('--set') || '').toLowerCase();
const FORMAT_FILTER = getArg('--format') || '';
const FROM_STR      = getArg('--from');
const TO_STR        = getArg('--to');
const TOP_N         = parseInt(getArg('--top') || '0', 10);
const OUTPUT_FILE   = getArg('--output');
const MAIN_ONLY     = hasFlag('--main-only');
const SIDE_ONLY     = hasFlag('--side-only');
const LIST_SETS     = hasFlag('--list-sets');

function parseYearMonth(str) {
  const m = str && str.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

const FROM_YM = FROM_STR ? parseYearMonth(FROM_STR) : null;
const TO_YM   = TO_STR   ? parseYearMonth(TO_STR)   : null;

if (FROM_STR && !FROM_YM) { console.error(`Invalid --from: "${FROM_STR}"`); process.exit(1); }
if (TO_STR   && !TO_YM)   { console.error(`Invalid --to: "${TO_STR}"`);   process.exit(1); }

// --- Decklist parser (analyzeCards.js와 동일 로직) ---
function parseDeckFile(filepath) {
  const text = fs.readFileSync(filepath, 'utf8');
  const lines = text.split(/\r?\n/);
  const main = new Map();
  const side = new Map();
  let section = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { section++; continue; }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const qty  = parseInt(m[1], 10);
    const name = m[2].trim();
    (section === 0 ? main : side).set(name, ((section === 0 ? main : side).get(name) || 0) + qty);
  }
  return { main, side };
}

function collectDecklistFiles(formatFilter) {
  if (!fs.existsSync(DECKLISTS_DIR)) return [];
  const formats = fs.readdirSync(DECKLISTS_DIR).filter(f => {
    const full = path.join(DECKLISTS_DIR, f);
    return fs.statSync(full).isDirectory() && !f.startsWith('.');
  });

  const results = [];
  for (const format of formats) {
    if (formatFilter && format.toLowerCase() !== formatFilter.toLowerCase()) continue;
    const formatDir = path.join(DECKLISTS_DIR, format);
    const years = fs.readdirSync(formatDir).filter(f => /^\d{4}$/.test(f));
    for (const year of years) {
      const yearDir = path.join(formatDir, year);
      const months = fs.readdirSync(yearDir).filter(f => /^\d{2}$/.test(f));
      for (const month of months) {
        const ym = { year: parseInt(year, 10), month: parseInt(month, 10) };
        if (FROM_YM) {
          if (ym.year * 100 + ym.month < FROM_YM.year * 100 + FROM_YM.month) continue;
        }
        if (TO_YM) {
          if (ym.year * 100 + ym.month > TO_YM.year * 100 + TO_YM.month) continue;
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

// 포맷 덱리스트에서 카드 집계 → Map<name, {deckCount, totalCopies}>
function aggregateFormatCards(files) {
  const cardMap = new Map();
  let deckCount = 0;
  for (const { filepath } of files) {
    let parsed;
    try { parsed = parseDeckFile(filepath); } catch { continue; }
    deckCount++;
    const deckCards = new Map();
    if (!SIDE_ONLY) for (const [n, q] of parsed.main) deckCards.set(n, (deckCards.get(n) || 0) + q);
    if (!MAIN_ONLY) for (const [n, q] of parsed.side) deckCards.set(n, (deckCards.get(n) || 0) + q);
    for (const [name, qty] of deckCards) {
      if (!cardMap.has(name)) cardMap.set(name, { deckCount: 0, totalCopies: 0 });
      const e = cardMap.get(name);
      e.deckCount++;
      e.totalCopies += qty;
    }
  }
  return { cardMap, deckCount };
}

// collector_number 비교: "10" < "10a" < "10b" < "11"
function parseCollectorNum(cn) {
  const m = (cn || '').match(/^(\d+)([a-z]*)$/i);
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [Infinity, ''];
}
function cmpCollectorNum(a, b) {
  const [an, as] = parseCollectorNum(a);
  const [bn, bs] = parseCollectorNum(b);
  return an !== bn ? an - bn : as.localeCompare(bs);
}

// --- JSON streaming ---
// Scryfall default-cards: 배열 형식, 카드 한 줄에 하나
async function streamSetCards(setCode) {
  const setCards = new Map(); // name → card info (번호가 가장 빠른 것 유지)

  const rl = readline.createInterface({
    input: fs.createReadStream(CARDS_JSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    const json = line.endsWith(',') ? line.slice(0, -1) : line;

    let card;
    try { card = JSON.parse(json); } catch { continue; }

    if (card.set !== setCode) continue;
    if (card.lang && card.lang !== 'en') continue;
    if ((card.type_line || '').includes('Basic')) continue;

    const name = card.name;
    if (!name) continue;

    // 같은 이름이 이미 있으면 collector_number가 더 작은 것으로 교체
    const existing = setCards.get(name);
    if (existing && cmpCollectorNum(existing.collector_number, card.collector_number) <= 0) continue;

    setCards.set(name, {
      name,
      collector_number: card.collector_number || '',
      set:        card.set,
      set_name:   card.set_name,
      rarity:     card.rarity,
      type_line:  card.type_line   || '',
      mana_cost:  card.mana_cost   || '',
      cmc:        card.cmc         ?? '',
      colors:     (card.colors || []).join(''),
      color_identity: (card.color_identity || []).join(''),
      legalities: card.legalities  || {},
    });
  }

  return setCards;
}

// --list-sets 용: 세트 코드 + 이름 목록
async function listSets() {
  const sets = new Map(); // code → name
  const rl = readline.createInterface({
    input: fs.createReadStream(CARDS_JSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    const json = line.endsWith(',') ? line.slice(0, -1) : line;
    let card;
    try { card = JSON.parse(json); } catch { continue; }
    if (card.lang && card.lang !== 'en') continue;
    if (card.set && !sets.has(card.set)) {
      sets.set(card.set, card.set_name || '');
    }
  }
  const entries = [...sets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${'Code'.padEnd(8)} Set Name`);
  console.log('─'.repeat(50));
  for (const [code, name] of entries) {
    console.log(`${code.padEnd(8)} ${name}`);
  }
  console.log(`\nTotal: ${entries.length} sets`);
}

// --- Output ---
function sortedResult(results) {
  const arr = [...results.values()];
  arr.sort((a, b) => cmpCollectorNum(a.collector_number, b.collector_number));
  return TOP_N > 0 ? arr.slice(0, TOP_N) : arr;
}

const RARITY_LABEL = { common: 'C', uncommon: 'U', rare: 'R', mythic: 'M', special: 'S', bonus: 'B' };

function printTable(sorted, setName, formatName, totalDecks) {
  console.log(`\n${'═'.repeat(84)}`);
  console.log(`  Set   : ${SET_CODE.toUpperCase()} — ${setName}`);
  console.log(`  Format: ${formatName}  (${totalDecks} decks)`);
  console.log(`  Cards : ${sorted.length} unique cards from this set`);
  console.log(`${'─'.repeat(84)}`);
  console.log(`  ${'#'.padStart(4)}  ${'R'.padEnd(2)} ${'Card Name'.padEnd(38)} ${'Decks'.padStart(6)} ${'Copies'.padStart(7)} ${'Avg'.padStart(5)}`);
  console.log(`${'─'.repeat(84)}`);
  for (const c of sorted) {
    const r    = RARITY_LABEL[c.rarity] || '?';
    const num  = String(c.collector_number);
    const name = c.name.length > 37 ? c.name.slice(0, 36) + '…' : c.name;
    console.log(
      `  ${num.padStart(4)}  ${r.padEnd(2)} ${name.padEnd(38)} ${String(c.deckCount).padStart(6)} ${String(c.totalCopies).padStart(7)} ${String(c.avgCopies).padStart(5)}`
    );
  }
  console.log(`${'═'.repeat(84)}`);
}

function toJson(sorted, setName, formatName, totalDecks) {
  return JSON.stringify({
    set:        SET_CODE,
    set_name:   setName,
    format:     formatName,
    total_decks: totalDecks,
    cards:      sorted,
  }, null, 2);
}

function toCsv(sorted, setName, formatName) {
  const rows = ['set,set_name,format,collector_number,card_name,rarity,type_line,mana_cost,deck_count,total_copies,avg_copies'];
  for (const c of sorted) {
    const name = c.name.includes(',') ? `"${c.name}"` : c.name;
    const type = c.type_line.includes(',') ? `"${c.type_line}"` : c.type_line;
    rows.push([SET_CODE, setName, formatName, c.collector_number, name, c.rarity, type, c.mana_cost, c.deckCount, c.totalCopies, c.avgCopies].join(','));
  }
  return rows.join('\n');
}

// --- Main ---
async function main() {
  if (LIST_SETS) {
    console.log('Streaming set list from JSON…');
    await listSets();
    return;
  }

  if (!SET_CODE) {
    console.error('Error: --set <code> is required (예: --set dsk)\n       --list-sets 으로 세트 코드 목록 확인 가능');
    process.exit(1);
  }
  if (!FORMAT_FILTER) {
    console.error('Error: --format <name> is required (예: --format Modern)');
    process.exit(1);
  }

  // Step 1: 덱리스트에서 포맷 카드 집계
  process.stdout.write(`[1/2] Reading decklists for "${FORMAT_FILTER}"… `);
  const files = collectDecklistFiles(FORMAT_FILTER);
  if (files.length === 0) {
    console.log(`\nNo decklist files found for format "${FORMAT_FILTER}".`);
    process.exit(1);
  }
  const { cardMap, deckCount } = aggregateFormatCards(files);
  console.log(`${files.length} files, ${deckCount} decks, ${cardMap.size} unique cards`);

  // Step 2: JSON 스트리밍으로 세트 카드 추출
  process.stdout.write(`[2/2] Streaming JSON for set "${SET_CODE.toUpperCase()}"… `);
  const setCards = await streamSetCards(SET_CODE);
  if (setCards.size === 0) {
    console.log(`\nNo cards found for set "${SET_CODE}". Use --list-sets to check available codes.`);
    process.exit(1);
  }
  console.log(`${setCards.size} unique cards in set`);

  // Step 3: 교집합
  const results = new Map();
  for (const [name, info] of setCards) {
    if (!cardMap.has(name)) continue;
    const stat = cardMap.get(name);
    results.set(name, {
      ...info,
      deckCount:   stat.deckCount,
      totalCopies: stat.totalCopies,
      avgCopies:   parseFloat((stat.totalCopies / stat.deckCount).toFixed(2)),
    });
  }

  const setName    = setCards.values().next().value?.set_name || SET_CODE.toUpperCase();
  const formatName = files[0]?.format || FORMAT_FILTER;
  const sorted     = sortedResult(results);

  if (sorted.length === 0) {
    console.log(`\nNo cards from set "${SET_CODE.toUpperCase()}" found in "${formatName}" decklists.`);
    return;
  }

  if (OUTPUT_FILE) {
    const ext = path.extname(OUTPUT_FILE).toLowerCase();
    let content;
    if (ext === '.json')     content = toJson(sorted, setName, formatName, deckCount);
    else if (ext === '.csv') content = toCsv(sorted, setName, formatName);
    else { console.error('--output 파일 확장자는 .json 또는 .csv 만 지원합니다.'); process.exit(1); }
    fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
    console.log(`\nSaved to: ${OUTPUT_FILE}  (${sorted.length} cards)`);
  } else {
    printTable(sorted, setName, formatName, deckCount);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
