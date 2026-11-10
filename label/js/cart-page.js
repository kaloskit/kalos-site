import { loadCatalog, loadConfig, quote, errorCopy } from './api.js';
import { getCart, setQty, removeItem, dropUnknown, getDelivery, setDelivery, getDest, parseVariant } from './cart.js';
import { h, clear, money } from './dom.js';
import './site.js';

const $ = (s) => document.querySelector(s);
const linesEl = $('#lines');
const sumEl = $('#summary-body');
const checkoutBtn = $('#checkout-btn');
let catalog;
let config;
let seq = 0;

function resolve(variantId) {
  const { productId, colourId, size } = parseVariant(variantId);
  const p = catalog.products.find((x) => x.id === productId && x.active);
  const c = p && p.colours.find((x) => x.id === colourId);
  if (!p || !c || !p.sizes.includes(size)) return null;
  return { p, c, size };
}

function renderLines() {
  clear(linesEl);
  const items = getCart();
  if (!items.length) {
    linesEl.append(h('div', { class: 'empty' }, h('p', {}, 'Your cart is empty.'), h('a', { class: 'btn inline', href: '/label/shop/' }, 'Shop')));
    return;
  }
  const max = config.maxQty;
  for (const it of items) {
    const r = resolve(it.variantId);
    const img = r.c.images[0];
    linesEl.append(
      h('div', { class: 'line' },
        h('div', { class: 'frame' }, h('img', { src: '/label/' + img.src, alt: '', width: 220, height: 220, loading: 'lazy' })),
        h('div', {},
          h('h3', {}, r.p.name),
          h('p', { class: 'meta' }, `${r.c.name} · ${r.size}`),
          h('div', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': `Decrease quantity, ${r.p.name} ${r.c.name} ${r.size}`, onclick: () => change(it, it.qty - 1, max) }, '−'),
            h('span', { 'aria-live': 'polite' }, it.qty),
            h('button', { type: 'button', 'aria-label': `Increase quantity, ${r.p.name} ${r.c.name} ${r.size}`, disabled: it.qty >= max, onclick: () => change(it, it.qty + 1, max) }, '+')),
          h('button', { type: 'button', class: 'linkbtn', onclick: () => { removeItem(it.variantId); refresh(); } }, 'Remove')),
        h('div', { class: 'amt' }, money(r.p.price_cents * it.qty))),
    );
  }
}

function change(it, qty, max) {
  setQty(it.variantId, qty, max);
  refresh();
}

function row(label, value, cls = '') {
  return h('div', { class: 'r ' + cls }, h('span', {}, label), value instanceof Node ? value : h('span', {}, value));
}

async function renderSummary() {
  const items = getCart();
  const method = getDelivery();
  checkoutBtn.setAttribute('aria-disabled', String(!items.length));
  checkoutBtn.tabIndex = items.length ? 0 : -1;
  const mine = ++seq;
  const sums = h('div', { class: 'sums' });
  sumEl.replaceChildren(deliveryBlock(), sums);
  if (!items.length) return;
  sums.append(row('Subtotal', 'Loading'));
  const dest = getDest();
  const country = config.countries.find((c) => c.code === dest.country);
  const region = country && (!country.regions || country.regions.some((r) => r.code === dest.region)) ? dest.region : undefined;
  try {
    const q = await quote({ items, delivery: method, country: method === 'ship' && country ? country.code : undefined, region: method === 'ship' && country ? region : undefined });
    if (mine !== seq) return;
    sums.replaceChildren(
      row('Subtotal', money(q.subtotal)),
      row('Shipping', q.shipping === 0 ? 'Free' : money(q.shipping)),
      ...(q.taxTbd ? [row('Tax', h('span', { class: 'tbd' }, 'TBD'))] : q.taxLines.map((t) => row(t.name, money(t.cents)))),
      row('Total', money(q.total) + (q.taxTbd ? ' + tax' : ''), 'total'),
    );
  } catch (err) {
    if (mine !== seq) return;
    if (err.code === 'unavailable_item' && err.variantId) {
      removeItem(err.variantId);
      refresh();
      return;
    }
    sums.replaceChildren(
      h('p', { class: 'unavail', role: 'status' }, err.code === 'network' ? 'Totals unavailable, try again. ' : errorCopy(err) + ' '),
      h('button', { type: 'button', class: 'linkbtn', onclick: renderSummary }, 'Retry'),
    );
  }
}

function deliveryBlock() {
  const method = getDelivery();
  const labels = config.countries.map((c) => c.label);
  const rate = (c) => (c === 0 ? 'Free' : money(c));
  const shipRate = Math.max(0, ...config.countries.map((c) => c.rateCents));
  const opts = [['ship', 'Ship to ' + labels.join(' or '), rate(shipRate)]];
  if (config.pickup.enabled) opts.push(['pickup', config.pickup.label, rate(config.pickup.rateCents)]);
  return h('div', {},
    h('p', { class: 'label', id: 'dl-label' }, 'Delivery'),
    h('div', { role: 'radiogroup', 'aria-labelledby': 'dl-label' },
      opts.map(([val, text, r]) =>
        h('label', { class: 'dl' + (method === val ? ' sel' : '') },
          h('input', { type: 'radio', name: 'delivery', value: val, checked: method === val, onchange: () => { setDelivery(val); renderSummary(); } }),
          h('span', {}, text), h('span', {}, r)))));
}

function refresh() {
  renderLines();
  renderSummary();
}

checkoutBtn.addEventListener('click', (e) => {
  if (checkoutBtn.getAttribute('aria-disabled') === 'true') e.preventDefault();
});

try {
  [catalog, config] = await Promise.all([loadCatalog(), loadConfig()]);
  dropUnknown((id) => resolve(id));
  if (!config.pickup.enabled && getDelivery() === 'pickup') setDelivery('ship');
  refresh();
} catch {
  linesEl.replaceChildren(h('p', { role: 'status' }, 'The cart could not load, try again.'));
}
