const config = require('./config');
const aliClient = require('./aliexpress_client');
const shopifyClient = require('./shopify_client');

function parsePhone(rawPhone, countryCode = 'US') {
  let digits = (rawPhone || '').replace(/\D/g, '');
  let phoneCountry = '+1';

  if (countryCode === 'US' || countryCode === 'CA') {
    phoneCountry = '+1';
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }
  } else if (countryCode === 'GB' || countryCode === 'UK') {
    phoneCountry = '+44';
    if (digits.startsWith('44')) digits = digits.slice(2);
  } else if (countryCode === 'AU') {
    phoneCountry = '+61';
    if (digits.startsWith('61')) digits = digits.slice(2);
  }

  if (!digits || digits.length < 7) {
    digits = config.aliexpress.defaultPhone || '4077658845';
  }

  return { phoneCountry, mobileNo: digits };
}

const fs = require('fs');
const path = require('path');
const CATALOG_PATH = path.join(__dirname, 'catalog.json');

function getCatalog() {
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    } catch (e) {
      // fallback
    }
  }
  return {};
}

function resolveProductItem(item) {
  const titleLower = (item.title || '').toLowerCase();
  const vTitle = (item.variant_title || '').toUpperCase();
  const sku = (item.sku || '').toUpperCase();

  // Skip digital items, warranties, tips, and intangible services
  if (
    titleLower.includes('calm car rider') || 
    titleLower.includes('blueprint') || 
    titleLower.includes('chew-proof') || 
    titleLower.includes('protection') || 
    titleLower.includes('tip') ||
    item.requires_shipping === false
  ) {
    return null;
  }

  // Extract customization properties (e.g. Dog's Name, Tag Phone Number)
  let orderMemo = null;
  if (Array.isArray(item.properties) && item.properties.length > 0) {
    const validProps = item.properties.filter(p => p.name && p.value && !p.name.startsWith('_'));
    if (validProps.length > 0) {
      orderMemo = validProps.map(p => `${p.name}: ${p.value}`).join(' • ');
    }
  }

  let aliProductId = config.aliexpress.productId;
  let skuAttr = '5:361386;14:193';
  let multiplier = 1;

  // SPECIFIC PRODUCT COLOR & VARIANT RULES:
  // 1. Harness: ALWAYS Black, with size (S, M, L, XL) from variant title
  if (titleLower.includes('harness')) {
    aliProductId = '3256806663780528';
    if (vTitle.includes('XL')) {
      skuAttr = '5:100014065;14:193#Black'; // Black XL
    } else if (vTitle.includes('L')) {
      skuAttr = '5:361385;14:193#Black'; // Black L
    } else if (vTitle.includes('S')) {
      skuAttr = '5:100014064;14:193#Black'; // Black S
    } else {
      skuAttr = '5:361386;14:193#Black'; // Black M (Default)
    }
  }
  // 2. GPS Tracker: ALWAYS Black
  else if (titleLower.includes('gps')) {
    aliProductId = '3256805685101130';
    skuAttr = '14:496#black with battery'; // Black with battery
  }
  // 3. Dog Tag: ALWAYS Silver M (Cheapest variant - $3.02)
  else if (titleLower.includes('tag')) {
    aliProductId = '3256808705434116';
    skuAttr = '5:361386#M3.09X5.19cm;14:29#GP-G-P8-Sliver';
  }
  // 4. Sticker
  else if (titleLower.includes('sticker')) {
    aliProductId = '2255800752212310';
    skuAttr = '';
  }
  // 5. Seat Belt & Bundles
  else if (titleLower.includes('seat belt') || sku.startsWith('SPS-')) {
    aliProductId = '3256811984485167';
    skuAttr = '5:361386;14:193'; // Black M
    if (sku === 'SPS-02' || titleLower.includes('2 seat belt')) {
      multiplier = 2;
    } else if (sku === 'SPS-03' || titleLower.includes('3 seat belt')) {
      multiplier = 3;
    }
  }
  // 6. Dynamic Catalog Match for any other future products
  else {
    const catalog = getCatalog();
    let matchedEntry = null;

    for (const [name, cat] of Object.entries(catalog)) {
      const keywords = cat.keywords || [name.toLowerCase()];
      if (keywords.some(kw => titleLower.includes(kw.toLowerCase()))) {
        matchedEntry = cat;
        break;
      }
    }

    if (matchedEntry) {
      aliProductId = matchedEntry.product_id;
      if (matchedEntry.skus && matchedEntry.skus.length > 0) {
        let matchedSku = matchedEntry.skus[0];
        for (const s of matchedEntry.skus) {
          const attrUpper = (s.attr || '').toUpperCase();
          if (vTitle && attrUpper.includes(vTitle)) {
            matchedSku = s;
            break;
          }
        }
        skuAttr = matchedSku.sku_attr || '';
      }
    }
  }

  let finalCount = item.quantity * multiplier;

  // BUSINESS FUNNEL RULE:
  // For SPS-01 ("1 Seat Belt" Free + Shipping offer), even if the customer ordered 2x, 3x, etc.,
  // always process strictly 1 pcs to protect store margins.
  const isSps01 = sku === 'SPS-01' || 
                  vTitle.includes('1 SEAT BELT') || 
                  (titleLower.includes('seat belt') && !sku.includes('SPS-02') && !sku.includes('SPS-03') && !titleLower.includes('2 seat belt') && !titleLower.includes('3 seat belt'));

  if (isSps01) {
    if (item.quantity > 1) {
      console.log(`  🛡️ Margin Protection: Order requested ${item.quantity}x for SPS-01. Capped to 1 pcs.`);
    }
    finalCount = 1;
  }

  return {
    product_id: String(aliProductId),
    sku_attr: skuAttr,
    product_count: finalCount,
    title: item.title,
    variant: item.variant_title || 'Standard',
    order_memo: orderMemo
  };
}

