import { loadShopConfig } from './api.js';
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
loadShopConfig().then((c) => { max = c.max_qty_per_line || 5; }).catch(() => {});

function paint() {
  colourChips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colourChip === colour)));
  sizeChips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sizeChip === size)));
  galleries.forEach((g) => { g.hidden = g.dataset.gallery !== (colour || galleries[0].dataset.gallery); });
  const chip = [...colourChips].find((b) => b.dataset.colourChip === colour);
  colourName.textContent = chip ? chip.dataset.colourName : 'Choose a colour';
  const ready = Boolean(colour && size);
  addBtn.disabled = !ready;
  addBtn.textContent = 'Add to cart';
  if (!ready) {
    addBtn.setAttribute('aria-describedby', 'pick-hint');
  }
}
colourChips.forEach((b) => b.addEventListener('click', () => { colour = b.dataset.colourChip; status.textContent = ''; paint(); }));
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
