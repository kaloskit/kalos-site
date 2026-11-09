import { loadCatalog, loadShopConfig, quote, createCheckout, confirmCheckout } from './api.js';
import { getCart, clearCart, getDelivery, setDelivery, getDest, setDest, parseVariant, dropUnknown } from './cart.js';
import { h, clear, money } from './dom.js';
import { REGIONS, POSTAL } from './regions.js';
import './site.js';

const HELCIM_SRC = 'https://secure.helcim.app/helcim-pay/services/start.js';
const $ = (id) => document.getElementById(id);
const form = $('checkout-form');
const payBtn = $('pay-btn');
const errBox = $('form-error');
let catalog;
let config;
let seq = 0;

function resolve(variantId) {
  const { productId, colourId, size } = parseVariant(variantId);
  const p = catalog.products.find((x) => x.id === productId && x.active);
  const c = p && p.colours.find((x) => x.id === colourId);
  return p && c && p.sizes.includes(size) ? { p, c, size } : null;
}

const method = () => form.elements.delivery.value;

function fillSelect(sel, pairs, placeholder) {
  sel.replaceChildren(h('option', { value: '' }, placeholder), ...pairs.map(([v, t]) => h('option', { value: v }, t)));
}

function setupCountry() {
  const countries = Object.entries(config.shipping.countries);
  fillSelect($('country'), countries.map(([k, v]) => [k, v.label]), 'Select a country');
  const dest = getDest();
  $('country').value = countries.some(([k]) => k === dest.country) ? dest.country : countries[0][0];
  syncRegions();
  if (dest.region) $('region').value = dest.region;
}

function syncRegions() {
  const cc = $('country').value;
  const kind = config.shipping.countries[cc]?.regions;
  fillSelect($('region'), REGIONS[kind] || [], kind === 'states' ? 'Select a state' : 'Select a province');
  $('region-label').textContent = kind === 'states' ? 'State' : 'Province';
  $('postal-label').textContent = (POSTAL[cc] || POSTAL.CA).label;
}

function setupDelivery() {
  const opts = [['ship', 'Ship to ' + Object.values(config.shipping.countries).map((c) => c.label).join(' or ')]];
  if (config.pickup.enabled) opts.push(['pickup', config.pickup.label]);
  const saved = opts.some(([v]) => v === getDelivery()) ? getDelivery() : 'ship';
  const box = $('delivery-opts');
  box.replaceChildren(...opts.map(([v, t]) =>
    h('label', { class: 'dl' + (saved === v ? ' sel' : '') },
      h('input', { type: 'radio', name: 'delivery', value: v, checked: saved === v }), h('span', {}, t), h('span', {}, 'Free'))));
  box.addEventListener('change', () => {
    setDelivery(method());
    box.querySelectorAll('.dl').forEach((l) => l.classList.toggle('sel', l.querySelector('input').checked));
    paintDelivery();
    renderTotals();
  });
  paintDelivery();
}

function paintDelivery() {
  const ship = method() === 'ship';
  $('ship-fields').hidden = !ship;
  const note = $('pickup-note');
  note.hidden = ship;
  note.textContent = ship ? '' : config.pickup.instructions;
}

function renderReview() {
  const items = getCart();
  const box = $('review');
  clear(box);
  for (const it of items) {
    const r = resolve(it.variantId);
    box.append(h('div', { class: 'line' },
      h('div', { class: 'frame' }, h('img', { src: '/label/' + r.c.images[0].src, alt: '', width: 160, height: 160, loading: 'lazy' })),
      h('div', {}, h('h3', {}, r.p.name), h('p', { class: 'meta' }, `${r.c.name} · ${r.size} · Qty ${it.qty}`)),
      h('div', { class: 'amt' }, money(r.p.price_cents * it.qty))));
  }
}

const row = (l, v, cls = '') => h('div', { class: 'r ' + cls }, h('span', {}, l), v instanceof Node ? v : h('span', {}, v));

async function renderTotals() {
  const box = $('totals');
  const mine = ++seq;
  box.replaceChildren(row('Subtotal', 'Loading'));
  const ship = method() === 'ship';
  const dest = { country: $('country').value, region: $('region').value };
  try {
    const q = await quote({ items: getCart(), method: method(), country: ship ? dest.country : undefined, region: ship ? dest.region : undefined });
    if (mine !== seq) return;
    box.replaceChildren(
      row('Subtotal', money(q.subtotal)),
      row('Shipping', q.shipping === 0 ? 'Free' : money(q.shipping)),
      ...(q.taxTbd || !q.taxLines.length ? [row('Tax', h('span', { class: 'tbd' }, 'TBD'))] : q.taxLines.map((t) => row(t.name, money(t.cents)))),
      row('Total (CAD)', money(q.total) + (q.taxTbd ? ' + tax' : ''), 'total'));
  } catch {
    if (mine !== seq) return;
    box.replaceChildren(h('p', { class: 'unavail', role: 'status' }, 'Totals unavailable, try again. '),
      h('button', { type: 'button', class: 'linkbtn', onclick: renderTotals }, 'Retry'));
  }
}

