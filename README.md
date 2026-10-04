# Cafe24 상품 자동 수집 · 최신화 사이트

[vibecodinguniv.cafe24.com](https://vibecodinguniv.cafe24.com/) 쇼핑몰의 상품을 자동으로 수집하고,
주기적으로 다시 확인해 **신상품 · 가격 변동 · 품절/재입고 · 판매 종료**를 추적하여 보여주는 웹사이트입니다.
다른 Cafe24 쇼핑몰도 `SHOP_URL`만 바꾸면 그대로 동작합니다.

## 기능

- 메인 페이지 · `sitemap.xml` · 카테고리 목록(페이지네이션, 하위 카테고리 포함)을 순회하며 상품 자동 발견
- 상품 상세 페이지에서 이름, 판매가/할인가, 대표 이미지, 품절 여부 수집
  (JSON-LD → 메타태그 → 스크립트 변수 → DOM 순으로 여러 단서를 시도해 스킨 차이에 대응)
- 이전 수집 결과와 비교하여 변경 이력(신상품/가격변동/품절/재입고/판매종료) 및 가격 히스토리 기록
- 수집이 비정상적으로 적게 끝나면(사이트 장애 등) 기존 상품을 판매 종료로 처리하지 않는 안전장치
- 웹 화면: 검색, 카테고리 필터, 정렬, 품절 숨기기, NEW/가격인하 배지, 변경 내역 탭, 다크 모드, 모바일 대응

## 실행 방법 1 — Node 서버 (자동 수집 내장)

```bash
npm install
npm start            # http://localhost:3000
```

서버가 켜지면 즉시 1회 수집하고, 이후 `REFRESH_MINUTES`(기본 60분)마다 자동으로 최신화합니다.
화면의 **지금 업데이트** 버튼으로 수동 수집도 가능합니다.

## 실행 방법 2 — GitHub Actions + GitHub Pages (서버 불필요, 무료)

1. 저장소 **Settings → Pages → Source** 를 `GitHub Actions` 로 설정
2. `.github/workflows/scrape.yml` 이 3시간마다 수집 → 변경 시 `public/data/products.json` 커밋 → Pages 배포
3. **Actions** 탭에서 `상품 수집 및 배포` 워크플로를 수동 실행(Run workflow)하면 바로 첫 수집이 됩니다.

다른 쇼핑몰을 대상으로 하려면 **Settings → Secrets and variables → Actions → Variables** 에 `SHOP_URL` 을 추가하세요.

## 1회만 수집

```bash
npm run scrape       # public/data/products.json 생성/갱신
```

## 설정 (환경변수)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `SHOP_URL` | `https://vibecodinguniv.cafe24.com` | 수집 대상 쇼핑몰 |
| `REFRESH_MINUTES` | `60` | 서버 자동 수집 주기(분), `0`이면 끔 |
| `CONCURRENCY` | `3` | 상세 페이지 동시 요청 수 |
| `DELAY_MS` | `300` | 요청 간 지연(ms) |
| `MAX_PAGES` | `50` | 카테고리당 최대 페이지 |
| `DATA_FILE` | `public/data/products.json` | 저장 위치 |
| `REFRESH_TOKEN` | (없음) | 설정 시 `POST /api/refresh` 에 `x-refresh-token` 헤더 필요 |
| `PORT` | `3000` | 서버 포트 |

## API (Node 서버 모드)

- `GET /api/products` — 전체 데이터
- `GET /api/status` — 수집 진행 여부, 마지막 수집 정보
- `POST /api/refresh` — 즉시 수집 시작

## 구조

```
src/parse.js     Cafe24 HTML 파싱 (순수 함수)
src/scraper.js   카테고리/페이지/상세 순회 수집
src/store.js     이전 결과와 병합, 변경 이력·가격 히스토리
src/sync.js      수집 → 병합 → 저장 (중복 실행 방지)
server.js        웹서버 + API + 스케줄러
public/          웹 화면 (정적 파일, Pages에서도 동작)
test/            가짜 Cafe24 쇼핑몰로 하는 통합 테스트 (npm test)
```

## 참고

- 요청 간 지연과 동시 요청 제한을 두어 대상 서버에 부담을 주지 않도록 했습니다. 주기를 너무 짧게 잡지 마세요.
- 본인이 운영하거나 수집 허락을 받은 쇼핑몰에 사용하세요. 이미지는 원본 쇼핑몰 CDN을 그대로 참조합니다.
- 스킨을 크게 커스터마이징한 쇼핑몰은 `src/parse.js` 의 선택자를 조정해야 할 수 있습니다.
