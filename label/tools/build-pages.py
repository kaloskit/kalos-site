#!/usr/bin/env python3
"""Optional dev helper. Pre-renders the shop, product, cart, checkout, order and
policy pages from label/data/catalog.json. Run from anywhere: python3 label/tools/build-pages.py
The output is plain static HTML that is committed; nothing runs at deploy time."""
import json, subprocess
from html import escape as e
from pathlib import Path

L = Path(__file__).resolve().parent.parent
cat = json.loads((L / 'data/catalog.json').read_text())

API = "https://api.kalospt.ca http://localhost:* http://127.0.0.1:*"
def csp(checkout=False):
    h = " https://secure.helcim.app" if checkout else ""
    return ("default-src 'none'; script-src 'self'%s; style-src 'self'; img-src 'self' data:; "
            "connect-src 'self' %s%s; frame-src%s; base-uri 'none'; form-action 'self'") % (h, API, h, h if checkout else " 'none'")

def money(c): return 'CA$%d' % (c / 100) if c % 100 == 0 else 'CA$%.2f' % (c / 100)

def dims(src):
    out = subprocess.check_output(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(L / src)]).decode()
    v = [int(x.split()[-1]) for x in out.splitlines() if 'pixel' in x]
    return v[0], v[1]

def sym(id, vb, cls_label):
    return '<svg %s focusable="false" viewBox="%s"><use href="/label/assets/sprite.svg#%s"/></svg>' % (cls_label, vb, id)
WM = lambda: sym('wordmark', '0 0 4590.6 676.8', 'role="img" aria-label="KALOS"')
APEX = lambda: sym('apex', '0 0 212 400', 'role="img" aria-label="KALOS tri apex"')

def head(title, desc, checkout=False):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="strict-origin">
<meta http-equiv="Content-Security-Policy" content="{csp(checkout)}">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="icon" href="/label/favicon.ico" sizes="any">
<link rel="icon" href="/label/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/label/apple-touch-icon.png">
<link rel="stylesheet" href="/label/label.css">
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><a href="/label/" class="wm" aria-label="KALOS, back to the story">{WM()}</a>
<nav aria-label="Main"><ul><li><a href="/label/">Story</a></li><li><a href="/label/shop/"{{shop}}>Shop</a></li><li><a href="/label/cart/"{{cart}}>Cart (<span data-cart-count>0</span>)</a></li></ul></nav></header>
<main id="main">
'''

FOOT = f'''</main>
<div class="wrap"><footer><a class="wm" href="/label/" aria-label="KALOS">{WM()}</a>
<ul><li><a href="/label/policies/shipping/">Shipping</a></li><li><a href="/label/policies/returns/">Returns</a></li><li><a href="/label/policies/privacy/">Privacy</a></li><li><a href="/label/policies/terms/">Terms</a></li></ul>
<div class="foot-r"><p data-contact hidden></p><p>Clothing as human expression.</p></div></footer></div>
'''

def page(path, title, desc, body, script=None, nav=None, checkout=False):
    cur = ' aria-current="page"'
    h = head(title, desc, checkout).replace('{shop}', cur if nav == 'shop' else '').replace('{cart}', cur if nav == 'cart' else '')
    s = f'<script type="module" src="/label/js/{script}"></script>\n' if script else '<script type="module" src="/label/js/site.js"></script>\n'
    out = L / path / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(h + body + FOOT + s + '</body></html>\n')

def img(src, alt, label, first=False, lazy=True):
    w, h = dims(src)
    attrs = ' loading="lazy" decoding="async"' if lazy else ' fetchpriority="high"'
    return (f'<div class="frame"><img src="/label/{e(src)}" alt="{e(alt)}" width="{w}" height="{h}"'
            f'{attrs}><span class="tag">{e(label)}</span></div>')

def sw(c): return f'<span class="sw sw-{c["swatch"].lstrip("#").lower()}" aria-hidden="true"></span>'

META = {
    'first-zip-hoodie': 'Full zip · Heavyweight fleece · XS to XL',
    'made-hood': 'Pullover · 500 GSM French terry · S to XL',
}
SHIPNOTE = 'Free shipping to Canada and the US. Free pickup also available at checkout.'

def tbd(t): return f'<span class="tbd">[KIT TO DECIDE: {e(t)}]</span>'

# shop
cards = ''
for p in [x for x in cat['products'] if x['active']]:
    c0 = p['colours'][0]; i0 = c0['images'][0]
    if p['id'] == 'made-hood': i0 = c0['images'][2]
    cards += f'''<a class="card" href="/label/shop/{p['id']}/">{img(i0['src'], i0['alt'], i0['label'], lazy=p is not cat['products'][0])}
