// 정적 호스팅(GitHub Pages 등)에서도 동작하도록 JSON 파일을 직접 읽고,
// Node 서버(/api)가 있으면 '지금 업데이트' 버튼을 활성화합니다.
const $ = (s) => document.querySelector(s);
const won = (n) => (n == null ? '가격 정보 없음' : n.toLocaleString('ko-KR') + '원');
const NEW_DAYS = 7;

const state = { data: null, tab: 'products' };
const els = {
  grid: $('#grid'), empty: $('#empty'), count: $('#count'), stats: $('#stats'), events: $('#events'),
  q: $('#q'), category: $('#category'), sort: $('#sort'), hideSoldOut: $('#hideSoldOut'), showRemoved: $('#showRemoved'),
  updatedAt: $('#updatedAt'), shopLink: $('#shopLink'), refreshBtn: $('#refreshBtn'), syncState: $('#syncState'),
};

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}
const fullTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR') : '');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '#';
}

async function load() {
  const res = await fetch('data/products.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('데이터 없음');
  state.data = await res.json();
  renderAll();
}

function renderAll() {
  const d = state.data;
  els.updatedAt.textContent = timeAgo(d.updatedAt);
  els.updatedAt.title = fullTime(d.updatedAt);
  els.updatedAt.dateTime = d.updatedAt;
  els.shopLink.textContent = d.shop.replace(/^https?:\/\//, '');
  els.shopLink.href = safeUrl(d.shop);

  const since = Date.now() - NEW_DAYS * 86400000;
  const isNew = (p) => new Date(p.firstSeen).getTime() > since;
  const active = d.products.filter((p) => !p.removed);
  const recentChanges = d.events.filter((e) => new Date(e.at).getTime() > Date.now() - 86400000).length;
  els.stats.innerHTML = [
    ['판매중 상품', active.length - d.stats.soldOut],
    ['품절', d.stats.soldOut],
    [`신상품 (${NEW_DAYS}일)`, active.filter(isNew).length],
    ['24시간 내 변경', recentChanges],
  ].map(([label, v]) => `<div class="stat"><b>${v.toLocaleString('ko-KR')}</b><span>${label}</span></div>`).join('');

  const current = els.category.value;
  const used = new Set(d.products.flatMap((p) => p.categories || []));
  els.category.innerHTML = '<option value="">전체 카테고리</option>' +
    d.categories.filter((c) => used.has(c.cateNo))
      .map((c) => `<option value="${esc(c.cateNo)}">${esc(c.name)}</option>`).join('');
  els.category.value = current;

  renderProducts();
  renderEvents();
}

function renderProducts() {
  const d = state.data;
  const q = els.q.value.trim().toLowerCase();
  const cat = els.category.value;
  const since = Date.now() - NEW_DAYS * 86400000;

  let list = d.products.filter((p) =>
    (els.showRemoved.checked || !p.removed) &&
    (!els.hideSoldOut.checked || !p.soldOut) &&
    (!cat || (p.categories || []).includes(cat)) &&
    (!q || (p.name || '').toLowerCase().includes(q))
  );
  const sorters = {
    new: (a, b) => Number(b.productNo) - Number(a.productNo),
    updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    priceDesc: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ko'),
  };
  list.sort(sorters[els.sort.value]);

  els.count.textContent = `${list.length.toLocaleString('ko-KR')}개 상품`;
  els.empty.hidden = list.length > 0;
  els.grid.innerHTML = list.map((p) => {
    const h = p.priceHistory || [];
    const prevPrice = h.length > 1 ? h[h.length - 2].price : null;
    const badges = [];
    if (new Date(p.firstSeen).getTime() > since) badges.push('<span class="badge badge--new">NEW</span>');
    if (p.removed) badges.push('<span class="badge badge--out">판매종료</span>');
    else if (p.soldOut) badges.push('<span class="badge badge--out">품절</span>');
    if (prevPrice != null && p.price != null && prevPrice !== p.price) {
      badges.push(p.price < prevPrice
        ? `<span class="badge badge--down" title="이전 ${won(prevPrice)}">▼ 가격인하</span>`
        : `<span class="badge badge--up" title="이전 ${won(prevPrice)}">▲ 가격인상</span>`);
    }
    const listPrice = p.discounted && p.listPrice ? `<del>${won(p.listPrice)}</del>` : '';
    return `<li class="card${p.soldOut ? ' is-out' : ''}${p.removed ? ' is-removed' : ''}">
      <a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">
        <div class="card__img">
          ${p.image ? `<img src="${esc(safeUrl(p.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
          <div class="badges">${badges.join('')}</div>
        </div>
        <div class="card__body">
          <span class="card__name">${esc(p.name)}</span>
          <span class="price">${won(p.price)}${listPrice}</span>
          <span class="meta" title="${esc(fullTime(p.updatedAt))}">변경 ${timeAgo(p.updatedAt)}</span>
        </div>
      </a>
    </li>`;
  }).join('');
}

const EVENT_LABEL = { new: '신상품', price: '가격변동', soldout: '품절', restock: '재입고', removed: '판매종료', restored: '판매재개' };
function renderEvents() {
  const ev = state.data.events;
  els.events.innerHTML = ev.length
    ? ev.map((e) => {
        let detail = '';
        if (e.type === 'price') detail = ` · ${won(e.from)} → ${won(e.to)}`;
        if (e.type === 'new' && e.to != null) detail = ` · ${won(e.to)}`;
        return `<li><span class="ev-type ev-type--${e.type}">${EVENT_LABEL[e.type] || e.type}</span>
          <span class="ev-name">${esc(e.name)}${detail}</span>
          <time class="ev-time" title="${esc(fullTime(e.at))}">${timeAgo(e.at)}</time></li>`;
      }).join('')
    : '<li class="empty">아직 변경 내역이 없습니다.</li>';
}

// 탭
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
  $('#panel-products').hidden = t.dataset.tab !== 'products';
  $('#panel-events').hidden = t.dataset.tab !== 'events';
}));
for (const el of [els.q, els.category, els.sort, els.hideSoldOut, els.showRemoved]) {
  el.addEventListener('input', () => state.data && renderProducts());
}

// 서버 모드: 수동 업데이트 + 진행 상태 폴링
let pollTimer = null;
async function checkStatus() {
  try {
    const res = await fetch('api/status', { cache: 'no-store' });
    if (!res.ok) return;
    const s = await res.json();
    els.refreshBtn.hidden = false;
    els.refreshBtn.disabled = s.running;
    els.syncState.textContent = s.running ? '업데이트 중…' : '';
    if (state.data && s.updatedAt && s.updatedAt !== state.data.updatedAt) await load();
    clearTimeout(pollTimer);
    pollTimer = setTimeout(checkStatus, s.running ? 3000 : 60000);
  } catch { /* 정적 호스팅: API 없음 */ }
}
els.refreshBtn.addEventListener('click', async () => {
  els.refreshBtn.disabled = true;
  await fetch('api/refresh', { method: 'POST' }).catch(() => {});
  checkStatus();
});

load()
  .catch(() => {
    els.grid.innerHTML = '';
    els.empty.hidden = false;
    els.empty.textContent = '아직 수집된 데이터가 없습니다. 잠시 후 새로고침 해주세요.';
  })
  .finally(checkStatus);
// 정적 모드에서도 주기적으로 최신 데이터 확인
setInterval(() => load().catch(() => {}), 5 * 60000);
