import { getOrder, errorCopy } from './api.js';
import { h, money } from './dom.js';
import './site.js';

const box = document.getElementById('order');
const token = new URLSearchParams(location.search).get('t');
const row = (l, v, cls = '') => h('div', { class: 'r ' + cls }, h('span', {}, l), h('span', {}, v));

function nextSteps(o) {
  const pickup = o.method === 'pickup';
  const out = [];
  switch (o.status) {
    case 'processed':
      out.push(o.estimatedDelivery ? 'Your order is being made. Estimated ' + (pickup ? 'ready' : 'delivery') + ': ' + o.estimatedDelivery + '.' : 'Your order is being made.');
      break;
    case 'shipped':
      out.push('Your order has shipped. Tracking details are in your email.');
      break;
    case 'pickup_ready':
      out.push('Your order is ready for pickup.');
      break;
    case 'picked_up':
      out.push('Your order has been picked up. Thank you.');
      break;
    case 'cancelled':
      out.push('This order was cancelled.');
      break;
    case 'refunded':
      out.push('This order was refunded.');
      break;
    default:
      out.push('Made to order. We will email you when your order has been processed.');
  }
  return out;
}

async function render() {
  if (!token) {
    box.replaceChildren(h('p', {}, errorCopy({ code: 'order_not_found' })));
    return;
  }
  try {
    const o = await getOrder(token);
    const pickup = o.method === 'pickup';
    box.replaceChildren(
      h('p', { class: 'kicker' }, 'Thank you'),
      h('h1', { class: 'page-h1' }, 'Order received'),
      h('p', { class: 'label' }, 'Order number'),
      h('p', { class: 'ordno' }, o.orderId),
      h('div', { class: 'review order-lines' }, o.items.map((i) =>
        h('div', { class: 'line' }, h('div', {}, h('h3', {}, i.name), h('p', { class: 'meta' }, `${i.colour} · ${i.size} · Qty ${i.qty}`)), h('div', { class: 'amt' }, money(i.line))))),
      h('div', { class: 'summary' },
        row('Delivery', pickup ? 'Pickup' : 'Shipped to you'),
        row('Subtotal', money(o.subtotal)),
        row('Shipping', o.shipping === 0 ? 'Free' : money(o.shipping)),
        ...o.taxLines.map((t) => row(t.name, money(t.cents))),
        row('Total', money(o.total), 'total')),
      h('h2', {}, 'What happens next'),
      ...nextSteps(o).map((t) => h('p', {}, t)),
      ...(pickup && o.pickupInstructions ? [h('p', { class: 'label' }, 'Pickup'), h('p', { class: 'pickup' }, o.pickupInstructions)] : []),
      h('p', {}, h('a', { class: 'btn inline', href: '/label/shop/' }, 'Keep looking')));
  } catch (err) {
    box.replaceChildren(h('p', { role: 'status' }, err.code === 'order_not_found' ? errorCopy(err) : 'We could not load this order right now. Your confirmation email has the details.'));
  }
}
render();
