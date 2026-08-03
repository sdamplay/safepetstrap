# SafePet Strap - Project Brain & Custom Agent Rules

## 1. Project Memory & Business Overview
- **Brand Name**: SafePet Strap (`safepetstrap.com`)
- **Primary Product**: Dog Car Seat Belt (Heavy-duty nylon webbing, 360° zinc alloy swivel snap, elastic anti-whiplash buffer, universal 21mm seatbelt latch).
- **Core Funnel Mechanics**: "FREE + Shipping" offer.
  - *Crucial Funnel Rule*: Visitors landing on the store must NOT know about the $9.95 shipping fee upfront.
  - *Checkout Flow*: 3-Step Shopify checkout. Step 1 isolates email & shipping address capture for abandoned cart recovery. The $9.95 shipping fee is presented on Step 2/3.
- **Brand Color Palette**:
  - Primary Red: `#E53935` / `#DC2626` (Derived from heart logo)
  - Typography: `#111827` (Dark Charcoal)
  - Backgrounds: `#FFFFFF` & `#F9FAFB`
  - Badges/Highlights: `#16A34A` (Vibrant Emerald Green for FREE tags) & `#FFFF00` (Bright Yellow for featured 3-tier offer card).

---

## 2. Mandatory Git & Remote Repository Rules
- **Repository URL**: `https://github.com/sdamplay/safepetstrap.git`
- **STRICT RULE**: Always push code ONLY to `https://github.com/sdamplay/safepetstrap.git`. NEVER push code to `tinythrive.git` or any other store repository.

---

## 3. Shopify Editor Sync & Modification Rules
Before making any file modifications or starting a task in this repository:
1. **Pull Latest Changes**: Always run `git pull origin main` to download recent section/setting edits committed by the Shopify Editor (`shopify[bot]`).
2. **Preserve Editor Edits**: Exercise extreme caution when editing `config/settings_data.json` or JSON template files (`templates/*.json`). Never blindly overwrite sections or settings configured in the Shopify Admin.
3. **Sync Back**: After making and verifying local edits, commit and push ONLY to `https://github.com/sdamplay/safepetstrap.git`.

---

## 4. Key Theme Files & Custom Components
- Custom 3-Tier Variant Selector: `snippets/safepet-variant-selector.liquid`
- Theme Settings & Colors: `config/settings_data.json`
- Homepage DTC Template: `templates/index.json`
- Header & Announcement Bar: `sections/header-group.json` & `sections/announcement-bar.liquid`
- Main Product Section: `sections/main-product.liquid`
