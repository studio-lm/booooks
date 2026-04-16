    const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
    function dayOfYear(d) { const s = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.floor((d - s) / 86400000) + 1; }
    function guessCoordsFromTimeZone() {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const offset = -new Date().getTimezoneOffset() / 60;
      const lon = offset * 15;
      let lat = 50;
      return { lat, lon, tz };
    }
    function solarPosition(date, lat, lon) {
      const d = new Date(date), doy = dayOfYear(d), h = d.getUTCHours() + d.getUTCMinutes() / 60;
      const g = 2 * Math.PI / 365 * (doy - 1 + (h - 12) / 24);
      const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g);
      const tz = -date.getTimezoneOffset() / 60;
      const m = d.getHours() * 60 + d.getMinutes();
      const EoT = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g));
      const timeOffset = EoT + 4 * lon - 60 * tz;
      let tst = (m + timeOffset) % 1440;
      let ha = tst / 4 - 180; if (ha < -180) ha += 360;
      const latr = toRad(lat), har = toRad(ha);
      const sinE = Math.sin(latr) * Math.sin(decl) + Math.cos(latr) * Math.cos(decl) * Math.cos(har);
      const elev = Math.asin(sinE);
      const az = Math.atan2(Math.sin(har), Math.cos(har) * Math.sin(latr) - Math.tan(decl) * Math.cos(latr));
      return { azimuth: (toDeg(az) + 180) % 360, elevation: toDeg(elev) };
    }
    function setShadowFromAngle(aDeg) {
      const root = document.documentElement;
      const distStr = getComputedStyle(root).getPropertyValue('--shadow-distance').trim();
      const dist = parseFloat(distStr) || 20;
      const a = toRad((aDeg + 180) % 360);
      root.style.setProperty('--shadow-x', `${Math.cos(a) * dist}px`);
      root.style.setProperty('--shadow-y', `${Math.sin(a) * dist}px`);
    }
    const COORDS = guessCoordsFromTimeZone();
    function updateSun() {
      const now = new Date();
      const pos = solarPosition(now, COORDS.lat, COORDS.lon);
      setShadowFromAngle(pos.azimuth);

      const body = document.body;
      if (pos.elevation <= 0) {
        body.classList.add('dark');
      } else {
        body.classList.remove('dark');
      }
    }

    updateSun();
    setInterval(updateSun, 60000);

    const cart = {};
    const STORAGE_KEY = 'toolsbooks_cart_v1';
    const CART_TTL_MS = 24 * 60 * 60 * 1000; // 24h

    function getSelectedShipping() {
      const chk = Array.from(document.querySelectorAll('.shipping-checkbox')).find(c => c.checked);
      return chk ? Number(chk.value) : null;
    }
    function setSelectedShipping(value) {
      const boxes = document.querySelectorAll('.shipping-checkbox');
      let found = false;
      boxes.forEach(b => {
        b.checked = (Number(b.value) === Number(value));
        if (b.checked) found = true;
      });
      const orderButton = document.getElementById('order-button');
      if (found) {
        orderButton.disabled = false;
        orderButton.style.color = "#0C0";
        orderButton.style.cursor = "pointer";
      } else {
        orderButton.disabled = true;
        orderButton.style.color = "";
        orderButton.style.cursor = "default";
      }
    }

    function persistCart() {
      try {
        const payload = {
          cart,
          shipping: getSelectedShipping(),
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn('Persisting cart failed:', e);
      }
    }

    function restoreCart() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return false;
        const age = Date.now() - (data.savedAt || 0);
        if (age > CART_TTL_MS) {
          localStorage.removeItem(STORAGE_KEY);
          return false;
        }
        if (data.cart && typeof data.cart === 'object') {
          for (const id in data.cart) {
            cart[id] = Number(data.cart[id]) || 0;
          }
        }
        if (data.shipping != null) setSelectedShipping(data.shipping);
        return true;
      } catch (e) {
        console.warn('Restoring cart failed:', e);
        return false;
      }
    }

    function clearCartStorage() {
      try { localStorage.removeItem(STORAGE_KEY); } catch { }
    }

    function updateCartWidget() {
      const cartSummary = document.querySelector('#cart-widget .cart-summary');
      let totalCount = 0;
      let totalPrice = 0;
      for (let id in cart) {
        const qty = Number(cart[id]) || 0;
        if (qty <= 0) continue;
        totalCount += qty;
        const productElem = document.querySelector('.product[data-id="' + id + '"]');
        if (!productElem) continue;
        const price = parseFloat(productElem.getAttribute('data-price')) || 0;
        totalPrice += qty * price;
      }

      let shippingFee = 0;
      document.querySelectorAll('.shipping-checkbox').forEach(chk => {
        if (chk.checked) {
          shippingFee = parseFloat(chk.value) || 0;
        }
      });
      totalPrice += shippingFee;
      cartSummary.textContent = totalCount === 0
        ? 'Cart'
        : `€${totalPrice.toFixed(2)}`;
    }

    function updateProductButton(productElem, quantity) {
      const btn = productElem.querySelector('.cart-btn');
      if (!btn || btn.classList.contains('cart-btn--disabled')) return;
      if (quantity > 0) {
        btn.innerHTML = `<span class="minus">–</span> ${quantity} <span class="plus">+</span>`;
      } else {
        btn.textContent = 'Add to Cart';
      }
    }

    document.getElementById('order-button').addEventListener('click', function () {
      const btn = this;
      if (btn.disabled) return;
      btn.textContent = "Processing…";
      btn.disabled = true;
      btn.style.color = "#999";
      btn.style.cursor = "default";

      buildPaypalForm();
      clearCartStorage();
      setTimeout(() => {
        document.getElementById('paypal-form').submit();
      }, 300);
    });

    function buildPaypalForm() {
      const form = document.getElementById('paypal-form');
      const productInputs = form.querySelectorAll('.product-input');
      productInputs.forEach(input => input.remove());
      let index = 1;
      for (let id in cart) {
        if (cart[id] > 0) {
          const productElem = document.querySelector('.product[data-id="' + id + '"]');
          if (!productElem) continue;
          const h3 = productElem.querySelector('h3');
          const productName = h3 ? h3.innerText : `Item ${id}`;
          const price = parseFloat(productElem.getAttribute('data-price')) || 0;
          const itemNameInput = document.createElement('input');
          itemNameInput.type = 'hidden';
          itemNameInput.name = 'item_name_' + index;
          itemNameInput.value = productName;
          itemNameInput.classList.add('product-input');
          form.appendChild(itemNameInput);
          const amountInput = document.createElement('input');
          amountInput.type = 'hidden';
          amountInput.name = 'amount_' + index;
          amountInput.value = price.toFixed(2);
          amountInput.classList.add('product-input');
          form.appendChild(amountInput);
          const quantityInput = document.createElement('input');
          quantityInput.type = 'hidden';
          quantityInput.name = 'quantity_' + index;
          quantityInput.value = cart[id];
          quantityInput.classList.add('product-input');
          form.appendChild(quantityInput);
          index++;
        }
      }

      const shippingCheckboxes = document.querySelectorAll('.shipping-checkbox');
      let shippingFee = 0;
      shippingCheckboxes.forEach(chk => {
        if (chk.checked) {
          shippingFee = parseFloat(chk.value) || 0;
        }
      });
      if (shippingFee > 0) {
        const shippingInput = document.createElement('input');
        shippingInput.type = 'hidden';
        shippingInput.name = 'shipping_cart';
        shippingInput.value = shippingFee.toFixed(2);
        shippingInput.classList.add('product-input');
        form.appendChild(shippingInput);
      }
    }

    document.querySelectorAll('.shipping-checkbox').forEach(chk => {
      chk.addEventListener('change', function () {
        if (this.checked) {
          document.querySelectorAll('.shipping-checkbox').forEach(otherChk => {
            if (otherChk !== this) otherChk.checked = false;
          });
        } else {
          this.checked = false;
        }

        const anyChecked = Array.from(document.querySelectorAll('.shipping-checkbox'))
          .some(cb => cb.checked);

        const orderButton = document.getElementById('order-button');
        if (anyChecked) {
          orderButton.disabled = false;
          orderButton.style.color = "#0C0";
          orderButton.style.cursor = "pointer";
        } else {
          orderButton.disabled = true;
          orderButton.style.color = "";
          orderButton.style.cursor = "default";
        }

        updateCartWidget();
        persistCart();
      });
    });

    document.querySelectorAll('.product[data-id]').forEach(product => {
      const id = product.getAttribute('data-id');
      cart[id] = cart[id] || 0;
      let btn = product.querySelector('.cart-btn');
      if (!btn) {
        const textWrap = product.querySelector('.text') || product;
        const placeholder = document.createElement('div');
        placeholder.className = 'cart-btn cart-btn--disabled';
        placeholder.textContent = 'Available soon';
        textWrap.appendChild(placeholder);
        btn = placeholder;
      }

      if (!btn.classList.contains('cart-btn--disabled')) {
        btn.addEventListener('click', function (event) {
          if ((cart[id] || 0) === 0) {
            cart[id] = 1;
            updateProductButton(product, cart[id]);
            updateCartWidget();
            persistCart();
          }
        });

        product.addEventListener('click', function (event) {
          if (event.target.classList.contains('plus')) {
            cart[id] = (cart[id] || 0) + 1;
            updateProductButton(product, cart[id]);
            updateCartWidget();
            persistCart();
            event.stopPropagation();
          } else if (event.target.classList.contains('minus')) {
            cart[id] = Math.max((cart[id] || 0) - 1, 0);
            updateProductButton(product, cart[id]);
            updateCartWidget();
            persistCart();
            event.stopPropagation();
          }
        });
      }
    });

    const hadRestore = restoreCart();
    document.querySelectorAll('.product[data-id]').forEach(product => {
      const pid = product.getAttribute('data-id');
      const qty = Number(cart[pid]) || 0;
      updateProductButton(product, qty);
    });
    updateCartWidget();

    const cartWidget = document.getElementById('cart-widget');
    cartWidget.addEventListener('mouseenter', function () {
      if (!cartWidget.classList.contains('expanded')) {
        const totalCount = Object.values(cart).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
        const cartSummary = cartWidget.querySelector('.cart-summary');
        cartSummary.textContent = totalCount > 0 ? `Buy (${totalCount})` : 'No items';
      }
    });
    cartWidget.addEventListener('mouseleave', function () {
      if (!cartWidget.classList.contains('expanded')) {
        updateCartWidget();
      }
    });

    cartWidget.addEventListener('click', function (event) {
      const totalCount = Object.values(cart).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
      if (totalCount > 0) {
        cartWidget.classList.add('expanded');
        event.stopPropagation();

        const orderButton = document.getElementById('order-button');
        orderButton.style.opacity = '0';
        orderButton.style.transition = 'opacity 0.2s ease';
        setTimeout(() => {
          orderButton.style.opacity = '1';
        }, 500);
      }
    });

    document.addEventListener('click', function (event) {
      if (cartWidget.classList.contains('expanded')) {
        const container = document.getElementById('checkout-container');
        if (!container.contains(event.target)) {
          cartWidget.classList.remove('expanded');
          updateCartWidget();
        }
      }
    });

    document.getElementById('order-button').addEventListener('click', function () {
      buildPaypalForm();
      clearCartStorage(); 
      document.getElementById('paypal-form').submit();
    });


    (function () {
      const span = document.getElementById('local-meta');
      if (!span) return;

      const DIRS = [
        "north", "north-northeast", "northeast", "east-northeast",
        "east", "east-southeast", "southeast", "south-southeast",
        "south", "south-southwest", "southwest", "west-southwest",
        "west", "west-northwest", "northwest", "north-northwest"
      ];

      function azToDirection(az) {
        const idx = Math.round(((az % 360) / 22.5)) % 16;
        return DIRS[idx];
      }

      function formatLocalTime(tz) {
        try {
          return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: tz
          }).format(new Date());
        } catch {
          return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(new Date());
        }
      }

      function updateSunPositionText() {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const now = new Date();
        const pos = solarPosition(now, COORDS.lat, COORDS.lon);
        const direction = azToDirection(pos.azimuth);
        const time = formatLocalTime(tz);
        span.textContent = `(${direction}, ${time})`;
      }

      updateSunPositionText();
      setInterval(updateSunPositionText, 60 * 1000);
    })();

    const icons = ["t.png", "b.png"];
    let index = 0;

    setInterval(() => {
      index = (index + 1) % icons.length;
      const link = document.querySelector("#dynamic-favicon") || document.createElement("link");
      link.id = "dynamic-favicon";
      link.rel = "icon";
      link.type = "image/png";
      link.href = icons[index];

      const old = document.querySelector("link[rel='icon']");
      if (old) old.remove();
      document.head.appendChild(link);
    }, 2000);

    document.querySelectorAll('.flip-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;      // 0..1
    card.style.setProperty('--light-x', x.toFixed(3));
  });
  card.addEventListener('mouseleave', () => {
    card.style.removeProperty('--light-x');
  });
});