async function resetTags() {
  console.log('\n======================================================');
  console.log('   RESETTING FULFILLMENT TAGS IN SHOPIFY');
  console.log('======================================================\n');

  const data = await shopifyClient.makeRequest('/orders.json?status=open&financial_status=paid&fulfillment_status=unfulfilled&limit=100');
  const orders = data.orders || [];
  let resetCount = 0;

  for (const order of orders) {
    const tags = (order.tags || '').split(',').map(t => t.trim());
    const cleaned = tags.filter(t => t.toLowerCase() !== 'ali-placed' && !t.toLowerCase().startsWith('ali-id:') && t.toLowerCase() !== 'fulfill-ali');
    if (cleaned.length !== tags.length) {
      await shopifyClient.makeRequest(`/orders/${order.id}.json`, 'PUT', {
        order: {
          id: order.id,
          tags: cleaned.join(', ')
        }
      });
      console.log(`  ✨ Cleared tags on Shopify Order #${order.order_number} (${order.name})`);
      resetCount++;
    }
  }

  console.log(`\n✅ Finished! Cleared fulfillment tags on ${resetCount} order(s). All orders are ready to be processed fresh.\n`);
}

async function placeSingleOrder(order, { isDryRun = false, tagToRemove = null } = {}) {
  console.log(`------------------------------------------------------`);
  console.log(`Processing Shopify Order #${order.order_number || order.id} (${order.name})`);

  const shipping = order.shipping_address;
  if (!shipping) {
    console.warn(`⚠️ Skipping: Order has no shipping address.`);
    return { status: 'skipped', reason: 'No shipping address' };
  }

  const productItems = [];
  const memoParts = [];

  for (const item of (order.line_items || [])) {
    const resolved = resolveProductItem(item);
    if (resolved) {
      const itemObj = {
        product_id: resolved.product_id,
        sku_attr: resolved.sku_attr,
        product_count: resolved.product_count
      };

      if (resolved.order_memo) {
        itemObj.order_memo = resolved.order_memo;
        memoParts.push(`${resolved.title}: [${resolved.order_memo}]`);
        console.log(`  ✍️  Custom Personalization: "${resolved.order_memo}"`);
      }

      productItems.push(itemObj);
      console.log(`  📦 Line Item: ${resolved.title} (${resolved.variant}) -> AE Product: ${resolved.product_id} [attr: ${resolved.sku_attr || 'default'}] x${resolved.product_count}`);
    }
  }

  if (productItems.length === 0) {
    console.warn(`  ℹ️ Notice: Order only contains digital goods / warranties. No physical fulfillment needed.`);
    return { status: 'skipped', reason: 'Digital goods only' };
  }

  const countryCode = shipping.country_code || 'US';
  const { phoneCountry, mobileNo } = parsePhone(shipping.phone || order.phone, countryCode);

  const logisticsAddress = {
    contact_person: shipping.name || `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
    full_name: shipping.name || `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
    address: shipping.address1,
    address2: shipping.address2 || '',
    city: shipping.city,
    province: shipping.province || shipping.province_code || '',
    zip: shipping.zip,
    country: countryCode,
    phone_country: phoneCountry,
    mobile_no: mobileNo
  };

  // Timestamp ensures re-tried / re-placed orders get fresh AliExpress transaction IDs
  const uniqueOutOrderId = `SPS-${order.id}-${Math.floor(Date.now() / 1000)}`;

  const placeOrderPayload = {
    logistics_address: logisticsAddress,
    product_items: productItems,
    out_order_id: uniqueOutOrderId
  };

  if (memoParts.length > 0) {
    placeOrderPayload.order_memo = memoParts.join('; ');
    console.log(`  📝 Seller Order Note: "${placeOrderPayload.order_memo}"`);
  }

  console.log(`  📍 Ship To: ${logisticsAddress.contact_person}, ${logisticsAddress.address}, ${logisticsAddress.city}, ${logisticsAddress.province} ${logisticsAddress.country} ${logisticsAddress.zip}`);
  console.log(`  📞 Phone: ${logisticsAddress.phone_country} ${logisticsAddress.mobile_no}`);

  if (isDryRun) {
    console.log(`  [DRY-RUN] Prepared AliExpress Payload:`);
    console.log(JSON.stringify(placeOrderPayload, null, 2));
    console.log(`  ✅ Dry-run simulation successful for Order #${order.order_number || order.id}`);
    return { status: 'success', dryRun: true };
  }

  // LIVE ORDER PLACEMENT
  console.log(`  🚀 Placing order on AliExpress via Dropshipping API...`);
  try {
    const res = await aliClient.placeOrder(placeOrderPayload);

    if (res && (res.result?.is_success || res.order_list || res.result?.order_list || res.is_success)) {
      const orderList = res.result?.order_list || res.order_list || [];
      const aliOrderId = orderList.length > 0 ? orderList[0] : (res.result?.order_id || 'SUCCESS');

      console.log(`  🎉 Created on AliExpress! Order ID: ${aliOrderId}`);

      // Tag order in Shopify
      await shopifyClient.tagOrderAsPlaced(order, aliOrderId, tagToRemove);
      console.log(`  🏷️  Shopify Order #${order.order_number} tagged with "ali-placed" and Order Note updated.`);
      return { status: 'success', aliOrderId };
    } else {
      console.error(`  ❌ Failed to place order on AliExpress:`, JSON.stringify(res, null, 2));
      return { status: 'failed', error: res };
    }
  } catch (err) {
    console.error(`  ❌ Order placement exception:`, err.message);
    return { status: 'failed', error: err.message };
  }
}

