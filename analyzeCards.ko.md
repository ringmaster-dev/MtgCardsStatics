# analyzeCards.js

저장된 덱리스트를 읽어 포맷별로 카드 사용 현황을 집계합니다. 별도 의존성 없이 Node.js 기본 모듈만 사용합니다.

사전에 `downloadDecklists.js`로 덱리스트를 받아두어야 합니다.

---

## 사용법

```bash
node analyzeCards.js [옵션]
```

| 옵션 | 설명 |
| --- | --- |
| `--format <이름>` | 특정 포맷만 집계 (예: `Modern`, `Legacy`, `Duel Commander`) |
| `--from YYYY/MM` | 집계 시작 월 |
| `--to YYYY/MM` | 집계 종료 월 |
| `--top <N>` | 상위 N개 카드만 출력 |
| `--main-only` | 메인덱만 집계 |
| `--side-only` | 사이드보드만 집계 |
| `--output <파일>` | 결과를 `.json` 또는 `.csv`로 저장 |

### 예시

```bash
# 전 포맷, 전 기간
node analyzeCards.js

# Modern 포맷, 2026년 6월, 상위 20개
node analyzeCards.js --format Modern --from 2026/06 --top 20

# Legacy 메인덱만, 2026년 상반기
node analyzeCards.js --format Legacy --main-only --from 2026/01 --to 2026/06

# 결과를 CSV로 저장
node analyzeCards.js --format Pauper --output pauper.csv
```

---

## 출력

### 터미널

포맷별로 구분된 테이블 형식으로 출력됩니다:

```
════════════════════════════════════════════════════════════════════════
  Format: Modern  (2385 decks, 1499 unique cards)
────────────────────────────────────────────────────────────────────────
  Card Name                               Decks  Copies   Avg
────────────────────────────────────────────────────────────────────────
  Vexing Bauble                            1007    1986  1.97
  Consign to Memory                         970    3324  3.43
  ...
════════════════════════════════════════════════════════════════════════
```

| 컬럼 | 설명 |
| --- | --- |
| Card Name | 카드 이름 |
| Decks | 해당 카드가 들어간 덱 수 |
| Copies | 전체 덱에 걸친 총 장수 |
| Avg | 덱당 평균 장수 |

Decks 내림차순 → Copies 내림차순으로 정렬됩니다.

### 파일 출력

`--output` 옵션으로 파일에 저장할 수 있습니다. 확장자에 따라 형식이 결정됩니다.

- `.json` — 포맷별 객체, 카드 배열 포함
- `.csv` — `format,card_name,deck_count,total_copies,avg_copies` 컬럼
