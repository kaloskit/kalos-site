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
let colour = colourChips.length === 1 ? colourChips[0].dataset.colourChip : null;
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
  addBtn.textContent = 'Add to Cart';
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
addBtn.addEventListener('click', () => {
  if (!colour || !size) return;
  addItem(productId, `${productId}:${colour}:${size}`, 1, max);
  const a = document.createElement('a');
  a.href = '/label/cart/';
  a.textContent = 'View cart';
  status.replaceChildren('Added to your cart. ', a);
});
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
