const config = require('./config');
const aliClient = require('./aliexpress_client');
const shopifyClient = require('./shopify_client');

async function syncTracking() {
  console.log('\n======================================================');
  console.log('   SAFEPET STRAP -> ALIEXPRESS TRACKING SYNCHRONIZER');
  console.log('======================================================\n');

  // Verify authentication
  const tokens = config.getTokens();
  if (!tokens || !tokens.access_token) {
    console.error('❌ Error: Not authenticated with AliExpress. Run "npm run auth" first.');
    process.exit(1);
  }

  console.log('⏳ Checking Shopify for placed orders pending fulfillment...');

  let orders = [];
  try {
    // Fetch orders that are unfulfilled
    const allUnfulfilled = await shopifyClient.makeRequest(
      '/orders.json?status=open&financial_status=paid&fulfillment_status=unfulfilled&limit=100'
    );
    const tagPlaced = config.shopify.tagPlaced.toLowerCase();
    const tagShipped = config.shopify.tagShipped.toLowerCase();

    orders = (allUnfulfilled.orders || []).filter(order => {
      const tags = (order.tags || '').split(',').map(t => t.trim().toLowerCase());
      const hasPlacedMarker = tags.includes(tagPlaced) || tags.includes('ae-placed') || tags.includes('ali-placed') || tags.some(t => t.startsWith('ali-id:'));
      return hasPlacedMarker && !tags.includes(tagShipped);
    });
  } catch (err) {
    console.error('❌ Error querying Shopify orders:', err.message);
    process.exit(1);
  }

  console.log(`📋 Found ${orders.length} placed order(s) awaiting tracking from AliExpress.\n`);

  if (orders.length === 0) {
    console.log('✨ No placed orders waiting for tracking. All set!\n');
    return;
  }

  let fulfilledCount = 0;
  let pendingCount = 0;

  for (const order of orders) {
    console.log(`------------------------------------------------------`);
    console.log(`Checking Shopify Order #${order.order_number || order.id} (${order.name})`);

    // Extract AliExpress Order IDs from tags
    const tags = (order.tags || '').split(',').map(t => t.trim());
    const idTags = tags.filter(t => t.startsWith('ali-id:'));

    if (idTags.length === 0) {
      console.warn(`⚠️ Could not find "ali-id:<id>" tag on order #${order.order_number}. Skipping.`);
      continue;
    }

    const aliOrderIds = idTags.map(t => t.replace('ali-id:', '').trim());
    console.log(`  🔍 Order #${order.order_number} has ${aliOrderIds.length} AliExpress Order(s): ${aliOrderIds.join(', ')}`);

    let orderFulfilledAny = false;

    for (const aliOrderId of aliOrderIds) {
      try {
        const trackingRes = await aliClient.getTrackingInfo(aliOrderId);

        // Extract tracking details from response
        const trackingDetails = trackingRes.result?.details || trackingRes.result || trackingRes;
        const trackingNo = trackingDetails.mail_no || 
                           trackingDetails.tracking_number || 
                           trackingDetails.logistics_no ||
                           (Array.isArray(trackingDetails) && trackingDetails[0]?.mail_no);

        const carrier = trackingDetails.logistics_service_name || 
                        trackingDetails.carrier || 
                        'AliExpress Standard Shipping';

        if (trackingNo) {
          console.log(`  🚚 Order #${aliOrderId} Shipped! Tracking Number: ${trackingNo} (${carrier})`);
          await shopifyClient.fulfillOrder(order.id, trackingNo, carrier);
          console.log(`  ✅ Shopify Order #${order.order_number} updated with tracking: ${trackingNo}`);
          orderFulfilledAny = true;
        } else {
          console.log(`  ⏳ Order #${aliOrderId}: Supplier has not generated tracking yet.`);
        }
      } catch (err) {
        console.error(`  ❌ Error querying tracking for AE Order #${aliOrderId}:`, err.message);
      }
    }

    if (orderFulfilledAny) {
      fulfilledCount++;
    } else {
      pendingCount++;
    }
  }

  console.log('\n======================================================');
  console.log(`   TRACKING SYNC SUMMARY`);
  console.log(`   Fulfilled in Shopify: ${fulfilledCount}`);
  console.log(`   Pending at Supplier:  ${pendingCount}`);
  console.log('======================================================\n');

  return { fulfilledCount, pendingCount, totalChecked: orders.length };
}

if (require.main === module) {
  syncTracking();
}

module.exports = { syncTracking };
