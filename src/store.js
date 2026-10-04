// 이전 수집 결과와 새 수집 결과를 병합하여 신상품/가격변동/품절/삭제 이력을 관리합니다.
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_EVENTS = 300;

export async function loadData(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function saveData(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file); // 원자적 교체: 웹사이트가 반쯤 쓰인 파일을 읽지 않도록
}

export function mergeResults(prev, scraped, { shop, now = new Date().toISOString(), maxHistory = 100 } = {}) {
  const prevProducts = new Map((prev?.products || []).map((p) => [p.productNo, p]));
  const events = [];
  const seen = new Set();
  const products = [];

  for (const p of scraped.products) {
    seen.add(p.productNo);
    const old = prevProducts.get(p.productNo);
    const history = [...(old?.priceHistory || [])];
    if (!old) {
      events.push({ type: 'new', productNo: p.productNo, name: p.name, to: p.price, at: now });
      history.push({ price: p.price, at: now });
    } else {
      if (old.removed) events.push({ type: 'restored', productNo: p.productNo, name: p.name, at: now });
      if (p.price != null && old.price !== p.price) {
        events.push({ type: 'price', productNo: p.productNo, name: p.name, from: old.price, to: p.price, at: now });
        history.push({ price: p.price, at: now });
      }
      if (!old.soldOut && p.soldOut) events.push({ type: 'soldout', productNo: p.productNo, name: p.name, at: now });
      if (old.soldOut && !p.soldOut) events.push({ type: 'restock', productNo: p.productNo, name: p.name, at: now });
    }
    products.push({
      ...p,
      price: p.price ?? old?.price ?? null,
      firstSeen: old?.firstSeen || now,
      lastSeen: now,
      updatedAt: old && sameCore(old, p) ? old.updatedAt || now : now,
      removed: false,
      priceHistory: history.slice(-maxHistory),
    });
  }

  // 이번 수집에서 사라진 상품: 수집이 비정상적으로 적게 끝난 경우엔 삭제 처리하지 않음
  const prevActive = (prev?.products || []).filter((p) => !p.removed).length;
  const suspicious = prevActive >= 10 && scraped.products.length < prevActive * 0.5;
  for (const [no, old] of prevProducts) {
    if (seen.has(no)) continue;
    if (suspicious || old.removed) {
      products.push(old);
    } else {
      events.push({ type: 'removed', productNo: no, name: old.name, at: now });
      products.push({ ...old, removed: true, removedAt: now });
    }
  }

  products.sort((a, b) => Number(b.productNo) - Number(a.productNo));
  const active = products.filter((p) => !p.removed);
  return {
    shop,
    updatedAt: now,
    lastRun: { at: now, scraped: scraped.products.length, errors: scraped.errors.length, suspicious },
    stats: {
      total: active.length,
      soldOut: active.filter((p) => p.soldOut).length,
      removed: products.length - active.length,
    },
    categories: mergeCategories(prev?.categories, scraped.categories),
    products,
    events: [...events, ...(prev?.events || [])].slice(0, MAX_EVENTS),
  };
}

function sameCore(a, b) {
  return a.name === b.name && a.price === b.price && a.soldOut === b.soldOut && a.image === b.image;
}

function mergeCategories(prev = [], next = []) {
  const map = new Map(prev.map((c) => [c.cateNo, c]));
  for (const c of next) map.set(c.cateNo, c);
  return [...map.values()].sort((a, b) => Number(a.cateNo) - Number(b.cateNo));
}
