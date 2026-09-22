# SafePet Strap -> AliExpress Automated Fulfillment Engine

This automated fulfillment engine connects the **SafePet Strap** Shopify store directly to the official **AliExpress Dropshipping Open Service API** (`openservice.aliexpress.com`).

---

## What It Automates

1. **Zero Copy-Pasting Addresses**: Unfulfilled Shopify orders (`SPS-01`, `SPS-02`, `SPS-03`) are fetched and converted directly into AliExpress orders under your buyer account in **"Awaiting Payment"** status.
2. **1-Click Batch Payment**: Instead of manually fulfilling orders one by one, you open AliExpress once a day, select all created orders, and pay with 1 click.
3. **Automated Tracking & Customer Notifications**: Once the AliExpress supplier ships the package, the engine automatically extracts tracking numbers and carriers, fulfills the order on Shopify, and sends the customer their shipping confirmation email with tracking links.
4. **Duplicate Protection**: Uses idempotent out-order identifiers (`SPS-${order.id}`) and Shopify tagging (`ali-placed`) so orders can never be placed twice.

---

## Directory Overview

```text
fulfillment/
├── .env.example          # Environment variable template
├── package.json          # Node.js manifest and CLI scripts
├── config.js             # Configuration loader & token storage
├── aliexpress_client.js  # Official IOP HMAC-SHA256 client & API dispatcher
├── shopify_client.js     # Shopify Admin API wrapper (orders & fulfillments)
├── auth_setup.js         # Step 1: OAuth wizard to obtain access_token
├── sku_mapper.js         # Step 2: Supplier variant inspector & SKU mapper
├── order_sync.js         # Step 3: Main order fulfillment engine (dry-run & live)
└── tracking_sync.js      # Step 4: Tracking number synchronizer
```

---

## Quick Start Guide

### Step 1: Install Dependencies
Navigate into the `fulfillment` directory and install dependencies:
```bash
cd fulfillment
npm install
```

### Step 2: Configure `.env`
Copy the template file:
```bash
cp .env.example .env
```
Edit `.env` with your store credentials:
```env
SHOPIFY_STORE_DOMAIN=safepet-strap.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_your_token_here
ALI_APP_KEY=your_aliexpress_app_key
ALI_APP_SECRET=your_aliexpress_app_secret
ALI_PRODUCT_ID=your_supplier_product_id
```

### Step 3: Link Your AliExpress Buyer Account
Run the interactive authorization wizard:
```bash
npm run auth
```
1. It prints your OAuth authorization URL. Open it in your browser.
2. Log in with the AliExpress buyer account you want orders placed from.
3. Click "Authorize".
4. Copy the `code` from the redirect URL and paste it back into the terminal.
5. Your `access_token` and `refresh_token` are saved securely in `tokens.json`.

### Step 4: Inspect Supplier Variants & SKUs
Inspect the product variations from your AliExpress supplier:
```bash
npm run inspect:product
```
This queries the product details and saves a blueprint to `sku_mapping.json`, mapping `SPS-01`, `SPS-02`, and `SPS-03` to the appropriate variant SKU and quantities.

### Step 5: Test with Dry-Run
Preview the exact payload that will be sent without placing any orders:
```bash
npm run fulfill:dry-run
```

### Step 6: Place Orders (Live)
```bash
npm run fulfill:orders
```
- Orders are created on AliExpress in **"Awaiting Payment"**.
- The corresponding Shopify orders are tagged with `ali-placed` and the AliExpress Order ID.

### Step 7: Sync Tracking Numbers
```bash
npm run sync:tracking
```
- Queries AliExpress for shipped tracking numbers.
- Fulfills the order in Shopify and triggers customer shipping emails.

---

## Automating on Your Server (Where n8n / wacrm Runs)

Since you already have a Linux server hosting n8n, you can automate this completely via `crontab` or `pm2`:

### Crontab Setup:
Edit your server crontab:
```bash
crontab -e
```
Add the following schedules:
```cron
# Run order placement every 4 hours between 8 AM and 10 PM
0 8,12,16,20 * * * cd /path/to/fulfillment && /usr/bin/node order_sync.js >> /var/log/safepet_order_sync.log 2>&1

# Run tracking sync twice a day (morning and night)
30 9,21 * * * cd /path/to/fulfillment && /usr/bin/node tracking_sync.js >> /var/log/safepet_tracking_sync.log 2>&1
```
