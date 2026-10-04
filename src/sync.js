import { config } from './config.js';
import { scrapeShop } from './scraper.js';
import { loadData, saveData, mergeResults } from './store.js';

let running = null;

/** 수집 → 병합 → 저장. 동시에 두 번 실행되지 않도록 진행 중인 작업을 공유합니다. */
export function runSync(overrides = {}, log = console.log) {
  if (running) return running;
  const cfg = { ...config, ...overrides };
  running = (async () => {
    const started = Date.now();
    const scraped = await scrapeShop(cfg, log);
    if (scraped.products.length === 0) {
      throw new Error('상품을 하나도 찾지 못했습니다. 기존 데이터를 유지합니다.');
    }
    const prev = await loadData(cfg.dataFile);
    const data = mergeResults(prev, scraped, { shop: cfg.baseUrl, maxHistory: cfg.maxHistory });
    data.lastRun.durationMs = Date.now() - started;
    await saveData(cfg.dataFile, data);
    const newEvents = data.events.filter((e) => e.at === data.updatedAt);
    log(`[sync] 저장 완료: 상품 ${data.stats.total}개, 변경 ${newEvents.length}건 → ${cfg.dataFile}`);
    return data;
  })().finally(() => {
    running = null;
  });
  return running;
}

export const isRunning = () => Boolean(running);
