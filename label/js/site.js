// Loaded on every label page: cart count in the nav and the footer contact line.
import { cartCount } from './cart.js';
import { loadShopConfig } from './api.js';

function paintCount() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = String(cartCount());
  });
}
paintCount();
document.addEventListener('cart:change', paintCount);
addEventListener('storage', paintCount);
addEventListener('pageshow', paintCount);

const slot = document.querySelector('[data-contact]');
if (slot) {
  loadShopConfig()
    .then((c) => {
      const email = String(c.contact_email || '');
      if (!email) return;
      if (/^[^\s@]+@[^\s@]+$/.test(email)) {
        const a = document.createElement('a');
        a.href = 'mailto:' + email;
        a.textContent = email;
        slot.replaceChildren(a);
      } else {
        slot.textContent = email;
      }
      slot.hidden = false;
    })
    .catch(() => {});
}
