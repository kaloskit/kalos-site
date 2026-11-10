import { loadConfig } from './api.js';
import { addItem } from './cart.js';
import './site.js';

const root = document.querySelector('[data-product]');
const productId = root.dataset.product;
const galleries = root.querySelectorAll('[data-gallery]');
const colourChips = root.querySelectorAll('[data-colour-chip]');
const sizeChips = root.querySelectorAll('[data-size-chip]');
const colourName = root.querySelector('[data-colour-name]');
const addBtn = root.querySelector('[data-add]');
const status = root.querySelector('[data-status]');
// The page marks its default colour with aria-pressed="true"; fall back to the first chip.
let colour = (root.querySelector('[data-colour-chip][aria-pressed="true"]') || colourChips[0])?.dataset.colourChip || null;
let size = null;
let max = 5;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 899px)');
const gallery = {};
loadConfig().then((c) => { max = c.maxQty || 5; }).catch(() => {});

function paint() {
  colourChips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colourChip === colour)));
  sizeChips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sizeChip === size)));
  galleries.forEach((g) => { g.hidden = g.dataset.gallery !== (colour || galleries[0].dataset.gallery); });
  const chip = [...colourChips].find((b) => b.dataset.colourChip === colour);
  colourName.textContent = chip ? chip.dataset.colourName : 'Choose a colour';
  const ready = Boolean(colour && size);
  addBtn.disabled = !ready;
  addBtn.textContent = ready ? 'Add to Cart' : 'Select a Size';
  addBtn.setAttribute('aria-disabled', String(!ready));
  paintBar(ready);
  if (!ready) {
    addBtn.setAttribute('aria-describedby', 'pick-hint');
  }
}
colourChips.forEach((b) => b.addEventListener('click', () => {
  const changed = colour !== b.dataset.colourChip;
  colour = b.dataset.colourChip;
  status.textContent = '';
  paint();
  if (changed) gallery[colour]?.show(0, true);
}));
sizeChips.forEach((b) => b.addEventListener('click', () => { size = b.dataset.sizeChip; status.textContent = ''; paint(); }));
function add() {
  if (!colour || !size) return false;
  addItem(productId, `${productId}:${colour}:${size}`, 1, max);
  const a = document.createElement('a');
  a.href = '/label/cart/';
  a.textContent = 'View Cart';
  status.replaceChildren('Added to your cart. ', a);
  return true;
}
addBtn.addEventListener('click', add);

// Phones: a fixed bar with the product name, price and a mirror of the main button
// while the main button is scrolled out of view above the viewport.
const bar = document.createElement('div');
bar.className = 'sticky';
const barInfo = document.createElement('div');
barInfo.className = 'info';
const barName = document.createElement('span');
barName.className = 'n';
barName.textContent = root.querySelector('.buy h1')?.textContent || '';
const barPrice = document.createElement('span');
barPrice.className = 'p';
barPrice.textContent = root.querySelector('.buy .price')?.textContent || '';
barInfo.append(barName, barPrice);
const barBtn = document.createElement('button');
barBtn.type = 'button';
barBtn.className = 'btn ghost';
bar.append(barInfo, barBtn);
document.body.append(bar);
let barReady = false;
let barFlash = 0;
function paintBar(ready) {
  barReady = ready;
  if (barFlash) return;
  barBtn.textContent = ready ? 'Add to Cart' : 'Select a Size';
  barBtn.classList.toggle('ghost', !ready);
}
barBtn.addEventListener('click', () => {
  if (!barReady) {
    root.querySelector('[data-size-chip]')?.closest('.opt')?.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
    return;
  }
  if (!add()) return;
  barBtn.textContent = 'Added';
  clearTimeout(barFlash);
  barFlash = setTimeout(() => { barFlash = 0; paintBar(barReady); }, 1600);
});
let mainGone = false;
function paintSticky() {
  const on = narrow.matches && mainGone;
  bar.classList.toggle('show', on);
  document.body.classList.toggle('has-sticky', on);
}
// The 56px top margin is the sticky site header: a button under it counts as gone.
// An observer only reports crossings, so a jump from below the fold to past the button
// (restored scroll, anchor links) is caught by a throttled scroll check.
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => {
    mainGone = !e.isIntersecting && e.boundingClientRect.top < 0;
    paintSticky();
  }, { rootMargin: '-56px 0px 0px 0px' }).observe(addBtn);
}
let scrollTick = 0;
addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0;
    mainGone = addBtn.getBoundingClientRect().bottom < 56;
    paintSticky();
  });
}, { passive: true });
narrow.addEventListener('change', paintSticky);
document.querySelector('[data-open-guide]')?.addEventListener('click', () => {
  const d = document.getElementById('size-guide');
  if (d) d.open = true;
});
paint();

// Image gallery: desktop shows one slide at a time, mobile is a scroll-snap carousel.
// The same thumb buttons are the desktop thumbnails and the mobile dots.
galleries.forEach((g) => {
  const track = g.querySelector('.track');
  const slides = [...track.children];
  const thumbs = [...g.querySelectorAll('[data-thumb]')];
  let i = 0;
  function paintIndex() {
    slides.forEach((s, k) => s.classList.toggle('on', k === i));
    thumbs.forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')));
  }
  function show(n, scroll) {
    i = (n + slides.length) % slides.length;
    paintIndex();
    if (scroll && narrow.matches) track.scrollTo({ left: i * track.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  gallery[g.dataset.gallery] = { show };
  thumbs.forEach((t, k) => t.addEventListener('click', () => show(k, true)));
  g.querySelector('[data-prev]')?.addEventListener('click', () => show(i - 1, true));
  g.querySelector('[data-next]')?.addEventListener('click', () => show(i + 1, true));
  g.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1, true); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1, true); }
  });
  track.addEventListener('scroll', () => {
    if (!narrow.matches || !track.clientWidth) return;
    const n = Math.round(track.scrollLeft / track.clientWidth);
    if (n !== i && n >= 0 && n < slides.length) { i = n; paintIndex(); }
  }, { passive: true });
  narrow.addEventListener('change', () => show(i, true));
});

// An accordion opened near the bottom of the screen expands out of view, so it
// looks like nothing happened. Bring the opened section into view.
const calm = matchMedia('(prefers-reduced-motion: reduce)');
root.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => {
  if (!d.open) return;
  const r = d.getBoundingClientRect();
  if (r.bottom > innerHeight - 96) d.scrollIntoView({ block: 'nearest', behavior: calm.matches ? 'auto' : 'smooth' });
}));
