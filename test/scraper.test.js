import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockShop } from './mock-shop.js';
import { scrapeShop } from '../src/scraper.js';
import { mergeResults } from '../src/store.js';
import { parsePrice, productNoFromUrl, categoryNoFromUrl } from '../src/parse.js';

const baseProducts = () => [
  { no: 1, name: '메인 노출 티', price: 10000, cats: ['24'] },
  { no: 2, name: "베이직 셔츠 '화이트'", price: 29000, sale: 25000, cats: ['24', '42'] },
  { no: 3, name: '린넨 셔츠', price: 39000, cats: ['24'] },
  { no: 4, name: '데님 팬츠', price: 49000, cats: ['25'], soldOut: true },
  { no: 5, name: '슬랙스', price: 45000, cats: ['25'] },
];

async function scrape(products) {
  const server = await createMockShop(products);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await scrapeShop({ baseUrl, delayMs: 0, concurrency: 2 }, () => {});
    return { result, hits: server.hits };
  } finally {
    server.close();
  }
}

test('URL / 가격 파싱', () => {
  assert.equal(parsePrice('29,000원'), 29000);
  assert.equal(parsePrice(''), null);
  assert.equal(productNoFromUrl('/product/detail.html?product_no=12&cate_no=3'), '12');
  assert.equal(productNoFromUrl('/product/이름/34/category/5/display/1/'), '34');
  assert.equal(categoryNoFromUrl('/category/상의/24/'), '24');
  assert.equal(categoryNoFromUrl('/product/x/34/category/5/display/1/'), null);
});

test('카테고리·페이지네이션·하위 카테고리를 따라 모든 상품을 수집', async () => {
  const { result, hits } = await scrape(baseProducts());
  const byNo = Object.fromEntries(result.products.map((p) => [p.productNo, p]));
  assert.deepEqual(Object.keys(byNo).sort(), ['1', '2', '3', '4', '5']);
  assert.ok(!byNo['999'], '사이드바 추천상품은 제외');

  assert.equal(byNo['2'].name, "베이직 셔츠 '화이트'");
  assert.equal(byNo['2'].price, 25000);
  assert.equal(byNo['2'].listPrice, 29000);
  assert.equal(byNo['2'].discounted, true);
  assert.deepEqual(byNo['2'].categories.sort(), ['24', '42']);
  assert.equal(byNo['3'].image, 'https://cdn.example.com/web/product/big/3.jpg');
  assert.equal(byNo['4'].soldOut, true);
  assert.equal(byNo['5'].soldOut, false);
  assert.ok(hits.includes('/product/list.html?cate_no=24&page=2'), '2페이지 방문');
  assert.ok(hits.includes('/product/list.html?cate_no=42&page=1'), '하위 카테고리 방문');
  assert.equal(result.errors.length, 0);
});

test('재수집 시 신상품/가격변동/품절/재입고/판매종료를 감지', async () => {
  const first = await scrape(baseProducts());
  const d1 = mergeResults(null, first.result, { shop: 'x', now: '2026-01-01T00:00:00.000Z' });
  assert.equal(d1.stats.total, 5);
  assert.equal(d1.events.filter((e) => e.type === 'new').length, 5);

  const next = baseProducts()
    .filter((p) => p.no !== 5) // 판매종료
    .map((p) => (p.no === 3 ? { ...p, price: 35000 } : p.no === 4 ? { ...p, soldOut: false } : p.no === 1 ? { ...p, soldOut: true } : p));
  next.push({ no: 6, name: '신상 니트', price: 59000, cats: ['24'] });

  const second = await scrape(next);
  const d2 = mergeResults(d1, second.result, { shop: 'x', now: '2026-01-02T00:00:00.000Z' });
  const types = d2.events.filter((e) => e.at.startsWith('2026-01-02')).map((e) => `${e.type}:${e.productNo}`).sort();
  assert.deepEqual(types, ['new:6', 'price:3', 'removed:5', 'restock:4', 'soldout:1']);

  const p3 = d2.products.find((p) => p.productNo === '3');
  assert.deepEqual(p3.priceHistory.map((h) => h.price), [39000, 35000]);
  assert.equal(p3.firstSeen, '2026-01-01T00:00:00.000Z');
  assert.equal(d2.products.find((p) => p.productNo === '2').updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(d2.products.find((p) => p.productNo === '5').removed, true);
  assert.equal(d2.stats.total, 5);
});

test('수집 결과가 비정상적으로 적으면 기존 상품을 판매종료 처리하지 않음', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ productNo: String(i + 1), name: `p${i}`, price: 1000, soldOut: false }));
  const d1 = mergeResults(null, { products: many, categories: [], errors: [] }, { now: 'a' });
  const d2 = mergeResults(d1, { products: many.slice(0, 3), categories: [], errors: ['x'] }, { now: 'b' });
  assert.equal(d2.lastRun.suspicious, true);
  assert.equal(d2.products.filter((p) => p.removed).length, 0);
});
