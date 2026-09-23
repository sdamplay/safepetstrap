/**
 * SafePet™ UltraPad - 12/10 High-Converting DTC Interaction Controller
 */

(function () {
  'use strict';

  // Base pricing configuration specified by user
  const PRICING_CONFIG = {
    small: {
      name: 'Small',
      dimensions: '16x24 Inches',
      cm: '40x60cm',
      basePrice: 24.95,
      comparePrice: 49.95,
      breeds: 'Chihuahua, Yorkie, Maltese, Pomeranian, Toy Poodle, Dachshund',
      weight: 'Up to 15 lbs'
    },
    medium: {
      name: 'Medium',
      dimensions: '28x32 Inches',
      cm: '70x80cm',
      basePrice: 29.95,
      comparePrice: 59.95,
      breeds: 'French Bulldog, Beagle, Cocker Spaniel, Corgi, Shih Tzu, Pug',
      weight: '15 - 40 lbs'
    },
    large: {
      name: 'Large',
      dimensions: '32x35 Inches',
      cm: '80x90cm',
      basePrice: 34.95,
      comparePrice: 69.95,
      breeds: 'Labrador, Golden Retriever, German Shepherd, Boxer, Husky, Pitbull',
      weight: '40+ lbs'
    }
  };

  // State
  let currentSize = 'medium'; // Default to medium (highest margin & popularity)
  let currentColor = 'Bone Gray';
  let currentTier = '3-pack'; // Default: Buy 2 Get 1 FREE (Tier 2)

  // DOM Elements
  function init() {
    setupObjectionTabs();
    setupSizeSelector();
    setupColorSelector();
    setupTierSelector();
    setupGallery();
    setupSizeGuideModal();
    setupSavingsCalculator();
    setupAccordionFaq();
    setupStickyNavigation();
    setupAddToCart();
    updateAllPricing();
  }

  /* --------------------------------------------------------------------------
     1. Objection FAQ Tabs
     -------------------------------------------------------------------------- */
  function setupObjectionTabs() {
    const pills = document.querySelectorAll('.pp-obj-pill');
    const answerBox = document.getElementById('ppObjAnswerBox');
    if (!pills.length || !answerBox) return;

    pills.forEach(pill => {
      pill.addEventListener('click', function () {
        pills.forEach(p => p.classList.remove('pp-active'));
        this.classList.add('pp-active');
        const answer = this.getAttribute('data-answer');
        answerBox.innerHTML = `<strong>💡 Answer:</strong> ${answer}`;
        answerBox.style.display = 'block';
      });
    });
  }

  /* --------------------------------------------------------------------------
     2. Size Selector
     -------------------------------------------------------------------------- */
  function setupSizeSelector() {
    const sizeCards = document.querySelectorAll('.pp-size-card');
    const selectedSizeLabel = document.getElementById('ppSelectedSizeLabel');

    sizeCards.forEach(card => {
      card.addEventListener('click', function () {
        const sizeKey = this.getAttribute('data-size');
        if (!PRICING_CONFIG[sizeKey]) return;

        currentSize = sizeKey;
        sizeCards.forEach(c => c.classList.remove('pp-active'));
        this.classList.add('pp-active');

        if (selectedSizeLabel) {
          selectedSizeLabel.textContent = `${PRICING_CONFIG[sizeKey].name} (${PRICING_CONFIG[sizeKey].dimensions})`;
        }

        // Also sync size image in main gallery if data-image exists
        const sizeImgSrc = this.getAttribute('data-img');
        if (sizeImgSrc) {
          const mainImg = document.getElementById('ppMainGalleryImg');
          if (mainImg) mainImg.src = sizeImgSrc;
        }

        updateAllPricing();
      });
    });
  }

  /* --------------------------------------------------------------------------
     3. Color Selector
     -------------------------------------------------------------------------- */
  function setupColorSelector() {
    const colorCards = document.querySelectorAll('.pp-color-card');
    const selectedColorLabel = document.getElementById('ppSelectedColorLabel');

    colorCards.forEach(card => {
      card.addEventListener('click', function () {
        colorCards.forEach(c => c.classList.remove('pp-active'));
        this.classList.add('pp-active');
        currentColor = this.getAttribute('data-color');
        if (selectedColorLabel) {
          selectedColorLabel.textContent = currentColor;
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     4. Tier / Bundle Selector
     -------------------------------------------------------------------------- */
  function setupTierSelector() {
    const tierCards = document.querySelectorAll('.pp-tier-card');

    tierCards.forEach(card => {
      card.addEventListener('click', function () {
        tierCards.forEach(c => c.classList.remove('pp-active'));
        this.classList.add('pp-active');
        currentTier = this.getAttribute('data-tier');
        updateAllPricing();
      });
    });
  }

  /* --------------------------------------------------------------------------
     Pricing & Dynamic Calculation Engine
     -------------------------------------------------------------------------- */
  function updateAllPricing() {
    const config = PRICING_CONFIG[currentSize];
    if (!config) return;

    // Tier 1: 1 Pad
    const t1Price = config.basePrice;
    const t1Compare = config.comparePrice;

    // Tier 2: Buy 2 Get 1 FREE (3 Pads) -> Customer pays for 2
    const t2Price = config.basePrice * 2;
    const t2Compare = config.basePrice * 3;
    const t2Unit = (t2Price / 3).toFixed(2);
    const t2Savings = (t2Compare - t2Price).toFixed(2);

    // Tier 3: Buy 3 Get 3 FREE (6 Pads) -> Customer pays for 3
    const t3Price = config.basePrice * 3;
    const t3Compare = config.basePrice * 6;
    const t3Unit = (t3Price / 6).toFixed(2);
    const t3Savings = (t3Compare - t3Price).toFixed(2);

    // Update Tier 1 DOM
    const t1PriceEl = document.getElementById('ppTier1Price');
    const t1CompareEl = document.getElementById('ppTier1Compare');
    if (t1PriceEl) t1PriceEl.textContent = `$${t1Price.toFixed(2)}`;
    if (t1CompareEl) t1CompareEl.textContent = `$${t1Compare.toFixed(2)}`;

    // Update Tier 2 DOM
    const t2PriceEl = document.getElementById('ppTier2Price');
    const t2CompareEl = document.getElementById('ppTier2Compare');
    const t2UnitEl = document.getElementById('ppTier2Unit');
    const t2BadgeEl = document.getElementById('ppTier2Badge');
    if (t2PriceEl) t2PriceEl.textContent = `$${t2Price.toFixed(2)}`;
    if (t2CompareEl) t2CompareEl.textContent = `$${t2Compare.toFixed(2)}`;
    if (t2UnitEl) t2UnitEl.textContent = `$${t2Unit}/each`;
    if (t2BadgeEl) t2BadgeEl.textContent = `🔥 SAVE $${t2Savings} (BUY 2 GET 1 FREE)`;

    // Update Tier 3 DOM
    const t3PriceEl = document.getElementById('ppTier3Price');
    const t3CompareEl = document.getElementById('ppTier3Compare');
    const t3UnitEl = document.getElementById('ppTier3Unit');
    const t3BadgeEl = document.getElementById('ppTier3Badge');
    if (t3PriceEl) t3PriceEl.textContent = `$${t3Price.toFixed(2)}`;
    if (t3CompareEl) t3CompareEl.textContent = `$${t3Compare.toFixed(2)}`;
    if (t3UnitEl) t3UnitEl.textContent = `$${t3Unit}/each`;
    if (t3BadgeEl) t3BadgeEl.textContent = `⭐ BEST VALUE: BUY 3 GET 3 FREE (SAVE $${t3Savings})`;

    // Determine Active Total Price
    let activeTotal = t2Price;
    let activeSavings = t2Savings;
    let activeUnits = 3;

    if (currentTier === '1-pack') {
      activeTotal = t1Price;
      activeSavings = (t1Compare - t1Price).toFixed(2);
      activeUnits = 1;
    } else if (currentTier === '6-pack') {
      activeTotal = t3Price;
      activeSavings = t3Savings;
      activeUnits = 6;
    }

    // Update Main ATC Button
    const atcBtnText = document.getElementById('ppAtcBtnText');
    if (atcBtnText) {
      atcBtnText.textContent = `CLAIM OFFER — JUST $${activeTotal.toFixed(2)} →`;
    }

    // Update Mobile Sticky Bar
    const stickyPrice = document.getElementById('ppStickyPrice');
    const stickySubtitle = document.getElementById('ppStickySubtitle');
    if (stickyPrice) stickyPrice.textContent = `$${activeTotal.toFixed(2)}`;
    if (stickySubtitle) stickySubtitle.textContent = `${config.name} (${activeUnits} Pads)`;

    // Update Savings Calculator
    recalculateSavings(activeTotal);
  }

  /* --------------------------------------------------------------------------
     5. Gallery Thumbnail Switching
     -------------------------------------------------------------------------- */
  function setupGallery() {
    const thumbs = document.querySelectorAll('.pp-thumb-btn');
    const mainImg = document.getElementById('ppMainGalleryImg');
    if (!thumbs.length || !mainImg) return;

    thumbs.forEach(thumb => {
      thumb.addEventListener('click', function () {
        thumbs.forEach(t => t.classList.remove('pp-active'));
        this.classList.add('pp-active');
        const newSrc = this.getAttribute('data-full-img');
        if (newSrc) {
          mainImg.style.opacity = '0.4';
          setTimeout(() => {
            mainImg.src = newSrc;
            mainImg.style.opacity = '1';
          }, 150);
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     6. Size Guide Modal
     -------------------------------------------------------------------------- */
  function setupSizeGuideModal() {
    const modal = document.getElementById('ppSizeGuideModal');
    const trigger = document.getElementById('ppSizeGuideTrigger');
    const closeBtn = document.getElementById('ppModalCloseBtn');
    const modalTabs = document.querySelectorAll('.pp-modal-tab');
    const modalImg = document.getElementById('ppModalSizeImg');
    const modalBreedText = document.getElementById('ppModalBreedText');
    const modalWeightText = document.getElementById('ppModalWeightText');
    const modalDimText = document.getElementById('ppModalDimText');

    if (!modal) return;

    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('pp-modal-open');
        syncModalTab(currentSize);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('pp-modal-open');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('pp-modal-open');
      }
    });

    modalTabs.forEach(tab => {
      tab.addEventListener('click', function () {
        const sizeKey = this.getAttribute('data-modal-size');
        syncModalTab(sizeKey);
      });
    });

    function syncModalTab(sizeKey) {
      const cfg = PRICING_CONFIG[sizeKey];
      if (!cfg) return;

      modalTabs.forEach(t => {
        if (t.getAttribute('data-modal-size') === sizeKey) {
          t.classList.add('pp-active');
        } else {
          t.classList.remove('pp-active');
        }
      });

      if (modalDimText) modalDimText.textContent = `${cfg.dimensions} (${cfg.cm})`;
      if (modalBreedText) modalBreedText.textContent = cfg.breeds;
      if (modalWeightText) modalWeightText.textContent = cfg.weight;

      if (modalImg) {
        if (sizeKey === 'small') modalImg.src = modalImg.getAttribute('data-img-s') || modalImg.src;
        if (sizeKey === 'medium') modalImg.src = modalImg.getAttribute('data-img-m') || modalImg.src;
        if (sizeKey === 'large') modalImg.src = modalImg.getAttribute('data-img-l') || modalImg.src;
      }
    }
  }

  /* --------------------------------------------------------------------------
     7. Interactive Annual Savings Calculator
     -------------------------------------------------------------------------- */
  function setupSavingsCalculator() {
    const slider = document.getElementById('ppPadsPerDaySlider');
    const sliderVal = document.getElementById('ppSliderVal');
    if (!slider) return;

    slider.addEventListener('input', function () {
      if (sliderVal) sliderVal.textContent = `${this.value} pads / day`;
      const config = PRICING_CONFIG[currentSize];
      let padCost = config.basePrice * 2; // default 3-pack
      if (currentTier === '1-pack') padCost = config.basePrice;
      if (currentTier === '6-pack') padCost = config.basePrice * 3;
      recalculateSavings(padCost);
    });
  }

  function recalculateSavings(ultraPadCost) {
    const slider = document.getElementById('ppPadsPerDaySlider');
    const costPerYearEl = document.getElementById('ppDisposableYearlyCost');
    const netSavingsEl = document.getElementById('ppNetYearlySavings');
    if (!slider || !costPerYearEl || !netSavingsEl) return;

    const padsPerDay = parseInt(slider.value, 10) || 3;
    const disposableCostEach = 0.40; // Average price of disposable pee pad
    const disposableYearly = Math.round(padsPerDay * disposableCostEach * 365);
    const netSavings = Math.max(0, Math.round(disposableYearly - ultraPadCost));

    costPerYearEl.textContent = `$${disposableYearly.toLocaleString()}`;
    netSavingsEl.textContent = `+$${netSavings.toLocaleString()} / year`;
  }

  /* --------------------------------------------------------------------------
     8. Accordion FAQ
     -------------------------------------------------------------------------- */
  function setupAccordionFaq() {
    const items = document.querySelectorAll('.pp-faq-item');
    items.forEach(item => {
      const q = item.querySelector('.pp-faq-question');
      if (q) {
        q.addEventListener('click', () => {
          const isOpen = item.classList.contains('pp-open');
          items.forEach(i => i.classList.remove('pp-open'));
          if (!isOpen) item.classList.add('pp-open');
        });
      }
    });
  }

  /* --------------------------------------------------------------------------
     9. Sticky Header & Mobile ATC Bar Observer
     -------------------------------------------------------------------------- */
  function setupStickyNavigation() {
    const floatingNav = document.getElementById('ppFloatingNav');
    const mobileStickyBar = document.getElementById('ppMobileStickyBar');
    const heroSection = document.getElementById('ppHeroSection');
    if (!heroSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // When hero is NOT intersecting (scrolled down past it)
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
          if (floatingNav) floatingNav.classList.remove('pp-nav-hidden');
          if (mobileStickyBar) mobileStickyBar.classList.add('pp-sticky-visible');
        } else {
          if (floatingNav) floatingNav.classList.add('pp-nav-hidden');
          if (mobileStickyBar) mobileStickyBar.classList.remove('pp-sticky-visible');
        }
      });
    }, { threshold: 0.1 });

    observer.observe(heroSection);
  }

  /* --------------------------------------------------------------------------
     10. Add to Cart Handler (Shopify AJAX Integration)
     -------------------------------------------------------------------------- */
  function setupAddToCart() {
    const atcBtn = document.getElementById('ppAddToCartBtn');
    const mobileAtcBtn = document.getElementById('ppMobileAtcBtn');

    function handleAdd(btn) {
      if (!btn) return;
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span>Adding to Cart...</span>`;
      btn.style.opacity = '0.85';
      btn.disabled = true;

      // Extract variant ID if provided on container
      const container = document.querySelector('.pp-page-wrapper');
      const variantMapAttr = container ? container.getAttribute('data-variant-map') : null;
      let variantId = null;

      if (variantMapAttr) {
        try {
          const map = JSON.parse(variantMapAttr);
          // Look for matching size
          variantId = map[currentSize] || null;
        } catch (e) {}
      }

      // Quantity based on tier
      let quantity = 1;
      if (currentTier === '3-pack') quantity = 3;
      if (currentTier === '6-pack') quantity = 6;

      // If we have a Shopify variant ID, post to /cart/add.js
      if (variantId) {
        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ id: variantId, quantity: quantity }]
          })
        })
          .then(res => res.json())
          .then(() => {
            window.location.href = '/checkout';
          })
          .catch(() => {
            window.location.href = '/checkout';
          });
      } else {
        // Fallback: Check if there's a default form or direct link
        const fallbackForm = document.querySelector('form[action*="/cart/add"]');
        if (fallbackForm) {
          fallbackForm.submit();
        } else {
          // Redirect to checkout or cart
          window.location.href = '/cart';
        }
      }
    }

    if (atcBtn) {
      atcBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAdd(atcBtn);
      });
    }

    if (mobileAtcBtn) {
      mobileAtcBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAdd(mobileAtcBtn);
      });
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
