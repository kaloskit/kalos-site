import { getOrder, loadShopConfig } from './api.js';
import { h, money } from './dom.js';
import './site.js';

const box = document.getElementById('order');
const token = new URLSearchParams(location.search).get('t');
const row = (l, v, cls = '') => h('div', { class: 'r ' + cls }, h('span', {}, l), h('span', {}, v));

async function render() {
  if (!token) {
    box.replaceChildren(h('p', {}, 'We could not find that order.'));
    return;
  }
  try {
    const [o, config] = await Promise.all([getOrder(token), loadShopConfig()]);
    const pickup = o.method === 'pickup';
    box.replaceChildren(
      h('p', { class: 'kicker' }, 'Thank you'),
      h('h1', { class: 'page-h1' }, 'Order received'),
      h('p', { class: 'label' }, 'Order number'),
      h('p', { class: 'ordno' }, o.orderId),
      h('div', { class: 'review' }, o.items.map((i) =>
        h('div', { class: 'line' }, h('span'), h('div', {}, h('h3', {}, i.name), h('p', { class: 'meta' }, `${i.colour} · ${i.size} · Qty ${i.qty}`)), h('div', { class: 'amt' }, money(i.unit * i.qty))))),
      h('div', { class: 'summary' },
        row('Delivery', pickup ? config.pickup.label : 'Shipped to you'),
        row('Subtotal', money(o.subtotal)),
        row('Shipping', o.shipping === 0 ? 'Free' : money(o.shipping)),
        ...o.taxLines.map((t) => row(t.name, money(t.cents))),
        row('Total (CAD)', money(o.total), 'total')),
      h('h2', {}, 'What happens next'),
      h('p', {}, pickup ? config.pickup.instructions : 'Made to order. We will email you when it ships.'),
      h('p', {}, h('a', { class: 'btn inline', href: '/label/shop/' }, 'Keep looking')));
  } catch {
    box.replaceChildren(h('p', { role: 'status' }, 'We could not load this order right now. Your confirmation email has the details.'));
  }
}
render();
