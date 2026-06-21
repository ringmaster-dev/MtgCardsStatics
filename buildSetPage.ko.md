# buildSetPage.js

지정한 MTG 세트에서 MTGO 컴피티티브 포맷(Standard, Pioneer, Modern, Legacy, Vintage, Pauper)에 실제로 사용되는 카드 목록을 보여주는 HTML 페이지를 생성합니다.

프로젝트 루트에 [Scryfall 벌크 데이터](https://scryfall.com/docs/api/bulk-data) 파일(`default-cards-*.json`)과 `downloadDecklists.js`로 받은 덱리스트가 필요합니다.

결과 파일은 `pages/{세트코드}.html`로 저장됩니다.

---

## 사용법

```bash
node buildSetPage.js --set <코드> [옵션]
```

| 옵션 | 설명 |
| --- | --- |
| `--set <코드>` | **(필수)** Scryfall 세트 코드 (예: `dsk`, `mh3`) |
| `--from YYYY/MM` | 지정 월 이후의 덱리스트만 집계 |
| `--to YYYY/MM` | 지정 월까지의 덱리스트만 집계 |
| `--out <디렉토리>` | 출력 디렉토리 (기본값: `pages/`) |
| `--cards-json <파일>` | Scryfall 벌크 JSON 파일 경로 직접 지정 (기본: 자동 탐색) |

### 예시

```bash
# 전체 덱리스트 기준으로 DSK 페이지 생성
node buildSetPage.js --set dsk

# 2026년 6월 이후 덱리스트만 사용
node buildSetPage.js --set mh3 --from 2026/06

# 출력 디렉토리 지정
node buildSetPage.js --set dsk --out ./dist
```

---

## 출력

생성된 페이지(`pages/{세트코드}.html`)의 구성:

- **헤더** — 세트 이름, 세트 코드, 레어도별 카드 수(M / R / U / C), 집계에 사용된 덱리스트 날짜 범위
- **포맷 총계** — 포맷별 덱 수 (Standard, Pioneer, Modern, Legacy, Vintage, Pauper)
- **카드 테이블** — 수록 번호 순 카드 목록, 포맷별 사용 덱 수 표시
  - 히트 컬러링: 포맷 내 최다 사용 카드 대비 비율에 따라 4단계 색상 강조
  - 카드 이미지 툴팁: 카드 이름에 마우스를 올리면 Scryfall CDN 이미지 표시
- **필터 바** — 레어도(Mythic / Rare / Uncommon / Common) 또는 이름으로 필터링

### 카드 선택 기준

- 같은 이름의 카드가 세트에 여러 장 수록된 경우, 수록 번호가 가장 낮은 것만 포함(아트 변형 중복 방지)
- 기본 대지 타입 카드(`Plains`, `Island` 등)는 제외

---

## 데이터 출처

| 출처 | 용도 |
| --- | --- |
| `decklists/` | MTGO 이벤트 덱리스트 (`downloadDecklists.js`로 수집) |
| `default-cards-*.json` | Scryfall 벌크 카드 데이터 (카드명, 수록 번호, 레어도, 이미지 URL) |
