// 쇼핑몰 전체를 돌며 상품 목록을 수집합니다.
// 1) 메인 페이지 + sitemap.xml 에서 카테고리/상품 링크 발견
// 2) 카테고리 목록 페이지를 페이지 끝까지 순회
// 3) 상품 상세 페이지를 방문해 이름/가격/이미지/품절 여부 파싱
import { config as defaultConfig } from './config.js';
import {
  extractCategories,
  extractProductLinks,
  extractMaxPage,
  LIST_SCOPE,
  parseProductDetail,
} from './parse.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createFetcher(cfg) {
  return async function fetchText(url, { retries = 2 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': cfg.userAgent, 'Accept-Language': 'ko-KR,ko;q=0.9' },
          redirect: 'follow',
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) await sleep(1000 * 2 ** attempt);
      }
    }
    throw new Error(`${url}: ${lastErr?.message || lastErr}`);
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scrapeShop(overrides = {}, log = console.log) {
  const cfg = { ...defaultConfig, ...overrides };
  const base = cfg.baseUrl;
  const fetchText = overrides.fetchText || createFetcher(cfg);
  const errors = [];
  const categories = new Map(); // cate_no -> name
  const hints = new Map(); // product_no -> 목록에서 얻은 정보
  const productCats = new Map(); // product_no -> Set<cate_no>

  const addHints = (map, cateNo) => {
    for (const [no, info] of map) {
      hints.set(no, { ...info, ...hints.get(no), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v != null)) });
      if (cateNo) {
        if (!productCats.has(no)) productCats.set(no, new Set());
        productCats.get(no).add(cateNo);
      }
    }
  };

  // 1) 메인 페이지
  log(`[scrape] ${base} 메인 페이지 분석`);
  const home = await fetchText(base + '/');
  if (!home) throw new Error('메인 페이지를 불러오지 못했습니다');
  for (const [no, name] of extractCategories(home)) categories.set(no, name);
  addHints(extractProductLinks(home, base));

  // sitemap.xml (있으면 사용)
  try {
    const sitemap = await fetchText(base + '/sitemap.xml', { retries: 0 });
    if (sitemap) {
      for (const m of sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
        const loc = m[1].replace(/&amp;/g, '&');
        addHints(extractProductLinks(`<a href="${loc}"></a>`, base));
        for (const [no] of extractCategories(`<a href="${loc}"></a>`)) {
          if (!categories.has(no)) categories.set(no, '');
        }
      }
    }
  } catch (e) {
    log(`[scrape] sitemap.xml 건너뜀 (${e.message})`);
  }

  // 2) 카테고리 순회 (하위 카테고리는 목록 페이지에서 새로 발견되면 큐에 추가)
  const queue = [...categories.keys()];
  const visited = new Set();
  while (queue.length) {
    const cateNo = queue.shift();
    if (visited.has(cateNo)) continue;
    visited.add(cateNo);
    let maxPage = 1;
    for (let page = 1; page <= Math.min(maxPage, cfg.maxPagesPerCategory); page++) {
      const url = `${base}/product/list.html?cate_no=${cateNo}&page=${page}`;
      let html;
      try {
        html = await fetchText(url);
      } catch (e) {
        errors.push(e.message);
        break;
      }
      if (!html) break;
      const before = productCats.size;
      const links = extractProductLinks(html, base, { scope: LIST_SCOPE });
      addHints(links, cateNo);
      for (const [no, name] of extractCategories(html)) {
        if (!categories.has(no) || (!categories.get(no) && name)) categories.set(no, name);
        if (!visited.has(no)) queue.push(no);
      }
      maxPage = Math.max(maxPage, extractMaxPage(html));
      if (links.size === 0 || (page > 1 && productCats.size === before && maxPage <= page)) break;
      await sleep(cfg.delayMs);
    }
  }
  log(`[scrape] 카테고리 ${visited.size}개, 상품 ${hints.size}개 발견`);

  // 3) 상품 상세
  const productNos = [...hints.keys()].sort((a, b) => Number(a) - Number(b));
  const products = (
    await mapLimit(productNos, cfg.concurrency, async (no) => {
      const url = `${base}/product/detail.html?product_no=${no}`;
      const hint = hints.get(no) || {};
      try {
        await sleep(cfg.delayMs);
        const html = await fetchText(url);
        if (!html) return null; // 삭제된 상품
        const detail = parseProductDetail(html, { productNo: no, url, baseUrl: base });
        return {
          ...detail,
          name: detail.name || hint.name || null,
          price: detail.price ?? hint.price ?? null,
          image: detail.image || hint.image || null,
          categories: [...(productCats.get(no) || [])],
        };
      } catch (e) {
        errors.push(e.message);
        // 상세 페이지 실패 시 목록 정보라도 사용
        return hint.name
          ? { productNo: no, name: hint.name, price: hint.price ?? null, image: hint.image || null,
              url, soldOut: false, categories: [...(productCats.get(no) || [])], partial: true }
          : null;
      }
    })
  ).filter((p) => p && p.name);

  log(`[scrape] 상세 수집 완료: ${products.length}개 (오류 ${errors.length}건)`);
  return {
    products,
    categories: [...categories].map(([no, name]) => ({ cateNo: no, name: name || `카테고리 ${no}` })),
    errors,
  };
}
