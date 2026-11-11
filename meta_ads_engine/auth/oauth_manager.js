/**
 * Meta Ads Engine - OAuth 2.0 PKCE Manager & Local Callback Server
 * Resilient token validation, PKCE challenge generation, and token refresh.
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuditLogger } from '../logger/audit_logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('OAuthManager');

export class OAuthManager {
  constructor(config = {}) {
    this.configPath = path.resolve(__dirname, '../config/meta_config.json');
    this.config = config;
    this.apiVersion = config.apiVersion || 'v21.0';
    this.adAccountId = config.adAccountId ? String(config.adAccountId).replace(/^act_/, '') : '';
    this.appId = config.appId || process.env.META_APP_ID || '';
    this.appSecret = config.appSecret || process.env.META_APP_SECRET || '';
    this.accessToken = config.accessToken || process.env.META_ACCESS_TOKEN || '';
    this.port = 8080;
    this.redirectUri = config.redirectUri || `http://localhost:${this.port}/callback`;
  }

  /**
   * Helper for native https GET/POST
   */
  request(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const reqOpts = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = https.request(reqOpts, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`Meta API HTTP ${res.statusCode}: ${json.error?.message || body}`);
              err.response = json;
              err.statusCode = res.statusCode;
              reject(err);
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              const err = new Error(`HTTP ${res.statusCode}: ${body}`);
              err.statusCode = res.statusCode;
              reject(err);
            }
          }
        });
      });

      req.on('error', (err) => reject(err));

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Validate an existing Meta access token and check ad account access
   */
  async validateToken(tokenToTest = null) {
    const token = tokenToTest || this.accessToken;
    if (!token) {
      return { valid: false, reason: 'No access token provided.' };
    }

    logger.info('Validating Meta Access Token permissions...');
    try {
      // 1. Check token identity
      const me = await this.request(
        `https://graph.facebook.com/${this.apiVersion}/me?fields=id,name&access_token=${encodeURIComponent(token)}`
      );
      logger.success(`Token authenticated as: "${me.name}" (ID: ${me.id})`);

      // 2. Check Ad Account Access
      if (this.adAccountId) {
        const actUrl = `https://graph.facebook.com/${this.apiVersion}/act_${this.adAccountId}?fields=id,name,account_status,currency,amount_spent,timezone_name&access_token=${encodeURIComponent(token)}`;
        const account = await this.request(actUrl);

        const statusMap = {
          1: 'ACTIVE',
          2: 'DISABLED',
          3: 'UNSETTLED',
          7: 'PENDING_RISK_REVIEW',
          8: 'PENDING_SETTLEMENT',
          9: 'IN_GRACE_PERIOD',
          100: 'PENDING_CLOSURE',
          101: 'CLOSED'
        };

        const statusStr = statusMap[account.account_status] || `Code ${account.account_status}`;
        logger.success(`Target Ad Account: "${account.name}" (act_${this.adAccountId}) - Status: ${statusStr} [${account.currency}]`);

        if (account.account_status !== 1) {
          logger.warn(`Ad Account status is not ACTIVE (${statusStr}). Ads can be created in PAUSED state but cannot run until resolved.`);
        }

        return {
          valid: true,
          token,
          user: me,
          account
        };
      }

      return { valid: true, token, user: me };
    } catch (err) {
      logger.warn('Token validation failed:');
      logger.decodeMetaError(err, { action: 'Token Validation' });
      return { valid: false, reason: err.message, rawError: err.response };
    }
  }

  /**
   * PKCE Generation: code_verifier and code_challenge (S256)
   */
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  /**
   * Start local HTTP listener on port 8080 and await OAuth 2.0 authorization code
   */
  async startOAuthFlow() {
    if (!this.appId || !this.appSecret) {
      throw new Error(
        'Meta App ID and App Secret are required for OAuth 2.0 flow. Add them to meta_ads_engine/config/meta_config.json or pass META_APP_ID / META_APP_SECRET environment variables.'
      );
    }

    const { verifier, challenge } = this.generatePKCE();
    const scopes = ['ads_management', 'ads_read', 'pages_read_engagement', 'pages_manage_ads'].join(',');
    const authUrl = `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(
      this.redirectUri
    )}&scope=${encodeURIComponent(scopes)}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`;

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🔑 META BUSINESS OAUTH 2.0 PKCE AUTHORIZATION REQUIRED');
    logger.info('Please open the following authorization URL in your browser:');
    logger.info(authUrl);
    logger.info(`Listening for callback on ${this.redirectUri}...`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const parsed = new URL(req.url, `http://localhost:${this.port}`);
          if (parsed.pathname === '/callback') {
            const code = parsed.searchParams.get('code');
            const error = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`<h1>OAuth Failed</h1><p>${error}</p>`);
              server.close();
              return reject(new Error(`OAuth error: ${error}`));
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Missing Code</h1>');
              return;
            }

            logger.info('Authorization code received! Exchanging for Access Token...');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family:sans-serif; text-align:center; padding:50px;">
                  <h1 style="color:#16A34A;">✓ Authorization Successful!</h1>
                  <p>Meta Ads Engine has received your token. You can close this window now.</p>
                </body>
              </html>
            `);

            server.close();

            // 1. Exchange code for short-lived token
            const tokenUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?client_id=${this.appId}&redirect_uri=${encodeURIComponent(
              this.redirectUri
            )}&client_secret=${this.appSecret}&code=${code}&code_verifier=${verifier}`;

            const tokenRes = await this.request(tokenUrl);
            const shortLivedToken = tokenRes.access_token;

            // 2. Exchange short-lived token for 60-day long-lived token
            logger.info('Exchanging for Long-Lived System User Token (60 Days)...');
            const longLivedUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.appId}&client_secret=${this.appSecret}&fb_exchange_token=${shortLivedToken}`;

            const longRes = await this.request(longLivedUrl);
            const finalToken = longRes.access_token || shortLivedToken;

            // Save to config file
            this.saveTokenToConfig(finalToken);
            logger.success('Long-Lived Meta Access Token acquired and saved to meta_config.json!');
            resolve(finalToken);
          }
        } catch (e) {
          server.close();
          reject(e);
        }
      });

      server.listen(this.port, () => {
        logger.info(`OAuth listener active on http://localhost:${this.port}`);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use. Please free port ${this.port} or update redirectUri in meta_config.json.`);
        }
        reject(err);
      });
    });
  }

  saveTokenToConfig(token) {
    this.accessToken = token;
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const json = JSON.parse(raw);
        json.accessToken = token;
        fs.writeFileSync(this.configPath, JSON.stringify(json, null, 2), 'utf8');
      }
    } catch (e) {
      logger.warn(`Could not persist token to ${this.configPath}: ${e.message}`);
    }
  }
}