<div class="row"><h2>{e(p['name'])}</h2><span class="price">{money(p['price_cents'])}</span></div>
<p class="meta">{e(META.get(p['id'], ''))}</p><div class="swatches">{''.join(sw(c) for c in p['colours'])}</div></a>
'''
page('shop', 'KALOS · Shop', 'The KALOS label shop. One upward mark, repeated. Made to order.', f'''<div class="wrap">
<div class="shop-head"><div><p class="kicker">The label</p><h1>Shop</h1><p class="sub">One upward mark, repeated. Made to order.</p></div><div class="apex">{APEX()}</div></div>
<div class="grid">
{cards}</div></div>
''', nav='shop')

# products
for p in [x for x in cat['products'] if x['active']]:
    cols = p['colours']
    galleries = ''
    for n, c in enumerate(cols):
        fr = ''.join(img(i['src'], i['alt'], i['label'], lazy=(k > 0 or n > 0)) for k, i in enumerate(c['images']))
        galleries += f'<div class="gallery" data-gallery="{c["id"]}"{"" if n == 0 else " hidden"} aria-label="{e(p["name"])} images, {e(c["name"])}">{fr}</div>\n'
    chips_col = ''.join(f'<button type="button" class="chip colour" data-colour-chip="{c["id"]}" data-colour-name="{e(c["name"])}" aria-pressed="false">{sw(c)}{e(c["name"])}</button>' for c in cols)
    chips_size = ''.join(f'<button type="button" class="chip" data-size-chip="{s}" aria-pressed="false">{s}</button>' for s in p['sizes'])
    sc = p['size_chart']
    if sc:
        th = ''.join(f'<th>{e(c)} ({e(sc["unit"])})</th>' for c in sc['columns'])
        tr = ''.join(f'<tr><td>{e(s)}</td>' + ''.join(f'<td>{v}</td>' for v in vals) + '</tr>' for s, vals in sc['rows'].items())
        guide = f'<table><thead><tr><th>Size</th>{th}</tr></thead><tbody>{tr}</tbody></table>' + (f'<p class="note">{e(sc["note"])}</p>' if sc.get('note') else '')
    else:
        guide = '<p>Size guide coming soon.</p>'
    care = p['care']
    care_html = f'<p>{tbd("confirm care from the AS Colour 5151 label")}</p>' if care.startswith('[KIT TO CONFIRM') else f'<p>{e(care)}</p>'
    name_br = e(p['name']).replace(' ', '<br>', 1) if p['id'] == 'first-zip-hoodie' else e(p['name']).replace(' ', '<br>', 1)
    accs = f'''<details open><summary>Details</summary><ul>{''.join(f'<li>{e(d)}</li>' for d in p['details'])}</ul></details>
<details><summary>Fabric and fit</summary><p>{e(p['fabric'])}</p></details>
<details id="size-guide"><summary>Size guide</summary>{guide}</details>
<details><summary>Care</summary>{care_html}</details>
<details><summary>Shipping and returns</summary><p>Free shipping to Canada and the US, or free pickup. Made to order. {tbd("production time and returns window")}</p><p><a href="/label/policies/shipping/">Shipping</a> and <a href="/label/policies/returns/">Returns</a></p></details>'''
    body = f'''<div class="wrap">
