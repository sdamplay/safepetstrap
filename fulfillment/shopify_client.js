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

      req.on('error', err => reject(err));

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
      return !tags.includes(tagPlaced) && !tags.includes('ae-placed') && !tags.includes('ali-placed') && !tags.some(t => t.startsWith('ali-id:'));
    });
  }

  /**
   * Tag order and append order note with AliExpress Order ID
   */
  async tagOrderAsPlaced(order, aliOrderId, tagToRemove = null) {
    const tagPlaced = config.shopify.tagPlaced;
    let existingTags = order.tags ? order.tags.split(',').map(t => t.trim()) : [];
    
    // Remove trigger tags (fulfill-ae, fulfill-ali, or custom tagToRemove)
    existingTags = existingTags.filter(t => t.toLowerCase() !== 'fulfill-ae' && t.toLowerCase() !== 'fulfill-ali');
    if (tagToRemove && tagToRemove.toLowerCase() !== 'ae-placed') {
      existingTags = existingTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase());
    }

    const idList = Array.isArray(aliOrderId) ? aliOrderId : [aliOrderId];

    // Clean out previous ali-id tags if retrying
    existingTags = existingTags.filter(t => !t.toLowerCase().startsWith('ali-id:'));

    if (!existingTags.includes(tagPlaced) && !existingTags.includes('ae-placed')) {
      existingTags.push('ae-placed');
    }
    for (const id of idList) {
      existingTags.push(`ali-id:${id}`);
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const noteEntry = `Order ID: ${idList.join(', ')} - ${dateStr}`;

    // Clean out any legacy mentions or stale order IDs if present in note
    const cleanExisting = order.note
      ? order.note.split('\n').filter(line => !line.toLowerCase().includes('aliexpress') && !line.toLowerCase().startsWith('order id:') && line.trim().length > 0).join('\n')
      : '';

    const newNote = cleanExisting ? `${cleanExisting}\n${noteEntry}` : noteEntry;

    return this.makeRequest(`/orders/${order.id}.json`, 'PUT', {
      order: {
        id: order.id,
        tags: existingTags.join(', '),
        note: newNote
      }
    });
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
  async fulfillOrder(orderId, trackingNumber, trackingCompany = 'AliExpress Standard Shipping', trackingUrl = '') {
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
