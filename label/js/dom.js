// Tiny element builder. Text always goes through textContent.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => el.replaceChildren();

export function money(cents) {
  const v = cents / 100;
  return '$' + v.toFixed(2) + ' CAD';
}

export function swatch(hex) {
  const el = h('span', { class: 'sw sw-' + hex.replace('#', '').toLowerCase(), 'aria-hidden': 'true' });
  el.style.background = hex;
  return el;
}
