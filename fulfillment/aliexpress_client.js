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
      let tokens = config.getTokens();
      if (!tokens || !tokens.access_token) {
        throw new Error('Access token not found. Please run "npm run auth" first.');
      }

      // Proactive auto-refresh if token is within 2 minutes of expiration or already expired
      if (tokens.expire_time && Date.now() > (tokens.expire_time - 120000)) {
        try {
          tokens = await this.refreshToken();
        } catch (e) {
          console.warn('⚠️ Pre-expiry token refresh failed, proceeding with current token:', e.message);
        }
      }

      systemParams.session = tokens.access_token;
    }

    const allParams = { ...systemParams, ...businessParams };
    const signature = this.generateSignature(allParams, methodName.startsWith('/') ? methodName : '');
    allParams.sign = signature;

    const bodyData = new URLSearchParams(allParams).toString();

    const response = await new Promise((resolve, reject) => {
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

    // Reactive auto-refresh if AliExpress returns IllegalAccessToken
    if (
      requiresAuth &&
      response &&
      response.error_response &&
      (response.error_response.code === 'IllegalAccessToken' || 
       response.error_response.msg?.toLowerCase().includes('expired') ||
       response.error_response.msg?.toLowerCase().includes('invalid'))
    ) {
      console.warn('⚠️ AliExpress returned IllegalAccessToken. Auto-refreshing access token and retrying...');
      await this.refreshToken();
      return this.execute(methodName, businessParams, requiresAuth);
    }

    return response;
  }

  /**
   * OAuth API: Exchange authorization code for initial tokens
   */
  async createToken(authCode) {
    const apiMethod = '/auth/token/create';
    const timestamp = Date.now().toString();
    const params = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      code: authCode
    };

    const signature = this.generateSignature(params, apiMethod);
    params.sign = signature;

    const bodyData = new URLSearchParams(params).toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api-sg.aliexpress.com',
        path: '/rest' + apiMethod,
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
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ raw, statusCode: res.statusCode });
          }
        });
      });
      req.on('error', err => reject(err));
      req.write(bodyData);
      req.end();
    });
  }

  /**
   * OAuth API: Refresh AliExpress access token using refresh_token
   */
  async refreshToken() {
    const tokens = config.getTokens();
    if (!tokens || !tokens.refresh_token) {
      throw new Error('Cannot refresh token: No refresh_token found in tokens.json');
    }

    console.log('🔄 Refreshing AliExpress access token via Open Platform...');
    const apiMethod = '/auth/token/refresh';
    const timestamp = Date.now().toString();
    const params = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      refresh_token: tokens.refresh_token
    };

    const signature = this.generateSignature(params, apiMethod);
    params.sign = signature;

    const bodyData = new URLSearchParams(params).toString();

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api-sg.aliexpress.com',
        path: '/rest' + apiMethod,
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
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ raw, statusCode: res.statusCode });
          }
        });
      });
      req.on('error', err => reject(err));
      req.write(bodyData);
      req.end();
    });

    if (response && response.access_token) {
      const updatedTokens = {
        ...tokens,
        access_token: response.access_token,
        refresh_token: response.refresh_token || tokens.refresh_token,
        expires_in: response.expires_in,
        expire_time: response.expire_time || (Date.now() + (response.expires_in || 2592000) * 1000),
        refresh_token_valid_time: response.refresh_token_valid_time || tokens.refresh_token_valid_time,
        updated_at: new Date().toISOString()
      };
      config.saveTokens(updatedTokens);
      console.log('✅ Successfully refreshed AliExpress access token!');
      return updatedTokens;
    } else {
      console.error('❌ Failed to refresh AliExpress token:', JSON.stringify(response));
      throw new Error(`AliExpress token refresh failed: ${response.msg || response.sub_msg || JSON.stringify(response)}`);
    }
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
