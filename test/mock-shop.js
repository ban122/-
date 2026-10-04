// 테스트용 가짜 Cafe24 쇼핑몰 (표준 스킨 마크업을 흉내냄)
import http from 'node:http';

export function createMockShop(products) {
  const byCat = (c) => products.filter((p) => p.cats.includes(c));
  const PER_PAGE = 2;

  const nav = `<ul class="xans-layout-category">
    <li><a href="/category/상의/24/">상의</a></li>
    <li><a href="/product/list.html?cate_no=25">하의</a></li></ul>
    <div class="xans-product-listmain"><ul><li><a href="/product/main-item/1/category/24/display/2/">메인 노출</a></li></ul></div>`;

  const listPage = (cate, page) => {
    const items = byCat(cate);
    const pageItems = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const pages = Math.ceil(items.length / PER_PAGE);
    return `<html><body>${nav}
      <div class="xans-product-listrecent"><ul><li><a href="/product/detail.html?product_no=999">사이드 추천</a></li></ul></div>
      <div class="xans-product-normalpackage"><ul class="prdList">
      ${pageItems.map((p) => `<li class="xans-record-">
        <div class="thumbnail"><a href="/product/${encodeURIComponent(p.name)}/${p.no}/category/${cate}/display/1/">
          <img src="//cdn.example.com/web/product/medium/${p.no}.jpg" /></a></div>
        <div class="description"><strong class="name"><a href="/product/detail.html?product_no=${p.no}&cate_no=${cate}"><span>상품명</span> : ${p.name}</a></strong>
        <ul class="xans-product-listitem"><li><strong>판매가</strong> : <span>${p.price.toLocaleString()}원</span></li></ul></div>
      </li>`).join('')}
      </ul></div>
      ${cate === '24' ? '<a href="/product/list.html?cate_no=42">상의 &gt; 티셔츠</a>' : ''}
      <div class="xans-product-normalpaging">${Array.from({ length: pages }, (_, i) => `<a href="?cate_no=${cate}&page=${i + 1}">${i + 1}</a>`).join('')}</div>
      </body></html>`;
  };

  const detail = (p) => `<html><head>
    <meta property="og:title" content="${p.name} - 테스트몰" />
    <meta property="og:image" content="//cdn.example.com/web/product/big/${p.no}.jpg" />
    <meta property="og:description" content="${p.name} 설명" />
    <meta property="product:price:amount" content="${p.price}" />
    ${p.sale ? `<meta property="product:sale_price:amount" content="${p.sale}" />` : ''}
    <meta property="product:price:currency" content="KRW" />
    </head><body>${nav}
    <div class="infoArea"><div class="headingArea"><h2>${p.name}</h2></div>
    <span id="span_product_price_text">${p.price.toLocaleString()}원</span>
    <a class="btnSoldout ${p.soldOut ? '' : 'displaynone'}">SOLD OUT</a></div>
    <script>var product_name = '${p.name.replace(/'/g, "\\'")}';</script>
    </body></html>`;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    server.hits.push(u.pathname + u.search);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    if (u.pathname === '/') return send(200, `<html><body>${nav}</body></html>`);
    if (u.pathname === '/product/list.html') {
      return send(200, listPage(u.searchParams.get('cate_no'), Number(u.searchParams.get('page') || 1)));
    }
    if (u.pathname === '/product/detail.html') {
      const p = products.find((x) => String(x.no) === u.searchParams.get('product_no'));
      return p ? send(200, detail(p)) : send(404, 'not found');
    }
    send(404, 'not found');
  });
  server.hits = [];
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
