import { loadCatalog, loadConfig, quote, createCheckout, confirmCheckout, confirmDev, errorCopy } from './api.js';
import { getCart, clearCart, getDelivery, setDelivery, getDest, setDest, parseVariant, dropUnknown, removeItem } from './cart.js';
import { h, clear, money } from './dom.js';
import './site.js';

const HELCIM_SRC = 'https://secure.helcim.app/helcim-pay/services/start.js';
const POSTAL = {
  CA: { re: /^[A-Za-z]\d[A-Za-z][ ]?\d[A-Za-z]\d$/, label: 'Postal code', hint: 'Enter a valid postal code, like A1A 1A1.' },
  US: { re: /^\d{5}(-\d{4})?$/, label: 'ZIP code', hint: 'Enter a valid ZIP code, like 12345.' },
};
// Server issue paths mapped to our field ids.
const ISSUE_FIELD = {
  'contact.name': 'name', 'contact.email': 'email', 'contact.phone': 'phone',
  'shipAddress.line1': 'line1', 'shipAddress.line2': 'line2', 'shipAddress.city': 'city',
  'shipAddress.region': 'region', 'shipAddress.postalCode': 'postal', 'shipAddress.country': 'country', acceptTerms: 'terms',
};
const $ = (id) => document.getElementById(id);
const form = $('checkout-form');
const payBtn = $('pay-btn');
const errBox = $('form-error');
let catalog;
let config;
let seq = 0;
let locked = false; // payment may have been taken: never offer a second charge

function resolve(variantId) {
  const { productId, colourId, size } = parseVariant(variantId);
  const p = catalog.products.find((x) => x.id === productId && x.active);
  const c = p && p.colours.find((x) => x.id === colourId);
  return p && c && p.sizes.includes(size) ? { p, c, size } : null;
}

const method = () => form.elements.delivery.value;
const country = () => config.countries.find((c) => c.code === $('country').value);

function fillSelect(sel, pairs, placeholder) {
  sel.replaceChildren(h('option', { value: '' }, placeholder), ...pairs.map(([v, t]) => h('option', { value: v }, t)));
}

function setupCountry() {
  fillSelect($('country'), config.countries.map((c) => [c.code, c.label]), 'Select a country');
  const dest = getDest();
  $('country').value = config.countries.some((c) => c.code === dest.country) ? dest.country : config.countries[0].code;
  syncRegion();
  if (dest.region && $('region')) $('region').value = dest.region;
}

// Region is a select when the api gives a list, free text otherwise.
function syncRegion() {
  const c = country();
  const kind = c && c.code === 'US' ? 'State' : c && c.code === 'CA' ? 'Province' : 'Region';
  const control = c && c.regions
    ? h('select', { id: 'region', name: 'region', autocomplete: 'address-level1' })
    : h('input', { id: 'region', name: 'region', type: 'text', maxlength: '60', autocomplete: 'address-level1' });
  if (c && c.regions) fillSelect(control, c.regions.map((r) => [r.code, r.name]), 'Select a ' + kind.toLowerCase());
  $('region-field').replaceChildren(
    h('label', { for: 'region' }, h('span', { class: 'label' }, kind)), control, h('p', { class: 'err', role: 'alert' }));
  control.addEventListener('change', renderTotals);
  $('postal-label').textContent = (POSTAL[c && c.code] || POSTAL.CA).label;
}

function setupDelivery() {
  const opts = [['ship', 'Ship to ' + config.countries.map((c) => c.label).join(' or ')]];
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
  note.textContent = ship ? '' : 'Pickup details are emailed with your order confirmation.';
}

