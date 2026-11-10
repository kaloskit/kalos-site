// Loaded on every label page: cart count in the nav and the footer contact line.
import { cartCount } from './cart.js';
import { loadConfig } from './api.js';

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
  loadConfig()
    .then((c) => {
      // Only a real address is shown; a placeholder or blank keeps the slot hidden.
      const email = String(c.contactEmail || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      const a = document.createElement('a');
      a.href = 'mailto:' + email;
      a.textContent = email;
      slot.replaceChildren(a);
      slot.hidden = false;
    })
    .catch(() => {});
}
