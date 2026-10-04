// Cafe24 표준 스킨의 HTML 구조를 해석하는 순수 함수 모음.
// 스킨마다 마크업이 조금씩 다르기 때문에 JSON-LD → 메타태그 → 스크립트 변수 → DOM 순서로
// 여러 단서를 시도하고, 먼저 찾은 값을 사용합니다.
import * as cheerio from 'cheerio';

const PRODUCT_NO_PATTERNS = [
  /[?&]product_no=(\d+)/,
  /\/product\/[^/?#"']*\/(\d+)(?:\/|$|\?|#)/, // SEO URL: /product/상품명/123/category/45/display/1/
];
const CATEGORY_NO_PATTERNS = [
  /[?&]cate_no=(\d+)/,
  /\/category\/[^/?#"']*\/(\d+)(?:\/|$|\?|#)/, // SEO URL: /category/카테고리명/45/
];

function matchFirst(href, patterns) {
  for (const re of patterns) {
    const m = href.match(re);
    if (m) return m[1];
  }
  return null;
}

export function productNoFromUrl(href = '') {
  return matchFirst(href, PRODUCT_NO_PATTERNS);
}

export function categoryNoFromUrl(href = '') {
  // 상품 상세 SEO URL 안의 /category/45/ 는 카테고리 목록 링크가 아니므로 제외
  if (productNoFromUrl(href)) return null;
  return matchFirst(href, CATEGORY_NO_PATTERNS);
}

export function parsePrice(text) {
  if (text == null) return null;
  const digits = String(text).replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = Math.round(Number(digits));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function absoluteUrl(src, baseUrl) {
  if (!src) return null;
  src = src.trim();
  if (src.startsWith('//')) return 'https:' + src;
  try {
    return new URL(src, baseUrl + '/').href;
  } catch {
    return null;
  }
}

const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

/** 페이지 안의 모든 카테고리 번호와 이름 */
export function extractCategories(html) {
  const $ = cheerio.load(html);
  const cats = new Map();
  $('a[href]').each((_, a) => {
    const no = categoryNoFromUrl($(a).attr('href'));
    if (!no) return;
    const name = clean($(a).text());
    if (!cats.has(no) || (!cats.get(no) && name)) cats.set(no, name);
  });
  return cats; // Map<cate_no, name>
}

/** 페이지 안의 모든 상품 번호 + 목록에서 보이는 간단 정보(상세 수집 실패 시 대비용) */
// 카테고리 목록 페이지에서는 사이드바의 추천상품 등을 제외하기 위해 본문 목록 영역만 봅니다.
export const LIST_SCOPE = '.xans-product-normalpackage, .xans-product-listnormal, .prdList';

export function extractProductLinks(html, baseUrl, { scope } = {}) {
  const $ = cheerio.load(html);
  const items = new Map();
  const scoped = scope ? $(scope) : null;
  const anchors = scoped && scoped.length ? scoped.find('a[href]') : $('a[href]');
  anchors.each((_, a) => {
    const href = $(a).attr('href');
    const no = productNoFromUrl(href);
    if (!no) return;
    const prev = items.get(no) || { productNo: no, url: absoluteUrl(href, baseUrl) };
    // 목록 아이템 컨테이너(li)에서 이름/이미지/가격 힌트를 찾음
    const li = $(a).closest('li, .xans-record-, .item, .prdList__item');
    if (li.length) {
      if (!prev.image) {
        const img = li.find('img').first();
        const src = img.attr('ec-data-src') || img.attr('data-src') || img.attr('src');
        if (src && !/icon|ico_|btn_/.test(src)) prev.image = absoluteUrl(src, baseUrl);
      }
      if (!prev.name) {
        const nameEl = li.find('.name a, .name, .prdName, .title').first();
        let name = clean(nameEl.text()).replace(/^상품명\s*:\s*/, '');
        if (name) prev.name = name;
      }
      if (prev.price == null) {
        const priceText = li.find('[rel="판매가"], .price, .xans-product-listitem li').text();
        const m = clean(priceText).match(/([\d,]+)\s*원/);
        if (m) prev.price = parsePrice(m[1]);
      }
    }
    items.set(no, prev);
  });
  return items; // Map<product_no, partial>
}

/** 페이지네이션에서 최대 페이지 번호 */
export function extractMaxPage(html) {
  const $ = cheerio.load(html);
  let max = 1;
  $('a[href*="page="]').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/[?&]page=(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max;
}

function readJsonLdProduct($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    if (found) return;
    try {
      const data = JSON.parse($(s).contents().text());
      const list = Array.isArray(data) ? data : data['@graph'] || [data];
      found = list.find((d) => d && /Product/i.test(d['@type'])) || null;
    } catch {
      /* 잘못된 JSON-LD 무시 */
    }
  });
  return found;
}

function readScriptVar(html, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`);
  const m = html.match(re);
  return m ? m[2].replace(/\\(['"\\/])/g, '$1') : null;
}

/** 상품 상세 페이지 파싱 */
export function parseProductDetail(html, { productNo, url, baseUrl }) {
  const $ = cheerio.load(html);
  const meta = (p) =>
    $(`meta[property="${p}"]`).attr('content') || $(`meta[name="${p}"]`).attr('content') || null;
  const ld = readJsonLdProduct($);
  const offer = ld ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : null;

  const name = clean(
    readScriptVar(html, 'product_name') ||
      ld?.name ||
      $('.infoArea .headingArea h2, .headingArea h2, .infoArea h2, .prd_name, #span_product_name').first().text() ||
      meta('og:title')
  );

  // 정가(판매가)와 할인가
  const listPrice =
    parsePrice(meta('product:price:amount')) ??
    parsePrice(readScriptVar(html, 'product_price')) ??
    parsePrice($('#span_product_price_text').text()) ??
    parsePrice(offer?.price);
  const salePrice =
    parsePrice(meta('product:sale_price:amount')) ??
    parsePrice($('#span_product_price_sale').text().match(/[\d,]+/)?.[0]) ??
    null;
  const price = salePrice && listPrice && salePrice < listPrice ? salePrice : listPrice ?? salePrice;

  const imgSrc =
    meta('og:image') ||
    (Array.isArray(ld?.image) ? ld.image[0] : ld?.image) ||
    $('.keyImg img, .BigImage, .thumbnail img, .xans-product-image img').first().attr('src');

  const description = clean(meta('og:description') || ld?.description || meta('description'));

  // 품절 판정
  const availability = String(offer?.availability || meta('product:availability') || '');
  const soldOutButton = $('.btnSoldout, .btn_soldout, #btnSoldout').filter(
    (_, el) => !/displaynone/.test($(el).attr('class') || '') && !/display\s*:\s*none/.test($(el).attr('style') || '')
  ).length > 0;
  const soldOut =
    /OutOfStock|SoldOut|oos/i.test(availability) ||
    readScriptVar(html, 'is_soldout_icon') === 'T' ||
    soldOutButton;

  return {
    productNo: String(productNo),
    name: name || null,
    price: price ?? null,
    listPrice: listPrice ?? null,
    discounted: Boolean(salePrice && listPrice && salePrice < listPrice),
    currency: meta('product:price:currency') || offer?.priceCurrency || 'KRW',
    image: absoluteUrl(imgSrc, baseUrl),
    description: description || null,
    soldOut,
    url,
  };
}