function renderReview() {
  const box = $('review');
  clear(box);
  for (const it of getCart()) {
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
  const c = ship ? country() : null;
  const region = c && $('region') && $('region').value ? $('region').value.trim() : undefined;
  try {
    const q = await quote({ items: getCart(), delivery: method(), country: c && c.code, region: c && c.regions ? region : undefined });
    if (mine !== seq) return;
    box.replaceChildren(
      row('Subtotal', money(q.subtotal)),
      row('Shipping', q.shipping === 0 ? 'Free' : money(q.shipping)),
      ...(q.taxTbd ? [row('Tax', h('span', { class: 'tbd' }, 'TBD'))] : q.taxLines.map((t) => row(t.name, money(t.cents)))),
      row('Total (CAD)', money(q.total) + (q.taxTbd ? ' + tax' : ''), 'total'));
  } catch (err) {
    if (mine !== seq) return;
    if (err.code === 'unavailable_item' && err.variantId) {
      removeItem(err.variantId);
      location.reload();
      return;
    }
    box.replaceChildren(h('p', { class: 'unavail', role: 'status' }, (err.code === 'network' ? 'Totals unavailable, try again.' : errorCopy(err)) + ' '),
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
  bad($('phone'), /^[0-9 +().-]{0,30}$/.test($('phone').value.trim()) ? '' : 'Use digits, spaces and + ( ) . - only.');
  if (method() === 'ship') {
    req('country', 'Select a country.');
    req('line1', 'Enter your street address.');
    req('city', 'Enter your city.');
    req('region', 'Enter your ' + (country()?.code === 'US' ? 'state' : country()?.code === 'CA' ? 'province' : 'region') + '.');
    const p = POSTAL[$('country').value];
    bad($('postal'), !p || p.re.test($('postal').value.trim()) ? ($('postal').value.trim() ? '' : 'Enter a postal code.') : p.hint);
  }
  bad($('terms'), $('terms').checked ? '' : 'Please agree to continue.');
  if (first) first.focus();
  return !first;
}

function showError(msg, withContact = false) {
  errBox.replaceChildren(msg);
  if (withContact && config.contactEmail) errBox.append(' ', h('a', { href: /^[^\s@]+@[^\s@]+$/.test(config.contactEmail) ? 'mailto:' + config.contactEmail : null }, config.contactEmail));
  errBox.hidden = !msg;
}

function showClosed() {
  payBtn.hidden = true;
  $('closed-note').hidden = false;
}

function applyIssues(err) {
  let first = null;
  for (const i of err.issues) {
    const el = $(ISSUE_FIELD[i.path]);
    if (el) { fieldErr(el, String(i.message)); first ||= el; }
  }
  first?.focus();
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Confirm once. verification_unavailable retries with backoff; payment_not_verified never does.
async function confirmWithRetry(fn) {
  const waits = [1500, 3000, 6000];
  for (let n = 0; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code !== 'verification_unavailable' || n >= waits.length) throw err;
      await sleep(waits[n]);
    }
  }
}

// Resolves {publicToken} or {error}. {cancelled:true} when the customer closes or declines.
function openPayment(order) {
  return new Promise((done) => {
    const name = 'helcim-pay-js-' + order.checkoutToken;
    const finish = (v) => {
      window.removeEventListener('message', onMsg);
      try { window.removeHelcimPayIframe(); } catch { /* already closed */ }
      done(v);
    };
    async function onMsg(e) {
      let host = '';
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)helcim\.app$/.test(host)) return;
      const d = e.data;
      if (!d || d.eventName !== name) return;
      if (d.eventStatus === 'SUCCESS') {
        window.removeEventListener('message', onMsg);
        try {
          const r = await confirmWithRetry(() => confirmCheckout({ orderId: order.orderId, checkoutToken: order.checkoutToken, eventMessage: d.eventMessage }));
          finish({ publicToken: r.publicToken });
        } catch (err) {
          finish({ error: err });
        }
      } else if (d.eventStatus === 'ABORTED') {
        finish({ cancelled: true, msg: 'The payment was declined. Please check your details and try again.' });
      } else if (d.eventStatus === 'HIDE') {
        finish({ cancelled: true, msg: '' });
      }
    }
    window.addEventListener('message', onMsg);
    window.appendHelcimPayIframe(order.checkoutToken, true);
  });
}

function addressFromForm() {
  const v = (id) => $(id).value.trim();
  const a = { name: v('name'), line1: v('line1'), city: v('city'), region: v('region'), postalCode: v('postal'), country: v('country') };
  if (v('line2')) a.line2 = v('line2');
  return a;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (locked || payBtn.hidden) return;
  showError('');
  if (!getCart().length || !validate()) return;
  payBtn.disabled = true;
  payBtn.textContent = 'One moment';
  try {
    const ship = method() === 'ship';
    const shipAddress = ship ? addressFromForm() : undefined;
    if (ship) setDest({ country: shipAddress.country, region: shipAddress.region });
    const order = await createCheckout({
      items: getCart(),
      delivery: method(),
      contact: { name: $('name').value.trim(), email: $('email').value.trim(), ...($('phone').value.trim() ? { phone: $('phone').value.trim() } : {}) },
      shipAddress,
    });
    let res;
    if (order.dev) {
      res = await confirmDev(order).then((r) => ({ publicToken: r.publicToken }), (error) => ({ error }));
    } else {
      await loadHelcim();
      res = await openPayment(order);
    }
    if (res.publicToken) {
      clearCart();
      location.href = '/label/order/?t=' + encodeURIComponent(res.publicToken);
      return;
    }
    if (res.error) throw res.error;
    showError(res.msg);
  } catch (err) {
    if (err.code === 'shop_closed') {
      showClosed();
      return;
    }
    const noRetry = ['payment_not_verified', 'verification_unavailable', 'payment_conflict', 'invalid_payment_response'].includes(err.code);
    showError(err.code ? errorCopy(err) : 'We could not start the payment, try again.', noRetry || err.code === 'network');
    if (err.code === 'invalid_request') applyIssues(err);
    if (noRetry) {
      locked = true;
      payBtn.textContent = 'Pay';
      return;
    }
    if (err.code === 'unavailable_item' && err.variantId) {
      removeItem(err.variantId);
      location.reload();
      return;
    }
  }
  payBtn.disabled = false;
  payBtn.textContent = 'Pay';
});

form.addEventListener('input', (e) => {
  if (e.target.getAttribute?.('aria-invalid') === 'true') fieldErr(e.target, '');
});
$('country').addEventListener('change', () => { syncRegion(); renderTotals(); });

try {
  [catalog, config] = await Promise.all([loadCatalog(), loadConfig()]);
  dropUnknown((id) => resolve(id));
  if (!getCart().length) {
    $('checkout-main').hidden = true;
    $('empty').hidden = false;
  } else if (!config.fromApi) {
    $('checkout-main').hidden = true;
    $('empty').querySelector('p').textContent = 'Checkout is unavailable right now, try again shortly.';
    $('empty').hidden = false;
  } else {
    setupCountry();
    setupDelivery();
    renderReview();
    renderTotals();
    if (!config.open) showClosed();
  }
} catch {
  showError('The page could not load, try again.');
}
