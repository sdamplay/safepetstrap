/**
 * Meta Ads Engine - Quick Token Setter & Tester
 * Usage: node meta_ads_engine/set_token.js [ACCESS_TOKEN]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuthManager } from './auth/oauth_manager.js';
import { AuditLogger } from './logger/audit_logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('SetToken');

const configPath = path.resolve(__dirname, 'config/meta_config.json');
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const tokenArg = process.argv[2];

if (!tokenArg) {
  logger.info('Usage: node meta_ads_engine/set_token.js <YOUR_META_ACCESS_TOKEN>');
  logger.info('Or export META_ACCESS_TOKEN="<YOUR_TOKEN>" and run node meta_ads_engine/deploy_ads.js');
  process.exit(1);
}

const trimmedToken = tokenArg.trim();
config.accessToken = trimmedToken;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
logger.success('Token saved to meta_ads_engine/config/meta_config.json!');

const oauth = new OAuthManager(config);
logger.info('Testing token against Meta Graph API and Ad Account...');

oauth.validateToken(trimmedToken).then((res) => {
  if (res.valid) {
    logger.success('🎉 Token is VALID and verified against Target Ad Account act_' + config.adAccountId + '!');
    logger.info('You can now run: node meta_ads_engine/deploy_ads.js to deploy all ads to Meta in PAUSED state.');
  } else {
    logger.error('❌ Token verification failed: ' + res.reason);
  }
});