function fieldErr(input, msg) {
  const err = input.closest('.field, .check')?.querySelector('.err');
  input.setAttribute('aria-invalid', String(Boolean(msg)));
  if (err) err.textContent = msg || '';
  return Boolean(msg);
}

function validate() {
  let first = null;
  const bad = (input, msg) => {
    if (fieldErr(input, msg) && !first) first = input;
  };
  const req = (id, msg) => bad($(id), $(id).value.trim() ? '' : msg);
  req('name', 'Enter your name.');
  bad($('email'), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim()) ? '' : 'Enter a valid email address.');
  if (method() === 'ship') {
    req('country', 'Select a country.');
    req('line1', 'Enter your street address.');
    req('city', 'Enter your city.');
    req('region', 'Select a ' + $('region-label').textContent.toLowerCase() + '.');
    const p = POSTAL[$('country').value];
    bad($('postal'), p && p.re.test($('postal').value.trim()) ? '' : p ? p.hint : 'Enter a postal code.');
  }
  bad($('terms'), $('terms').checked ? '' : 'Please agree to continue.');
  if (first) first.focus();
  return !first;
}

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = !msg;
}

function loadHelcim() {
  if (window.appendHelcimPayIframe) return Promise.resolve();
  return new Promise((resolveP, reject) => {
    const s = document.createElement('script');
    s.src = HELCIM_SRC;
    s.onload = resolveP;
    s.onerror = () => reject(new Error('payment script'));
    document.head.append(s);
  });
}

function openPayment({ orderId, checkoutToken }) {
  return new Promise((done) => {
    const name = 'helcim-pay-js-' + checkoutToken;
    const finish = (v) => {
      window.removeEventListener('message', onMsg);
      try { window.removeHelcimPayIframe(); } catch { /* already closed */ }
      done(v);
    };
    async function onMsg(e) {
      if (!/(^|\.)helcim\.app$/.test(new URL(e.origin).hostname)) return;
      const d = e.data;
      if (!d || d.eventName !== name) return;
      if (d.eventStatus === 'SUCCESS') {
        try {
          const { publicToken } = await confirmCheckout(orderId, d.eventMessage);
          finish({ ok: true, publicToken });
        } catch {
          finish({ ok: false, msg: 'Your payment may have gone through but we could not confirm it. Please contact us before trying again.' });
        }
      } else if (d.eventStatus === 'ABORTED') {
        finish({ ok: false, msg: 'The payment was declined. Please check your details and try again.' });
      } else if (d.eventStatus === 'HIDE') {
        finish({ ok: false, msg: '' });
      }
    }
    window.addEventListener('message', onMsg);
    window.appendHelcimPayIframe(checkoutToken);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (!getCart().length || !validate()) return;
  payBtn.disabled = true;
  payBtn.textContent = 'One moment';
  try {
    const ship = method() === 'ship';
    const address = ship
      ? { line1: $('line1').value.trim(), line2: $('line2').value.trim(), city: $('city').value.trim(), region: $('region').value, postalCode: $('postal').value.trim(), country: $('country').value }
      : undefined;
    if (ship) setDest({ country: address.country, region: address.region });
    const order = await createCheckout({
      items: getCart(),
      method: method(),
      contact: { name: $('name').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim() || undefined },
      address,
      agreed: true,
    });
    await loadHelcim();
    const res = await openPayment(order);
    if (res.ok) {
      clearCart();
      location.href = '/label/order/?t=' + encodeURIComponent(res.publicToken);
      return;
    }
    showError(res.msg);
  } catch (err) {
    showError(err.status === 400 ? 'Please check your details and try again.' : 'We could not start the payment, try again.');
  }
  payBtn.disabled = false;
  payBtn.textContent = 'Pay';
});

form.addEventListener('input', (e) => {
  if (e.target.getAttribute?.('aria-invalid') === 'true') fieldErr(e.target, '');
});
$('country').addEventListener('change', () => { syncRegions(); renderTotals(); });
$('region').addEventListener('change', renderTotals);

try {
  [catalog, config] = await Promise.all([loadCatalog(), loadShopConfig()]);
  dropUnknown((id) => resolve(id));
  if (!getCart().length) {
    $('checkout-main').hidden = true;
    $('empty').hidden = false;
  } else {
    setupCountry();
    setupDelivery();
    renderReview();
    renderTotals();
  }
} catch {
  showError('The page could not load, try again.');
}
