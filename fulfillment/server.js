const http = require('http');
const url = require('url');
const config = require('./config');
const shopifyClient = require('./shopify_client');
const { placeSingleOrder, resetTags } = require('./order_sync');

const PORT = process.env.PORT || 3005;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'safepet_secret_key_2026';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({ raw: body });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health / Status endpoint
  if (pathname === '/' || pathname === '/status' || pathname === '/health') {
    try {
      const openOrders = await shopifyClient.getUnfulfilledOrders();
      sendJson(res, 200, {
        status: 'online',
        service: 'SafePet Strap AliExpress Fulfillment Engine',
        unfulfilledOrdersInQueue: openOrders.length,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      sendJson(res, 500, { status: 'error', message: err.message });
    }
    return;
  }

  // Optional Secret Verification
  const authHeader = req.headers['x-api-key'] || parsedUrl.query.key;
  if (WEBHOOK_SECRET && authHeader && authHeader !== WEBHOOK_SECRET) {
    sendJson(res, 401, { error: 'Unauthorized: Invalid x-api-key' });
    return;
  }

  // Reset tags endpoint
  if (pathname === '/reset-tags' && method === 'POST') {
    try {
      await resetTags();
      sendJson(res, 200, { success: true, message: 'All fulfillment tags reset in Shopify.' });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // Fulfill endpoint (Can be called by Shopify Flow or n8n)
  // Accepts:
  // 1. { "order_id": 7325939859686 } or { "order_number": 1162 }
  // 2. { "tag": "fulfill-ali" } (fulfills all orders tagged in Shopify Admin)
  // 3. { "all": true, "force": true }
  if (pathname === '/fulfill' && method === 'POST') {
    const payload = await parseBody(req);
    console.log(`\n📥 Received Fulfillment Webhook Request:`, JSON.stringify(payload));

    try {
      let ordersToProcess = [];

      // Case 1: Specific Order ID or Order Number
      const orderIdentifier = payload.order_id || payload.order_number || payload.id;
      if (orderIdentifier) {
        const cleanId = String(orderIdentifier).replace(/^[#SPS]+/, '').replace(/[^0-9]/g, '');
        const allOrders = await shopifyClient.makeRequest(
          '/orders.json?status=open&financial_status=paid&fulfillment_status=unfulfilled&limit=100'
        );
        ordersToProcess = (allOrders.orders || []).filter(o => 
          String(o.id) === cleanId || String(o.order_number) === cleanId || (o.name && o.name.includes(cleanId))
        );
      } 
      // Case 2: Filter by Tag (e.g. 'fulfill-ali' added in Shopify Admin)
      else if (payload.tag) {
        ordersToProcess = await shopifyClient.getUnfulfilledOrders({ tagFilter: payload.tag });
      } 
      // Case 3: Process all unfulfilled orders
      else {
        ordersToProcess = await shopifyClient.getUnfulfilledOrders({ force: Boolean(payload.force) });
      }

      if (ordersToProcess.length === 0) {
        sendJson(res, 200, {
          success: true,
          message: 'No matching unfulfilled orders found in Shopify.',
          processed: 0
        });
        return;
      }

      console.log(`Processing ${ordersToProcess.length} order(s)...`);
      const results = [];

      for (const order of ordersToProcess) {
        const result = await placeSingleOrder(order, { 
          isDryRun: Boolean(payload.dry_run),
          tagToRemove: payload.tag || null 
        });
        results.push({
          order_id: order.id,
          order_number: order.order_number,
          customer: order.shipping_address?.name,
          ...result
        });

        // Delay between orders
        if (!payload.dry_run) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      sendJson(res, 200, {
        success: true,
        processed: results.length,
        results
      });

    } catch (err) {
      console.error('❌ Server fulfillment error:', err.message);
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // Sync tracking numbers endpoint
  if (pathname === '/sync-tracking' && method === 'POST') {
    try {
      const { syncTracking } = require('./tracking_sync');
      const trackingResult = await syncTracking();
      sendJson(res, 200, { success: true, ...trackingResult });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Endpoint not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`   SAFEPET STRAP FULFILLMENT WEBHOOK SERVER ACTIVE`);
    console.log(`   Port: http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`     - GET  /status`);
    console.log(`     - POST /fulfill        (Body: { order_id } or { tag: "fulfill-ali" })`);
    console.log(`     - POST /sync-tracking  (Sync tracking numbers to Shopify)`);
    console.log(`     - POST /reset-tags     (Clear fulfillment tags in Shopify)`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
