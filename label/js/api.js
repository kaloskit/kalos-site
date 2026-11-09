// Every network call from the shop goes through this module.
// Contract: apps/api/src/routes/label/README.md in the studio api.
import { API_BASE, API_PREFIX } from './config.js';

const STATIC_BASE = '/label/data/';

async function getStatic(file) {
  const res = await fetch(STATIC_BASE + file, { cache: 'no-cache', credentials: 'omit' });
  if (!res.ok) throw new Error('Could not load ' + file);
  return res.json();
}

let catalogP;
let configP;
export const loadCatalog = () => (catalogP ||= getStatic('catalog.json'));

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'Request failed');
    this.status = status;
    this.code = (body && body.code) || (status === 0 ? 'network' : 'unknown');
    this.variantId = body && body.variantId;
    this.issues = (body && Array.isArray(body.issues) && body.issues) || [];
  }
}

// Customer copy per error code. Server text is never shown directly.
const COPY = {
  network: 'We could not reach the shop, try again.',
  invalid_request: 'Please check your details and try again.',
  empty_cart: 'Your cart is empty.',
  invalid_quantity: 'Please check the quantity for each item.',
  too_many_items: 'Your cart has too many different items.',
  unavailable_item: 'One of the items in your cart is no longer available.',
  country_not_supported: 'We do not ship to that country.',
  invalid_region: 'Please choose a valid province or state.',
  pickup_unavailable: 'Pickup is not available right now.',
  shipping_unavailable: 'Shipping is not available right now.',
  shop_closed: 'The shop is not open yet.',
  invalid_postal_code: 'Enter a valid postal or ZIP code.',
  incomplete_address: 'Please complete your shipping address.',
  payment_unavailable: 'Payment is not available right now. Please try again shortly.',
  invalid_payment_response: 'We could not read the payment response. Please contact us.',
  order_not_found: 'We could not find that order.',
  order_cancelled: 'This order was cancelled.',
  checkout_not_started: 'Please start checkout again.',
  payment_not_verified: 'We could not verify your payment. Please contact us before trying again.',
  verification_unavailable: 'We could not confirm your payment yet. If you were charged, we will email you shortly.',
  payment_conflict: 'This payment is already linked to another order. Please contact us.',
};
export const errorCopy = (err) => COPY[err && err.code] || 'Something went wrong, try again.';

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + API_PREFIX + path, {
      method,
      credentials: 'omit',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, null);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non JSON body */
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// GET /config. Falls back to the static copy (display facts only) when the api is down,
// flagged with `fromApi: false` so checkout can refuse to proceed.
export function loadConfig() {
  return (configP ||= call('GET', '/config')
    .then((d) => ({
      fromApi: true,
      open: Boolean(d.open),
      countries: (d.countries || []).map((c) => ({ code: c.code, label: c.label, rateCents: c.rateCents, regions: c.regions || null })),
      pickup: { enabled: Boolean(d.pickup && d.pickup.enabled), label: (d.pickup && d.pickup.label) || 'Pickup', rateCents: (d.pickup && d.pickup.rateCents) || 0 },
      maxQty: d.maxQtyPerLine || 5,
      contactEmail: d.contactEmail || '',
    }))
    .catch(async () => {
      const s = await getStatic('shop-config.json');
      return {
        fromApi: false,
        open: false,
        countries: Object.entries(s.shipping.countries).map(([code, c]) => ({ code, label: c.label, rateCents: c.rate_cents, regions: null })),
        pickup: { enabled: Boolean(s.pickup.enabled), label: s.pickup.label, rateCents: s.pickup.rate_cents },
        maxQty: s.max_qty_per_line || 5,
        contactEmail: s.contact_email || '',
      };
    }));
}

const lines = (items) => items.map((i) => ({ variantId: i.variantId, qty: i.qty }));
const cents = (v) => (typeof v === 'number' ? v : 0);

// Server totals. The browser never computes a payable amount.
export async function quote({ items, delivery, country, region }) {
  const d = await call('POST', '/quote', { lines: lines(items), delivery, country: country || undefined, region: region || undefined });
  const tbd = d.tax === 'TBD' || !Array.isArray(d.tax);
  return {
    subtotal: cents(d.subtotalCents),
    shipping: cents(d.shippingCents),
    taxTbd: tbd,
    taxLines: tbd ? [] : d.tax.map((t) => ({ name: String(t.name), cents: cents(t.cents) })),
    total: cents(d.totalCents),
    final: Boolean(d.final),
  };
}

export async function createCheckout({ items, delivery, contact, shipAddress }) {
  const d = await call('POST', '/checkout', {
    lines: lines(items),
    delivery,
    contact,
    shipAddress: delivery === 'ship' ? shipAddress : undefined,
    acceptTerms: true,
  });
  return { orderId: d.orderId, checkoutToken: d.checkoutToken, dev: d.dev === true };
}

// Body is built exactly as README: transaction object as text, plus the hash.
export async function confirmCheckout({ orderId, checkoutToken, eventMessage }) {
  const raw = eventMessage;
  const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const wrapper = msg.data ?? msg;
  const txn = wrapper.data ?? wrapper;
  const d = await call('POST', '/checkout/confirm', {
    orderId,
    checkoutToken,
    rawDataResponse: JSON.stringify(txn),
    hash: wrapper.hash ?? msg.hash,
  });
  return { orderId: d.orderId, publicToken: d.publicToken, status: d.status };
}

// Local dev api with no Helcim token (create response has dev: true).
export async function confirmDev({ orderId, checkoutToken }) {
  const d = await call('POST', '/checkout/confirm', {
    orderId,
    checkoutToken,
    rawDataResponse: '{"transactionId":"dev1"}',
    hash: 'dev',
  });
  return { orderId: d.orderId, publicToken: d.publicToken, status: d.status };
}

export async function getOrder(publicToken) {
  const d = await call('GET', '/orders/' + encodeURIComponent(publicToken));
  const tbd = d.taxStatus === 'TBD';
  return {
    orderId: d.orderId,
    status: d.status,
    method: d.deliveryMethod,
    items: (d.items || []).map((i) => ({ name: i.name, colour: i.colour, size: i.size, qty: i.qty, line: cents(i.lineCents) })),
    subtotal: cents(d.subtotalCents),
    shipping: cents(d.shippingCents),
    taxLines: tbd ? [] : (d.taxLines || []).map((t) => ({ name: String(t.name), cents: cents(t.cents) })),
    total: cents(d.totalCents),
    pickupInstructions: d.pickupInstructions || '',
    estimatedDelivery: d.estimatedDelivery || '',
  };
}
