# SafePet Strap — Project Memory & Agent Context

This file serves as the unified "Project Brain" and memory record. AI coding agents and IDE tools should read this file first to understand the business rules, development standards, repository configuration, and existing customizations.

---

## 1. Brand & Business Context
*   **Brand Name**: SafePet Strap (`safepetstrap.com`)
*   **Primary Product**: Dog Car Seat Belt (Heavy-duty nylon webbing, 360° zinc alloy swivel snap, elastic anti-whiplash buffer, universal 21mm seatbelt latch).
*   **Funnel Mechanism**: **"FREE + Shipping"** offer.
    *   ⚠️ **CRITICAL FUNNEL RULE**: Visitors landing on the store must NOT see the $9.95 shipping fee upfront on the product page. Keep it as "Just Pay Shipping" or "FREE" until checkout.
    *   **Checkout Flow**: 3-step Shopify checkout. Step 1 isolates email & shipping address capture (for abandoned cart recovery). The $9.95 shipping fee is first displayed on Step 2.
*   **Brand Color Palette**:
    *   **Primary Red**: `#E53935` / `#DC2626` (Derived from heart logo)
    *   **Typography**: `#111827` (Dark Charcoal)
    *   **Backgrounds**: `#FFFFFF` & `#F9FAFB`
    *   **Badges/Highlights**: `#16A34A` (Vibrant Emerald Green for FREE tags) & `#FFFF00` (Bright Yellow for featured 3-tier offer card).

---

## 2. Mandatory Git & Remote Repository Rules
*   **Target Git URL**: `https://github.com/sdamplay/safepetstrap.git`
*   ⚠️ **STRICT PUSH RULE**: Always push code ONLY to this repository. NEVER push code to `tinythrive.git` or any other store repository.
*   ⚠️ **PUSH PROTECTION**: The repository has secret detection enabled. Avoid staging or committing local credentials, scratch scripts, or keys. Ensure `.gitignore` is active (ignores `scratch/`).

---

## 3. Shopify Development Workflow & Theme IDs
*   **Primary Theme**: **Shrine PRO** (Not Horizon).
*   **Theme IDs**:
    *   `160361971942` — SafePet Strap - Shrine PRO Live **(Live Storefront)**
    *   `160356597990` — safepetstrap/main (Unpublished Main Draft)
    *   `160356401382` — Development Theme (Mohamed's iMac)
    *   `160356008166` — Horizon (Archive Draft)
*   **Synchronization Steps**:
    1.  **Pull first**: Before editing JSON settings or templates, pull changes from the active theme using `shopify theme pull --theme <ID>` to preserve configurations done via the Shopify Customizer UI.
    2.  **Allow-Live Flag**: When pushing files to the live theme `160361971942`, add the `--allow-live` parameter to bypass CLI confirmation prompts.
    3.  **Cache Busting**: Shopify CDN caches files aggressively. Use comment versions (`{% comment %} Cache buster v2 {% endcomment %}`) or file query parameters to force compilation.

---

## 4. Key Theme Files & Customizations
*   **Custom 3-Tier Variant Selector**: [`snippets/safepet-variant-selector.liquid`](file:///Users/imacm1/Desktop/SafePetStrap/snippets/safepet-variant-selector.liquid) (custom Direct-to-Consumer tiers).
*   **Cart Drawer Section Settings**: [`sections/cart-drawer.liquid`](file:///Users/imacm1/Desktop/SafePetStrap/sections/cart-drawer.liquid) (contains heading customizer sliders schema and negative margin constraints down to `-100px`).
*   **Cart Drawer Liquid Snippets**: [`snippets/cart-drawer.liquid`](file:///Users/imacm1/Desktop/SafePetStrap/snippets/cart-drawer.liquid) & [`snippets/custom-cart-drawer.liquid`](file:///Users/imacm1/Desktop/SafePetStrap/snippets/custom-cart-drawer.liquid).
*   **Global Styling Rules**: [`assets/base.css`](file:///Users/imacm1/Desktop/SafePetStrap/assets/base.css) & [`assets/custom-cart-drawer.css`](file:///Users/imacm1/Desktop/SafePetStrap/assets/custom-cart-drawer.css).

---

## 5. Active Layout & Styling Overrides
The following layout overrides are hardcoded into the theme styling to ensure they apply regardless of editor settings or caching issues:

*   **Heading Font Sizing (with fallback)**:
    ```css
    .drawer__heading {
      font-size: var(--heading-size-mobile, 20px) !important;
    }
    @media screen and (min-width: 750px) {
      .drawer__heading {
        font-size: var(--heading-size-desktop, 24px) !important;
      }
    }
    ```
*   **Header Compact Padding**: Header padding is capped to `5px !important` for a cleaner look.
*   **Totals Margins**: Row margins between Subtotals elements are restricted to `2px !important`.
*   **Footer Bottom Shift**: Shifted subtotals/checkout section up by applying `margin-bottom: -20px !important` on `.cart-drawer__footer` and `.drawer__footer`.
*   **Mobile Image Max Width**: Capped mobile product images inside the drawer to `80% !important` width using a `max-width: 749px` media query.
