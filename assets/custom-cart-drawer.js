/**
 * Custom Shopify Cart Drawer Javascript Class
 * Pure Vanilla JS (Fetch API) - No jQuery.
 * Handles AJAX addition, update, removal, and toggle switches.
 * Uses Shopify Section Rendering API to update HTML on the fly.
 */

class CartDrawer extends HTMLElement {
  constructor() {
    super();

    // DOM Elements
    this.overlay = this.querySelector('#CartDrawer-Overlay');
    this.inner = this.querySelector('.drawer__inner');
    this.closeBtn = this.querySelector('.drawer__close');
    this.body = this.querySelector('.cart-drawer__body');
    this.footer = this.querySelector('.drawer__footer');

    // Bindings
    this.close = this.close.bind(this);
    this.open = this.open.bind(this);
    this.onFormSubmit = this.onFormSubmit.bind(this);

    // Section ID (derived from dataset or defaults to 'cart-drawer')
    this.sectionId = this.dataset.sectionId || 'cart-drawer';
  }

  connectedCallback() {
    this.initEventListeners();
    this.initTimer();
    this.interceptProductForms();
  }

  /**
   * Initialize event handlers inside the drawer (overlay, close btn, quantity selectors, upsells)
   */
  initEventListeners() {
    // Close events
    if (this.closeBtn) this.closeBtn.addEventListener('click', this.close);
    if (this.overlay) this.overlay.addEventListener('click', this.close);

    // Escape key closes drawer
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.classList.contains('is-active')) {
        this.close();
      }
    });

    // Listen to changes inside drawer body (quantity, remove, upsells)
    if (this.body) {
      this.body.addEventListener('click', (event) => {
        // 1. Remove Item Button
        const removeBtn = event.target.closest('.cart-drawer-item__remove-btn');
        if (removeBtn) {
          event.preventDefault();
          const variantId = removeBtn.dataset.variantId;
          this.updateQuantity(variantId, 0);
          return;
        }

        // 2. Quantity Minus Button
        const minusBtn = event.target.closest('.quantity__button--minus');
        if (minusBtn) {
          event.preventDefault();
          const input = minusBtn.parentNode.querySelector('.quantity__input');
          const variantId = minusBtn.dataset.variantId;
          const currentVal = parseInt(input.value) || 1;
          if (currentVal > 1) {
            this.updateQuantity(variantId, currentVal - 1);
          } else {
            // If value is 1 and they press minus, remove the item
            this.updateQuantity(variantId, 0);
          }
          return;
        }

        // 3. Quantity Plus Button
        const plusBtn = event.target.closest('.quantity__button--plus');
        if (plusBtn) {
          event.preventDefault();
          const input = plusBtn.parentNode.querySelector('.quantity__input');
          const variantId = plusBtn.dataset.variantId;
          const currentVal = parseInt(input.value) || 1;
          this.updateQuantity(variantId, currentVal + 1);
          return;
        }
      });

      // 4. Change Quantity via Direct Input
      this.body.addEventListener('change', (event) => {
        const quantityInput = event.target.closest('.quantity__input');
        if (quantityInput) {
          event.preventDefault();
          const variantId = quantityInput.dataset.variantId;
          const currentVal = parseInt(quantityInput.value);
          if (!isNaN(currentVal) && currentVal >= 0) {
            this.updateQuantity(variantId, currentVal);
          } else {
            // Revert back if input is invalid
            this.renderDrawer();
          }
          return;
        }

        // 5. Digital Upsell Toggles
        const upsellToggle = event.target.closest('.upsell-toggle-checkbox');
        if (upsellToggle) {
          event.preventDefault();
          const variantId = upsellToggle.dataset.variantId;
          const checked = upsellToggle.checked;
          this.toggleUpsell(variantId, checked);
          return;
        }
      });
    }
  }

  /**
   * Opens the Cart Drawer
   */
  open() {
    this.classList.add('is-active');
    document.body.classList.add('overflow-hidden');
    
    // Set focus to the drawer inner for accessibility
    if (this.inner) {
      this.inner.focus();
    }

    // Fire custom event
    this.dispatchEvent(new CustomEvent('cart-drawer:open', { bubbles: true }));
  }

  /**
   * Closes the Cart Drawer
   */
  close() {
    this.classList.remove('is-active');
    document.body.classList.remove('overflow-hidden');

    // Fire custom event
    this.dispatchEvent(new CustomEvent('cart-drawer:close', { bubbles: true }));
  }

  /**
   * AJAX: Update Item Quantity in Cart
   */
  updateQuantity(variantId, quantity) {
    this.showLoading(variantId);

    const body = JSON.stringify({
      id: variantId.toString(),
      quantity: quantity,
      sections: this.sectionId
    });

    fetch(`${window.Shopify.routes.root}cart/change.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body
    })
      .then(response => response.json())
      .then(state => {
        if (state.sections && state.sections[this.sectionId]) {
          this.renderSection(state.sections[this.sectionId]);
        } else {
          // Fallback if section rendering fails
          this.fetchAndRenderDrawer();
        }
        this.hideLoading(variantId);
      })
      .catch(error => {
        console.error('Error updating cart quantity:', error);
        this.hideLoading(variantId);
      });
  }

  /**
   * AJAX: Toggle Upsell Item (Add/Remove)
   */
  toggleUpsell(variantId, add) {
    this.showLoading(variantId);

    if (add) {
      // Add upsell to cart
      const body = JSON.stringify({
        id: variantId.toString(),
        quantity: 1,
        sections: this.sectionId
      });

      fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body
      })
        .then(response => response.json())
        .then(state => {
          // add.js returns state.sections differently or doesn't have it if empty. Let's make sure
          if (state.sections && state.sections[this.sectionId]) {
            this.renderSection(state.sections[this.sectionId]);
          } else {
            this.fetchAndRenderDrawer();
          }
          this.hideLoading(variantId);
        })
        .catch(error => {
          console.error('Error adding upsell:', error);
          this.hideLoading(variantId);
        });
    } else {
      // Remove upsell from cart (set quantity to 0)
      this.updateQuantity(variantId, 0);
    }
  }

  /**
   * Helper: Show loading indicator on a specific cart item
   */
  showLoading(variantId) {
    const itemElement = this.querySelector(`.cart-drawer-item[data-variant-id="${variantId}"]`) || 
                        this.querySelector(`.cart-drawer-upsell-item[data-variant-id="${variantId}"]`);
    if (itemElement) {
      const loader = itemElement.querySelector('.loading-overlay');
      if (loader) loader.classList.remove('hidden');
    }
    this.classList.add('is-loading');
  }

  /**
   * Helper: Hide loading indicator
   */
  hideLoading(variantId) {
    const itemElement = this.querySelector(`.cart-drawer-item[data-variant-id="${variantId}"]`) || 
                        this.querySelector(`.cart-drawer-upsell-item[data-variant-id="${variantId}"]`);
    if (itemElement) {
      const loader = itemElement.querySelector('.loading-overlay');
      if (loader) loader.classList.add('hidden');
    }
    this.classList.remove('is-loading');
  }

  /**
   * Render updated section HTML into the DOM and re-bind event listeners
   */
  renderSection(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newDrawerInner = doc.querySelector('.drawer__inner');

    if (newDrawerInner) {
      this.inner.innerHTML = newDrawerInner.innerHTML;
      
      // Refresh DOM references
      this.overlay = this.querySelector('#CartDrawer-Overlay');
      this.closeBtn = this.querySelector('.drawer__close');
      this.body = this.querySelector('.cart-drawer__body');
      this.footer = this.querySelector('.drawer__footer');

      // Check if cart is empty
      const isEmpty = doc.querySelector('cart-drawer').classList.contains('is-empty');
      if (isEmpty) {
        this.classList.add('is-empty');
      } else {
        this.classList.remove('is-empty');
      }

      // Re-init events
      this.initEventListeners();
      this.initTimer();

      // Trigger standard Shopify event to update other cart displays (header bubble, etc)
      this.publishCartChange();
    }
  }

  /**
   * Fetch current cart data and render the drawer section from scratch (fallback)
   */
  fetchAndRenderDrawer() {
    fetch(`${window.Shopify.routes.root}?sections=${this.sectionId}`)
      .then(response => response.json())
      .then(json => {
        if (json[this.sectionId]) {
          this.renderSection(json[this.sectionId]);
        }
      })
      .catch(error => console.error('Error fetching drawer section:', error));
  }

  /**
   * Broadcast standard cart updates so header cart bubbles or other sections can sync
   */
  publishCartChange() {
    fetch(`${window.Shopify.routes.root}cart.js`)
      .then(res => res.json())
      .then(cartData => {
        document.dispatchEvent(new CustomEvent('cart:updated', {
          detail: cartData
        }));
      });
  }

  /**
   * Intercept standard forms that submit to '/cart/add'
   */
  interceptProductForms() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form.action && form.action.includes('/cart/add')) {
        // Skip default submission
        event.preventDefault();
        
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.setAttribute('disabled', 'disabled');

        const formData = new FormData(form);
        formData.append('sections', this.sectionId);

        fetch(`${window.Shopify.routes.root}cart/add.js`, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: formData
        })
          .then(response => response.json())
          .then(state => {
            if (state.sections && state.sections[this.sectionId]) {
              this.renderSection(state.sections[this.sectionId]);
              this.open();
            } else {
              this.fetchAndRenderDrawer();
              this.open();
            }
          })
          .catch(error => {
            console.error('Error intercepting add to cart:', error);
          })
          .finally(() => {
            if (submitButton) submitButton.removeAttribute('disabled');
          });
      }
    });
  }

  /**
   * Handle the countdown reservation timer with persistence in sessionStorage
   */
  initTimer() {
    const timerElement = this.querySelector('countdown-timer');
    if (!timerElement) return;

    const duration = parseInt(timerElement.dataset.duration) || 600; // default 10m
    const storageKey = 'cart_timer_expires_at';
    let expiresAt = sessionStorage.getItem(storageKey);

    if (!expiresAt) {
      // Set future expiry timestamp
      expiresAt = Date.now() + duration * 1000;
      sessionStorage.setItem(storageKey, expiresAt);
    } else {
      expiresAt = parseInt(expiresAt);
      // If the timer has already expired and drawer is loaded, we can restart it or keep it at 0.
      // Re-starting is standard to keep conversion urgency alive.
      if (expiresAt < Date.now()) {
        expiresAt = Date.now() + duration * 1000;
        sessionStorage.setItem(storageKey, expiresAt);
      }
    }

    const minutesSpan = timerElement.querySelector('.timer-minutes');
    const secondsSpan = timerElement.querySelector('.timer-seconds');

    if (this.timerInterval) clearInterval(this.timerInterval);

    const updateTimer = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        clearInterval(this.timerInterval);
        if (minutesSpan) minutesSpan.textContent = '00';
        if (secondsSpan) secondsSpan.textContent = '00';
        // Optional: show urgency warning
        const timerContainer = this.querySelector('#CartDrawer-Timer');
        if (timerContainer) timerContainer.classList.add('timer-expired');
        return;
      }

      const totalSeconds = Math.floor(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutesSpan) minutesSpan.textContent = minutes.toString().padStart(2, '0');
      if (secondsSpan) secondsSpan.textContent = seconds.toString().padStart(2, '0');
    };

    updateTimer();
    this.timerInterval = setInterval(updateTimer, 1000);
  }
}

// Define the custom element
if (!customElements.get('custom-cart-drawer')) {
  customElements.define('custom-cart-drawer', CartDrawer);
}
