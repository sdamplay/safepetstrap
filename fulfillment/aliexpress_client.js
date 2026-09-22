const crypto = require('crypto');
const https = require('https');
const { URLSearchParams } = require('url');
const config = require('./config');

class AliExpressClient {
  constructor() {
    this.appKey = config.aliexpress.appKey;
    this.appSecret = config.aliexpress.appSecret;
    this.gatewayUrl = 'https://api-sg.aliexpress.com/sync';
    this.partnerId = 'iop-sdk-python-20220609';
  }

  /**
   * Generates the official AliExpress IOP HMAC-SHA256 signature
   * Protocol: Concatenates ASCII-sorted key+value pairs,
   * then computes HMAC-SHA256 using the appSecret.
   */
  generateSignature(params, apiMethod = '') {
    const sortedKeys = Object.keys(params).sort();
    let baseString = '';

    // If method starts with / (REST protocol path)
    if (apiMethod && apiMethod.startsWith('/')) {
      baseString = apiMethod;
    }

    for (const key of sortedKeys) {
      if (params[key] !== undefined && params[key] !== null) {
        baseString += `${key}${params[key]}`;
      }
    }

    return crypto
      .createHmac('sha256', this.appSecret)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Core request dispatcher to AliExpress IOP Gateway (/sync)
   */
  async execute(methodName, businessParams = {}, requiresAuth = true) {
    if (!this.appKey || !this.appSecret) {
      throw new Error('AliExpress App Key and App Secret must be defined in fulfillment/.env');
    }

    const timestamp = Date.now().toString();

    const systemParams = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      partner_id: this.partnerId,
      format: 'json',
      simplify: 'true',
      method: methodName
    };

    if (requiresAuth) {
      const tokens = config.getTokens();
      if (!tokens || !tokens.access_token) {
        throw new Error('Access token not found. Please run "npm run auth" first.');
      }
      systemParams.session = tokens.access_token;
    }

    const allParams = { ...systemParams, ...businessParams };
    const signature = this.generateSignature(allParams, methodName.startsWith('/') ? methodName : '');
    allParams.sign = signature;

    const bodyData = new URLSearchParams(allParams).toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api-sg.aliexpress.com',
        path: '/sync',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'Content-Length': Buffer.byteLength(bodyData),
          'User-Agent': this.partnerId
        }
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch (e) {
            resolve({ rawResponse: raw, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', err => reject(err));
      req.write(bodyData);
      req.end();
    });
  }

  /**
   * Business API: Retrieve Dropshipping Product Details & SKU Variants
   */
  async getProductDetails(productId, shipToCountry = 'US') {
    return this.execute('aliexpress.ds.product.get', {
      product_id: productId,
      ship_to_country: shipToCountry,
      target_currency: 'USD'
    }, true);
  }

  /**
   * Business API: Place dropshipping order on AliExpress
   * Orders are created in "Awaiting Payment" status for 1-click batch payment
   */
  async placeOrder(placeOrderDto) {
    return this.execute('aliexpress.trade.buy.placeorder', {
      param_place_order_request4_open_api_d_t_o: typeof placeOrderDto === 'string'
        ? placeOrderDto
        : JSON.stringify(placeOrderDto)
    }, true);
  }

  /**
   * Business API: Query logistics tracking number for placed order
   */
  async getTrackingInfo(orderId, toArea = 'US') {
    return this.execute('aliexpress.logistics.ds.trackinginfo.query', {
      order_id: orderId,
      to_area: toArea
    }, true);
  }

  /**
   * Business API: Get dropshipping order detail
   */
  async getOrderDetail(orderId) {
    return this.execute('aliexpress.trade.ds.order.get', {
      single_order_query: JSON.stringify({ order_id: orderId })
    }, true);
  }
}

module.exports = new AliExpressClient();
