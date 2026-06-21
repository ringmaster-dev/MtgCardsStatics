# buildIndex.js

`buildSetPage.js`로 생성된 세트 HTML 파일을 `pages/`에서 스캔하고, 두 패널 인덱스 페이지(`pages/index.html`)를 생성합니다.

왼쪽 사이드바에는 세트 목록이 **Standard**와 **Other** 섹션으로 나뉘어 최신 순으로 표시됩니다. 세트를 클릭하면 오른쪽 iframe에 해당 페이지가 열립니다. 사이드바 폭은 구분선을 드래그해 조절할 수 있습니다.

---

## 사용법

```bash
node buildIndex.js
```

인수 없음. `buildSetPage.js`로 세트 페이지를 먼저 생성한 후 실행합니다.

---

## 동작 방식

1. `pages/`에서 `*.html` 파일 스캔 (`index.html`, `about.html` 제외)
2. [whatsinstandard.com](https://whatsinstandard.com/api/v6/standard.json) API에서 현재 Standard 합법 세트 코드 가져오기
   - 이미 발매된 세트(`enterDate ≤ 오늘`)이면서 아직 로테이션되지 않은(`exitDate`가 null이거나 미래) 세트만 Standard로 분류
3. `default-cards-*.json` 스트리밍으로 각 세트의 이름과 발매일 읽기
4. 미발매 세트(`released_at > 오늘`) 양쪽 섹션 모두에서 제외
5. **Standard**와 **Other**로 분류, 각각 발매일 내림차순 정렬
6. `pages/index.html` 저장

---

## 출력

`pages/index.html` — 자체 완결형 단일 파일 페이지:

- **사이드바** — Standard / Other로 구분된 세트 목록, 코드·이름 검색 박스, 하단 About 링크
- **iframe** — 선택한 세트 페이지 표시, 기본값은 가장 최신 Standard 세트
- **크기 조절 구분선** — 사이드바와 iframe 사이 경계를 드래그해 폭 조절 가능; 최소·최대 폭은 세트 이름 길이를 기준으로 자동 계산

---

## 의존 관계

| 출처 | 용도 |
| --- | --- |
| `pages/*.html` | `buildSetPage.js`로 생성된 세트 페이지 |
| `default-cards-*.json` | Scryfall 벌크 데이터 — 세트 이름 및 발매일 읽기 |
| `whatsinstandard.com` API | 현재 Standard 합법 세트 판별 |
