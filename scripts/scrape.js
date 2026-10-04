#!/usr/bin/env node
// 1회 수집 실행: npm run scrape
import { runSync } from '../src/sync.js';

runSync().catch((err) => {
  console.error('[scrape] 실패:', err.message);
  process.exit(1);
});
