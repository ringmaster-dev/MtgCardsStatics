/**
 * Known Cards Index Builder
 *
 * decklists/ 를 오래된 날짜부터 읽어 카드 이름별로
 * 처음 등장한 날짜를 기록한 data/known-cards.json 을 생성합니다.
 *
 * Usage:
 *   node buildKnownCards.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DECKLISTS_DIR = path.join(__dirname, 'decklists');
const OUT_FILE      = path.join(__dirname, 'data', 'known-cards.json');

function fileMeta(filePath) {
  const rel   = path.relative(DECKLISTS_DIR, filePath);
  const parts = rel.split(path.sep);
  if (parts.length < 5) return null;
  const [, year, month, day] = parts;
  return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
}

function parseCards(filePath) {
  const names = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\s+(.+)$/);
    if (m) names.push(m[1].trim());
  }
  return names;
}

function walkFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, results);
    else if (entry.name.endsWith('.txt')) results.push(full);
  }
  return results;
}

function main() {
  if (!fs.existsSync(DECKLISTS_DIR)) {
    console.error('decklists/ 폴더가 없습니다.');
    process.exit(1);
  }

  process.stdout.write('Scanning decklist files… ');
  const files = walkFiles(DECKLISTS_DIR);
  console.log(`${files.length} files`);

  // 날짜 기준 오름차순 정렬
  const dated = files
    .map(f => ({ file: f, date: fileMeta(f) }))
    .filter(x => x.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 오래된 순으로 읽으며 첫 등장 날짜 + 파일 기록
  // Map<name, { date, files: Set<relPath> }>
  const firstSeen = new Map();
  let prevDate = '';
  let dateCount = 0;

  for (const { file, date } of dated) {
    if (date !== prevDate) { dateCount++; prevDate = date; }
    const relPath = path.relative(__dirname, file);
    for (const name of parseCards(file)) {
      if (!firstSeen.has(name)) {
        firstSeen.set(name, { date, files: new Set([relPath]) });
      } else {
        const entry = firstSeen.get(name);
        if (entry.date === date) entry.files.add(relPath);
      }
    }
  }

  const latestDate = dated.length ? dated[dated.length - 1].date : '';
  console.log(`Dates processed: ${dateCount}`);
  console.log(`Latest date    : ${latestDate}`);
  console.log(`Unique cards   : ${firstSeen.size}`);

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 카드 이름 순 정렬 후 저장 (files는 배열로 변환)
  const cards = Object.fromEntries(
    [...firstSeen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, { date, files }]) => [name, { date, files: [...files].sort() }])
  );

  fs.writeFileSync(OUT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    latestDate,
    cardCount: firstSeen.size,
    cards,
  }, null, 2), 'utf8');

  console.log(`Saved: ${OUT_FILE}`);
}

main();
