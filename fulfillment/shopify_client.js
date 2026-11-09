const https = require('https');
const config = require('./config');

class ShopifyClient {
  constructor() {
    this.domain = config.shopify.domain;
    this.token = config.shopify.token;
    this.apiVersion = config.shopify.apiVersion;
  }

  async getValidToken() {
    if (this.token) {
      return this.token;
    }
    if (config.shopify.clientId && config.shopify.clientSecret) {
      console.log('⏳ Fetching fresh Shopify access token via Client Credentials grant...');
      const newToken = await this.fetchAccessToken();
      this.token = newToken;
      return newToken;
    }
    throw new Error('Neither SHOPIFY_ADMIN_API_TOKEN nor SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are provided in fulfillment/.env');
  }

  fetchAccessToken() {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        client_id: config.shopify.clientId,
        client_secret: config.shopify.clientSecret,
        grant_type: 'client_credentials'
      });

      const req = https.request({
        hostname: this.domain,
        path: '/admin/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'SafePetStrap-Fulfillment/1.0'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300 && parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              reject(new Error(`Failed to obtain Shopify access token: ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            reject(new Error(`Shopify token parse error: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async makeRequest(path, method = 'GET', body = null, isRetry = false) {
    const token = await this.getValidToken();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.domain,
        path: `/admin/api/${this.apiVersion}${path}`,
        method: method,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
          'Connection': 'close',
          'User-Agent': 'SafePetStrap-Fulfillment/1.0'
        }
      };

      const req = https.request(options, async (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode === 401 && !isRetry && config.shopify.clientId) {
              console.log('🔄 Shopify token expired or unauthorized. Refreshing token...');
              this.token = null;
              await this.getValidToken();
              return resolve(await this.makeRequest(path, method, body, true));
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`Shopify API Error (${res.statusCode}): ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', async (err) => {
        if (!isRetry && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            return resolve(await this.makeRequest(path, method, body, true));
          } catch (retryErr) {
            return reject(retryErr);
          }
        }
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Fetch open, paid, unfulfilled orders that have not yet been placed on AliExpress
   */
  async getUnfulfilledOrders({ force = false, tagFilter = null } = {}) {
    const data = await this.makeRequest('/orders.json?status=open&financial_status=paid&fulfillment_status=unfulfilled&limit=100');
    const orders = data.orders || [];
    const tagPlaced = config.shopify.tagPlaced.toLowerCase();

    return orders.filter(order => {
      const tags = (order.tags || '').split(',').map(t => t.trim().toLowerCase());
      
      // If filtering by a specific trigger tag (e.g. 'fulfill-ali' or 'ae-placed')
      if (tagFilter) {
        return tags.includes(tagFilter.toLowerCase()) && !tags.some(t => t.startsWith('ali-id:'));
      }

      // If forcing, return all unfulfilled orders regardless of 'ali-placed' tag
      if (force) {
        return true;
      }

      // Default: skip orders already placed
      return !tags.includes('play') && !tags.includes(tagPlaced) && !tags.includes('ae-placed') && !tags.includes('ali-placed') && !tags.some(t => t.startsWith('ali-id:'));
    });
  }

  /**
   * Tag order and append order note with Order ID (sanitized with 'PLAY')
   */
  async tagOrderAsPlaced(order, aliOrderId, tagToRemove = null) {
    let existingTags = order.tags ? order.tags.split(',').map(t => t.trim()) : [];
    
    // Remove trigger tags and any legacy ae/ali tags
    existingTags = existingTags.filter(t => 
      !['fulfill-play', 'fulfill-ae', 'fulfill-ali', 'ae-placed', 'ali-placed'].includes(t.toLowerCase()) &&
      !t.toLowerCase().startsWith('ali-id:')
    );
    if (tagToRemove) {
      existingTags = existingTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase());
    }

    const idList = Array.isArray(aliOrderId) ? aliOrderId : [aliOrderId];

    // Always use PLAY tag
    if (!existingTags.includes('PLAY')) {
      existingTags.push('PLAY');
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const noteEntry = `Order ID: ${idList.join(', ')} - ${dateStr}`;

    // Clean out any legacy mentions of aliexpress or stale order IDs
    const cleanExisting = order.note
      ? order.note.split('\n').filter(line => !line.toLowerCase().includes('aliexpress') && !line.toLowerCase().includes('dropship') && !line.toLowerCase().startsWith('order id:') && line.trim().length > 0).join('\n')
      : '';

    const newNote = cleanExisting ? `${cleanExisting}\n${noteEntry}` : noteEntry;

    try {
      return await this.makeRequest(`/orders/${order.id}.json`, 'PUT', {
        order: {
          id: order.id,
          tags: existingTags.join(', '),
          note: newNote
        }
      });
    } catch (e) {
      console.warn(`  ⚠️ Notice: Shopify order tag could not be written on ${this.domain} (${e.message}). Order is safely tracked in placed_orders.json.`);
      return null;
    }
  }

  /**
   * Retrieve fulfillment orders for a specific order (Modern 2023+ Fulfillment API)
   */
  async getFulfillmentOrders(orderId) {
    const data = await this.makeRequest(`/orders/${orderId}/fulfillment_orders.json`);
    return data.fulfillment_orders || [];
  }

  /**
   * Fulfill order in Shopify with tracking number and company
   */
  async fulfillOrder(orderId, trackingNumber, trackingCompany = 'Standard Shipping', trackingUrl = '') {
    try {
      const fulfillmentOrders = await this.getFulfillmentOrders(orderId);
      const openFulfillmentOrder = fulfillmentOrders.find(fo => fo.status === 'open' || fo.status === 'in_progress');

      if (!openFulfillmentOrder) {
        console.warn(`⚠️ No open fulfillment order found for Shopify Order #${orderId}. It might already be fulfilled.`);
        return null;
      }

      const payload = {
        fulfillment: {
          line_items_by_fulfillment_order: [
            {
              fulfillment_order_id: openFulfillmentOrder.id
            }
          ],
          tracking_info: {
            number: trackingNumber,
            company: trackingCompany,
            url: trackingUrl || `https://t.17track.net/en#nums=${trackingNumber}`
          },
          notify_customer: true
        }
      };

      const res = await this.makeRequest('/fulfillments.json', 'POST', payload);

      // Add shipped tag to order
      const tagShipped = config.shopify.tagShipped;
      await this.makeRequest(`/orders/${orderId}.json`, 'PUT', {
        order: {
          id: orderId,
          tags: `${tagShipped}, tracking:${trackingNumber}`
        }
      });

      return res;
    } catch (err) {
      console.error(`❌ Error fulfilling Shopify Order #${orderId}:`, err.message);
      throw err;
    }
  }
}

module.exports = new ShopifyClient();
