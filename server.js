// 웹사이트 + API + 자동 수집 스케줄러
import path from 'node:path';
import express from 'express';
import { config } from './src/config.js';
import { loadData } from './src/store.js';
import { runSync, isRunning } from './src/sync.js';

const app = express();
// DATA_FILE 위치가 바뀌어도 화면은 항상 data/products.json 으로 읽습니다.
app.get('/data/products.json', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.resolve(config.dataFile), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: '아직 수집된 데이터가 없습니다.' });
  });
});
app.use(express.static('public', { maxAge: 0 }));

app.get('/api/products', async (_req, res) => {
  const data = await loadData(config.dataFile);
  if (!data) return res.status(404).json({ error: '아직 수집된 데이터가 없습니다.' });
  res.json(data);
});

app.get('/api/status', async (_req, res) => {
  const data = await loadData(config.dataFile);
  res.json({
    running: isRunning(),
    updatedAt: data?.updatedAt || null,
    lastRun: data?.lastRun || null,
    nextRunAt: nextRunAt?.toISOString() || null,
  });
});

app.post('/api/refresh', (req, res) => {
  if (config.refreshToken && req.get('x-refresh-token') !== config.refreshToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (isRunning()) return res.status(202).json({ started: false, running: true });
  runSync().catch((e) => console.error('[sync] 실패:', e.message));
  res.status(202).json({ started: true, running: true });
});

let nextRunAt = null;
function schedule() {
  const minutes = config.refreshIntervalMinutes;
  if (!minutes) return;
  const tick = () => {
    nextRunAt = new Date(Date.now() + minutes * 60_000);
    runSync().catch((e) => console.error('[sync] 실패:', e.message));
  };
  setInterval(tick, minutes * 60_000);
  // 서버 시작 직후 1회 수집
  tick();
}

app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}  (대상: ${config.baseUrl})`);
  schedule();
});
