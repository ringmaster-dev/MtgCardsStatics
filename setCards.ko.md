# setCards.js

Scryfall의 `default-cards` JSON과 저장된 덱리스트를 교차해, **특정 세트에 수록된 카드 중 특정 포맷에서 실제로 사용되는 카드** 목록을 뽑습니다.

- Basic 타입 카드는 집계에서 제외됩니다.
- 같은 이름의 카드가 세트에 여러 번 수록된 경우(아트 변형 등) 카드 번호가 가장 빠른 것을 기준으로 표시합니다.
- 547 MB에 달하는 JSON을 라인 스트리밍으로 처리하므로 메모리 부담이 없습니다.

사전에 `downloadDecklists.js`로 덱리스트를, Scryfall에서 `default-cards` JSON을 받아두어야 합니다.

> Scryfall Bulk Data: https://scryfall.com/docs/api/bulk-data

`default-cards-*.json` 파일은 스크립트와 같은 폴더에 두면 자동으로 인식됩니다. 여러 개 있을 경우 파일명 기준 최신 파일을 사용합니다. `--cards-json <경로>` 옵션으로 직접 지정할 수도 있습니다.

---

## 사용법

```bash
node setCards.js [옵션]
```

| 옵션 | 설명 |
| --- | --- |
| `--set <코드>` | 세트 코드 (예: `dsk`, `mh3`, `blb`) — 대소문자 무관 |
| `--format <이름>` | 포맷 이름 (예: `Modern`, `Legacy`) |
| `--from YYYY/MM` | 덱리스트 집계 시작 월 |
| `--to YYYY/MM` | 덱리스트 집계 종료 월 |
| `--top <N>` | 상위 N개만 출력 (카드 번호 기준 앞에서 N개) |
| `--main-only` | 메인덱만 집계 |
| `--side-only` | 사이드보드만 집계 |
| `--output <파일>` | 결과를 `.json` 또는 `.csv`로 저장 |
| `--cards-json <경로>` | 사용할 `default-cards` JSON 파일 경로 직접 지정 |
| `--list-sets` | JSON에 포함된 세트 코드·이름 목록 출력 |

`--set`과 `--format`은 필수입니다(`--list-sets` 사용 시 제외).

### 예시

```bash
# DSK 세트에서 Modern에 쓰이는 카드
node setCards.js --set dsk --format Modern

# MH3 세트, Legacy, 2026년 6월 이후 덱리스트 기준
node setCards.js --set mh3 --format Legacy --from 2026/06

# 메인덱에만 들어간 카드, CSV 저장
node setCards.js --set dsk --format Modern --main-only --output dsk_modern.csv

# 사용 가능한 세트 코드 목록 확인
node setCards.js --list-sets
```

---

## 출력

### 터미널

카드 번호 오름차순으로 정렬된 테이블 형식으로 출력됩니다:

```
════════════════════════════════════════════════════════════════════════════════════
  Set   : DSK — Duskmourn: House of Horror
  Format: Modern  (2587 decks)
  Cards : 23 unique cards from this set
────────────────────────────────────────────────────────────────────────────────────
     #  R  Card Name                               Decks  Copies   Avg
────────────────────────────────────────────────────────────────────────────────────
    42  M  Abhorrent Oculus                          142     467  3.29
   106  R  Leyline of the Void                        95     306  3.22
   ...
════════════════════════════════════════════════════════════════════════════════════
```

| 컬럼 | 설명 |
| --- | --- |
| # | 세트 내 카드 번호 |
| R | 레어도 — `C` Common / `U` Uncommon / `R` Rare / `M` Mythic |
| Card Name | 카드 이름 |
| Decks | 해당 카드가 들어간 덱 수 |
| Copies | 전체 덱에 걸친 총 장수 |
| Avg | 덱당 평균 장수 |

### 파일 출력

`--output` 옵션으로 파일에 저장할 수 있습니다. 확장자에 따라 형식이 결정됩니다.

- `.json` — 세트·포맷 메타 + 카드 배열
- `.csv` — `set,set_name,format,collector_number,card_name,rarity,type_line,mana_cost,deck_count,total_copies,avg_copies` 컬럼