async function syncOrders() {
  const isReset = process.argv.includes('--reset-tags');
  if (isReset) {
    await resetTags();
    return;
  }

  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const orderFilterArg = process.argv.find(a => a.startsWith('--order='));
  let orderFilter = orderFilterArg ? orderFilterArg.split('=')[1].trim() : null;
  if (orderFilter) {
    orderFilter = orderFilter.replace(/^[#SPS]+/, '').replace(/[^0-9]/g, '');
  }
  const tagFilterArg = process.argv.find(a => a.startsWith('--tag='));
  const tagFilter = tagFilterArg ? tagFilterArg.split('=')[1].trim() : null;

  console.log('\n======================================================');
  console.log(`   SAFEPET STRAP -> ALIEXPRESS AUTOMATED FULFILLMENT`);
  console.log(`   MODE: ${isDryRun ? 'DRY-RUN (SIMULATION ONLY)' : 'LIVE EXECUTION'}`);
  if (isForce) console.log(`   OPTION: FORCE RE-PROCESS (ignoring ali-placed tag)`);
  if (tagFilter) console.log(`   OPTION: TAG FILTER [${tagFilter}] (processing selected tagged orders)`);
  if (limit) console.log(`   LIMIT: Processing maximum ${limit} order(s)`);
  if (orderFilter) console.log(`   FILTER: Order #${orderFilter}`);
  console.log('======================================================\n');

  // Verify tokens
  const tokens = config.getTokens();
  if (!isDryRun && (!tokens || !tokens.access_token)) {
    console.error('❌ Error: Not authenticated with AliExpress.');
    console.error('👉 Please run "npm run auth" first to connect your buyer account.\n');
    process.exit(1);
  }

  console.log('⏳ Checking Shopify for open unfulfilled orders...');
  let orders = [];
  try {
    orders = await shopifyClient.getUnfulfilledOrders({ force: isForce, tagFilter });
  } catch (err) {
    console.error('❌ Error fetching Shopify orders:', err.message);
    process.exit(1);
  }

  if (orderFilter) {
    orders = orders.filter(o => 
      String(o.order_number).includes(orderFilter) || 
      String(o.id).includes(orderFilter) ||
      (o.name && o.name.includes(orderFilter))
    );
  }

  if (limit && limit > 0) {
    orders = orders.slice(0, limit);
  }

  console.log(`📋 Found ${orders.length} unfulfilled order(s) to process.\n`);

  if (orders.length === 0) {
    console.log('✨ No matching unfulfilled orders found. Nothing to do!\n');
    return;
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const order of orders) {
    const res = await placeSingleOrder(order, { isDryRun, tagToRemove: tagFilter });
    if (res.status === 'success') successCount++;
    else if (res.status === 'skipped') skipCount++;
    else failCount++;

    // Small rate-limiting delay between order placements
    if (!isDryRun) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log('\n======================================================');
  console.log(`   EXECUTION SUMMARY`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Skipped:    ${skipCount}`);
  console.log(`   Failed:     ${failCount}`);
  console.log('======================================================\n');

  if (!isDryRun && successCount > 0) {
    console.log('💡 NEXT STEP: Go to your AliExpress buyer account:');
    console.log('👉 https://www.aliexpress.com/orderList.htm');
    console.log('All orders are created under "Awaiting Payment" with complete customer addresses.');
    console.log('Click "Select All" -> "Pay for All Orders" in ONE click!\n');
  }
}

if (require.main === module) {
  syncOrders();
}

module.exports = { syncOrders, placeSingleOrder, resetTags };
