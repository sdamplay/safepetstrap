const fs = require('fs');
const path = require('path');

// Load environment variables from .env in the fulfillment directory
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const TOKENS_FILE = path.join(__dirname, 'tokens.json');

function getTokens() {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) {
      console.warn('⚠️ Warning: Could not parse tokens.json');
    }
  }
  return null;
}

function saveTokens(tokensData) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokensData, null, 2), 'utf8');
}

module.exports = {
  shopify: {
    domain: process.env.SHOPIFY_STORE_DOMAIN || 'safepet-strap.myshopify.com',
    clientId: process.env.SHOPIFY_CLIENT_ID || '',
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
    token: process.env.SHOPIFY_ADMIN_API_TOKEN || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
    tagPlaced: process.env.TAG_PLACED || 'ali-placed',
    tagShipped: process.env.TAG_SHIPPED || 'ali-shipped'
  },
  aliexpress: {
    appKey: process.env.ALI_APP_KEY || '',
    appSecret: process.env.ALI_APP_SECRET || '',
    redirectUri: process.env.ALI_REDIRECT_URI || 'https://safepetstrap.com/callback',
    productId: process.env.ALI_PRODUCT_ID || '3256811984485167',
    products: {
      seatBelt: process.env.ALI_PRODUCT_ID_SEAT_BELT || '3256811984485167',
      harness: process.env.ALI_PRODUCT_ID_HARNESS || '3256806663780528',
      sticker: process.env.ALI_PRODUCT_ID_STICKER || '2255800752212310',
      tag: process.env.ALI_PRODUCT_ID_TAG || '3256808705434116',
      gps: process.env.ALI_PRODUCT_ID_GPS || '3256805685101130'
    },
    defaultPhone: process.env.DEFAULT_FALLBACK_PHONE || '18005550199',
    gateways: {
      sync: 'https://api-sg.aliexpress.com/sync',
      rest: 'https://api-sg.aliexpress.com/rest'
    }
  },
  getTokens,
  saveTokens
};