<p class="crumbs"><a href="/label/shop/">Shop</a> / {e(p['name'])}</p>
<div class="pdp" data-product="{p['id']}">
<div>
{galleries}</div>
<div class="buy">
<p class="kicker">{e(p['kicker'])}</p>
<h1>{name_br}</h1>
<span class="price">{money(p['price_cents'])}</span>
<p class="lede">{e(p['lede'])}</p>
<fieldset class="opt"><legend class="label"><span>Colour · <span data-colour-name>Choose a colour</span></span></legend>
<div class="chips">{chips_col}</div></fieldset>
<fieldset class="opt"><legend class="label"><span>Size</span><a href="#size-guide" data-open-guide>Size guide</a></legend>
<div class="chips">{chips_size}</div></fieldset>
<button type="button" class="btn" data-add disabled>Add to cart</button>
<p class="status" role="status" data-status></p>
<p class="note" id="pick-hint">{SHIPNOTE}</p>
<div class="accs">
{accs}
</div></div></div></div>
<div class="light band"><div class="wrap"><div class="apex">{APEX()}</div><h2>Repetition<br>builds form.</h2></div></div>
'''
    body = body.replace('<div class="pdp" data-product', '<div class="pdp" data-product')
    page(f'shop/{p["id"]}', f'KALOS · {p["name"]}', f'{p["name"]}. {p["lede"]}', body, script='product.js', nav='shop')

# cart
page('cart', 'KALOS · Cart', 'Your KALOS cart.', f'''<div class="wrap"><div class="cart-wrap">
<div><p class="kicker">Your cart</p><h1 class="page-h1">Cart</h1>
<div id="lines"><p>Loading</p></div>
<p class="note">Images are concept imagery until product photos are ready.</p></div>
<aside class="summary" aria-label="Order summary"><p class="kicker">Summary</p>
<div id="summary-body"></div>
<a class="btn" id="checkout-btn" href="/label/checkout/" aria-disabled="true">Checkout</a>
<a class="btn ghost" href="/label/shop/">Keep looking</a>
<p class="pay">Secure payment by Helcim</p></aside></div></div>
''', script='cart-page.js', nav='cart')

# checkout
def field(id, label, typ='text', extra='', autoc=''):
    ac = ' autocomplete="%s"' % autoc if autoc else ''
    return f'<div class="field"><label for="{id}"><span class="label">{label}</span></label><input id="{id}" name="{id}" type="{typ}" {extra}{ac}><p class="err" role="alert"></p></div>'
def sel(id, label, autoc):
    return f'<div class="field"><label for="{id}"><span class="label" id="{id}-label">{label}</span></label><select id="{id}" name="{id}" autocomplete="{autoc}"></select><p class="err" role="alert"></p></div>'
page('checkout', 'KALOS · Checkout', 'Checkout.', f'''<div class="wrap"><div id="empty" class="doc" hidden><h1 class="page-h1">Checkout</h1><p>Your cart is empty.</p><p><a class="btn inline" href="/label/shop/">Shop</a></p></div>
<div class="cart-wrap" id="checkout-main">
<div><p class="kicker">Checkout</p><h1 class="page-h1">Checkout</h1>
<form id="checkout-form" class="form" novalidate>
<fieldset><legend>Contact</legend>
{field('name', 'Name', extra='required', autoc='name')}
{field('email', 'Email', 'email', 'required', 'email')}
{field('phone', 'Phone (optional)', 'tel', autoc='tel')}</fieldset>
<fieldset><legend>Delivery</legend><div id="delivery-opts"></div><p class="note" id="pickup-note" hidden></p></fieldset>
<fieldset id="ship-fields"><legend>Shipping address</legend>
{sel('country', 'Country', 'country')}
{field('line1', 'Street address', autoc='address-line1')}
{field('line2', 'Apartment, suite, unit (optional)', autoc='address-line2')}
<div class="two">{field('city', 'City', autoc='address-level2')}{sel('region', 'Province', 'address-level1')}</div>
{field('postal', 'Postal code', autoc='postal-code').replace('<span class="label">Postal code</span>', '<span class="label" id="postal-label">Postal code</span>')}</fieldset>
<fieldset><legend>Agreement</legend>
<div class="check"><input type="checkbox" id="terms" name="terms"><label for="terms">I agree to the <a href="/label/policies/terms/" target="_blank" rel="noopener">Terms</a> and the <a href="/label/policies/returns/" target="_blank" rel="noopener">Returns policy</a>.</label><p class="err" role="alert"></p></div></fieldset>
<p class="errbox" id="form-error" role="alert" hidden></p>
<button type="submit" class="btn" id="pay-btn">Pay</button>
<p class="pay">Secure payment by Helcim</p>
</form></div>
<aside class="summary review" aria-label="Order review"><p class="kicker">Your order</p>
<div id="review"></div><div class="sums" id="totals"></div>
<a class="btn ghost" href="/label/cart/">Edit cart</a></aside></div></div>
''', script='checkout.js', checkout=True)

# order
page('order', 'KALOS · Order', 'Your KALOS order.', '<div class="wrap"><div class="doc" id="order"><p>Loading</p></div></div>\n', script='order.js')

# policies
POL = {
 'shipping': ('Shipping', ['Shipping destinations, free shipping to Canada and the US, and pickup', 'Production and delivery time estimates', 'Duties and import taxes for US orders']),
 'returns': ('Returns', ['Returns and exchanges for made to order items', 'Return window and condition', 'What happens with defects and sizing exchanges']),
 'privacy': ('Privacy', ['What personal information the shop collects and why', 'Who it is shared with (payment, fulfilment, email)', 'How long it is kept and how to ask for removal']),
 'terms': ('Terms', ['Terms of sale', 'Pricing, payment and taxes', 'Contact details and governing terms']),
}
for slug, (t, items) in POL.items():
    blocks = ''.join(f'<div class="placeholder">[KIT TO DECIDE: {e(i)}]</div>\n' for i in items)
    page(f'policies/{slug}', f'KALOS · {t}', f'KALOS label {t.lower()} policy.', f'''<div class="wrap"><div class="doc"><p class="kicker">The label</p><h1 class="page-h1">{t}</h1>
<p>This page is a placeholder. The wording below is not final.</p>
{blocks}</div></div>
''')
print('built')
