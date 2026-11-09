// Cart lives in localStorage as [{productId, variantId, qty}]. No prices stored.
const KEY = 'kalos-label-cart';
const DELIVERY = 'kalos-label-delivery';
const DEST = 'kalos-label-dest';

function read(k, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export function getCart() {
  const raw = read(KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i) => i && typeof i.productId === 'string' && typeof i.variantId === 'string' && Number.isInteger(i.qty) && i.qty > 0,
  );
}

function save(items) {
  write(KEY, items);
  document.dispatchEvent(new CustomEvent('cart:change'));
}

export const cartCount = () => getCart().reduce((n, i) => n + i.qty, 0);

export function addItem(productId, variantId, qty, max) {
  const items = getCart();
  const hit = items.find((i) => i.variantId === variantId);
  if (hit) hit.qty = Math.min(max, hit.qty + qty);
  else items.push({ productId, variantId, qty: Math.min(max, qty) });
  save(items);
}

export function setQty(variantId, qty, max) {
  const items = getCart()
    .map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(max, qty) } : i))
    .filter((i) => i.qty > 0);
  save(items);
}

export const removeItem = (variantId) => save(getCart().filter((i) => i.variantId !== variantId));
export const clearCart = () => save([]);
export const dropUnknown = (valid) => {
  const items = getCart();
  const kept = items.filter((i) => valid(i.variantId));
  if (kept.length !== items.length) save(kept);
  return items.length - kept.length;
};

export const getDelivery = () => (read(DELIVERY, 'ship') === 'pickup' ? 'pickup' : 'ship');
export const setDelivery = (m) => write(DELIVERY, m);
export const getDest = () => read(DEST, {}) || {};
export const setDest = (d) => write(DEST, d);

export function parseVariant(id) {
  const [productId, colourId, size] = id.split(':');
  return { productId, colourId, size };
}
