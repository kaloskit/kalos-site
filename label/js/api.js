// Every network call from the shop goes through this module.
import { API_BASE, API_PREFIX } from './config.js';

const STATIC_BASE = '/label/data/';

async function getStatic(file) {
  const res = await fetch(STATIC_BASE + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load ' + file);
  return res.json();
}

let catalogP;
let configP;
export const loadCatalog = () => (catalogP ||= getStatic('catalog.json'));
export const loadShopConfig = () => (configP ||= getStatic('shop-config.json'));

async function call(method, path, body) {
  const res = await fetch(API_BASE + API_PREFIX + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || 'Request failed');
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

const money = (v) => (typeof v === 'number' ? v : 0);

// Server totals, normalised. The browser never computes a payable amount.
export async function quote({ items, method, country, region }) {
  const d = await call('POST', '/quote', {
    items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
    delivery: { method, country: country || undefined, region: region || undefined },
  });
  return {
    subtotal: money(d.subtotalCents),
    shipping: money(d.shippingCents),
    taxLines: (d.taxLines || []).map((t) => ({ name: String(t.name), cents: money(t.cents) })),
    taxTbd: Boolean(d.taxTbd),
    total: money(d.totalCents),
  };
}

export async function createCheckout({ items, method, contact, address, agreed }) {
  const d = await call('POST', '/checkout', {
    items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
    delivery: { method },
    contact,
    shippingAddress: method === 'ship' ? address : undefined,
    agreedToTerms: agreed,
  });
  return { orderId: d.orderId, checkoutToken: d.checkoutToken };
}

export async function confirmCheckout(orderId, eventMessage) {
  const d = await call('POST', '/checkout/confirm', { orderId, eventMessage });
  return { publicToken: d.publicToken };
}

export async function getOrder(publicToken) {
  const d = await call('GET', '/orders/' + encodeURIComponent(publicToken));
  return {
    orderId: d.orderId,
    status: d.status,
    method: d.deliveryMethod,
    items: (d.items || []).map((i) => ({
      name: i.name,
      colour: i.colour,
      size: i.size,
      qty: i.qty,
      unit: money(i.unitCents),
    })),
    subtotal: money(d.subtotalCents),
    shipping: money(d.shippingCents),
    taxLines: (d.taxLines || []).map((t) => ({ name: String(t.name), cents: money(t.cents) })),
    total: money(d.totalCents),
  };
}
