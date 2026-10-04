// 모든 설정은 환경변수로 덮어쓸 수 있습니다.
const env = process.env;

export const config = {
  // 수집 대상 쇼핑몰 주소
  baseUrl: (env.SHOP_URL || 'https://vibecodinguniv.cafe24.com').replace(/\/+$/, ''),
  // 결과 파일 (웹사이트가 이 파일을 읽습니다)
  dataFile: env.DATA_FILE || 'public/data/products.json',
  // 동시 요청 수 / 요청 간 지연(ms) — 상대 서버에 부담을 주지 않도록 보수적으로
  concurrency: Number(env.CONCURRENCY || 3),
  delayMs: Number(env.DELAY_MS || 300),
  // 카테고리당 최대 페이지 수
  maxPagesPerCategory: Number(env.MAX_PAGES || 50),
  // 요청 타임아웃(ms)
  timeoutMs: Number(env.TIMEOUT_MS || 15000),
  // 서버 내장 스케줄러 주기(분). 0이면 자동 수집 끔
  refreshIntervalMinutes: Number(env.REFRESH_MINUTES ?? 60),
  // 가격 이력 최대 보관 개수
  maxHistory: Number(env.MAX_HISTORY || 100),
  userAgent: env.USER_AGENT || 'Mozilla/5.0 (compatible; Cafe24ProductSync/1.0)',
  port: Number(env.PORT || 3000),
  // /api/refresh 보호용 토큰 (설정 시 헤더 x-refresh-token 필요)
  refreshToken: env.REFRESH_TOKEN || '',
};
