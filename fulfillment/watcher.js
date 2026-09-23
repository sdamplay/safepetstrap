const config = require('./config');
const shopifyClient = require('./shopify_client');
const { placeSingleOrder } = require('./order_sync');

const POLL_INTERVAL_MS = parseInt(process.env.WATCHER_INTERVAL_MS, 10) || 15000;
const TRIGGER_TAG = process.env.TRIGGER_TAG || 'fulfill-ae';

let isProcessing = false;

async function checkAndFulfill() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let orders = await shopifyClient.getUnfulfilledOrders({ tagFilter: TRIGGER_TAG });
    let activeTag = TRIGGER_TAG;
    if (orders.length === 0 && TRIGGER_TAG === 'fulfill-ae') {
      const legacyOrders = await shopifyClient.getUnfulfilledOrders({ tagFilter: 'fulfill-ali' });
      if (legacyOrders.length > 0) {
        orders = legacyOrders;
        activeTag = 'fulfill-ali';
      }
    }

    if (orders.length > 0) {
      console.log(`\n🔔 [BOT] Found ${orders.length} order(s) tagged "${activeTag}"! Starting fulfillment...`);
      for (const order of orders) {
        console.log(`\n🤖 Auto-fulfilling Order #${order.order_number} (${order.name})...`);
        const res = await placeSingleOrder(order, { tagToRemove: activeTag });
        if (res.status === 'success') {
          console.log(`✅ Order #${order.order_number} fulfilled on AliExpress: ${res.aliOrderIds.join(', ')}`);
        } else {
          console.error(`❌ Order #${order.order_number} fulfillment status:`, res);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      console.log(`\n💡 Next Step: Go to https://www.aliexpress.com/orderList.htm to pay in 1 click!\n`);
    }
  } catch (err) {
    console.error('⚠️ [BOT] Watcher check error:', err.message);
  } finally {
    isProcessing = false;
  }
}

console.log('\n======================================================');
console.log('   SAFEPET STRAP -> ALIEXPRESS LIVE ORDER WATCHER BOT');
console.log(`   Watching for orders tagged: "${TRIGGER_TAG}"`);
console.log(`   Poll interval: Every ${POLL_INTERVAL_MS / 1000} seconds`);
console.log('   Workflow:');
console.log('     1. Select orders in Shopify Admin');
console.log(`     2. Click "More actions" -> "Add tags" -> "${TRIGGER_TAG}"`);
console.log('     3. Bot automatically places orders on AliExpress & updates Shopify!');
console.log('======================================================\n');

checkAndFulfill();
setInterval(checkAndFulfill, POLL_INTERVAL_MS);
