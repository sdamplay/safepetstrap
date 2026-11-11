/**
 * Meta Ads Engine - Audit Logger & Knowledge Base Error Decoder
 * Resilient logging with Meta Graph API subcode error analysis.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const ERROR_KNOWLEDGE_BASE = {
  1885183: {
    title: 'App in Development Mode',
    cause: 'Ads creative post was created by an app that is in development mode or missing a Privacy Policy URL.',
    remedy: 'Go to https://developers.facebook.com > Your App > App Settings > Basic. Ensure a valid Privacy Policy URL is saved, then toggle the App Mode switch from "Development" to "Live".'
  },
  1885374: {
    title: 'Invalid Ad Format in Asset Feed',
    cause: 'Missing ad format specification in the creative or asset feed spec.',
    remedy: 'Explicitly specify ad_formats: ["SINGLE_IMAGE"] or ["SINGLE_VIDEO"] in the payload builder.'
  },
  3858749: {
    title: 'Missing Facebook Page Permission',
    cause: 'The authenticated Meta access token lacks ADVERTISE or CREATE_CONTENT tasks on the target Facebook Page ID.',
    remedy: 'Open Meta Business Suite / Business Settings (business.facebook.com) > Pages > Select your Page > Assign People or System User > Enable "Create Ads" and "Manage Page" permissions.'
  },
  190: {
    title: 'Access Token Expired or Invalid',
    cause: 'The OAuth access token is invalid, expired, or the user password/session was revoked.',
    remedy: 'Re-authenticate using the OAuth PKCE flow (npm run auth / deploy_ads.js) or generate a fresh System User Access Token with ads_management and pages_manage_ads permissions.'
  },
  1487390: {
    title: 'Ad Account Payment or Billing Block',
    cause: 'The ad account has an outstanding balance, lacks a valid payment method, or is flagged.',
    remedy: 'Visit Meta Ads Manager > Payment Settings (adsmanager.facebook.com/ads/manager/account_settings/information) and verify a primary card/PayPal is active.'
  },
  1885025: {
    title: 'Advantage Audience / Targeting Automation Conflict',
    cause: 'Targeting specification conflicts with Advantage+ audience rules.',
    remedy: 'Adjust age_min/age_max or check targeting_automation flags in adset payload.'
  }
};

class AuditLogger {
  constructor(moduleName = 'MetaAdsEngine') {
    this.moduleName = moduleName;
    this.logFile = path.join(LOGS_DIR, `execution_${new Date().toISOString().slice(0, 10)}.log`);
  }

  _format(level, color, msg, data) {
    const timestamp = new Date().toISOString();
    const tag = `[${timestamp}] [${this.moduleName}] [${level}]`;
    const consoleMsg = `${color}${COLORS.bright}${tag}${COLORS.reset} ${msg}`;
    console.log(consoleMsg);

    if (data !== undefined) {
      if (typeof data === 'object') {
        console.log(`${COLORS.dim}${JSON.stringify(data, null, 2)}${COLORS.reset}`);
      } else {
        console.log(`${COLORS.dim}${data}${COLORS.reset}`);
      }
    }

    const fileMsg = `${tag} ${msg} ${data !== undefined ? JSON.stringify(data) : ''}\n`;
    try {
      fs.appendFileSync(this.logFile, fileMsg, 'utf8');
    } catch {
      // non-blocking
    }
  }

  info(msg, data) {
    this._format('INFO', COLORS.cyan, msg, data);
  }

  success(msg, data) {
    this._format('SUCCESS', COLORS.green, msg, data);
  }

  warn(msg, data) {
    this._format('WARN', COLORS.yellow, msg, data);
  }

  error(msg, data) {
    this._format('ERROR', COLORS.red, msg, data);
  }

  validate(msg, pass = true, details = null) {
    const symbol = pass ? '✓' : '✗';
    const color = pass ? COLORS.green : COLORS.red;
    const text = `${symbol} ${msg}`;
    this._format('VALIDATE', color, text, details);
  }

  /**
   * Decode Meta Graph API error response and write a detailed markdown report
   */
  decodeMetaError(err, context = {}) {
    let errorObj = null;
    if (err && err.response && err.response.error) {
      errorObj = err.response.error;
    } else if (err && err.error) {
      errorObj = err.error;
    } else if (typeof err === 'object') {
      errorObj = err;
    } else {
      errorObj = { message: String(err) };
    }

    const code = errorObj.code || (err && err.statusCode) || 'Unknown';
    const subcode = errorObj.error_subcode || 'N/A';
    const fbtrace = errorObj.fbtrace_id || 'N/A';
    const message = errorObj.message || String(err);
    const userTitle = errorObj.error_user_title || '';
    const userMsg = errorObj.error_user_msg || '';

    let diagnosis = ERROR_KNOWLEDGE_BASE[subcode] || ERROR_KNOWLEDGE_BASE[code] || null;

    if (!diagnosis) {
      if (message.toLowerCase().includes('permissions') || message.toLowerCase().includes('permission')) {
        diagnosis = ERROR_KNOWLEDGE_BASE[3858749];
      } else if (message.toLowerCase().includes('token') || message.toLowerCase().includes('session')) {
        diagnosis = ERROR_KNOWLEDGE_BASE[190];
      }
    }

    this.error(`Meta API Error Caught: [Code: ${code} / Subcode: ${subcode}]`);
    this.error(`Message: ${message}`);
    if (diagnosis) {
      this.warn(`💡 Known Pattern: ${diagnosis.title}`);
      this.warn(`Cause: ${diagnosis.cause}`);
      this.warn(`Remedy: ${diagnosis.remedy}`);
    }

    // Write last_error_report.md
    const reportPath = path.join(LOGS_DIR, 'last_error_report.md');
    const md = `# Meta API Error Report & Remediation Guide

**Timestamp**: ${new Date().toISOString()}  
**Target Action**: ${context.action || 'Deploying Meta Ads Entity'}  
**Entity**: ${context.entity || 'N/A'}  

---

## 1. Raw Meta API Error Response
- **Error Code**: \`${code}\`
- **Error Subcode**: \`${subcode}\`
- **FBTrace ID**: \`${fbtrace}\`
- **Error Message**: ${message}
${userTitle ? `- **User Title**: ${userTitle}` : ''}
${userMsg ? `- **User Detail**: ${userMsg}` : ''}

---

## 2. Root Cause Analysis
${diagnosis ? `**${diagnosis.title}**\n\n${diagnosis.cause}` : 'Unclassified Meta error. Review payload and ad account permissions.'}

---

## 3. Concrete Step-by-Step Resolution Steps
${diagnosis ? `1. ${diagnosis.remedy}\n2. Once resolved, re-run \`node meta_ads_engine/deploy_ads.js\`.\n3. The engine will resume seamlessly.` : '1. Verify Ad Account ID and Page ID access in Meta Business Settings.\n2. Ensure access token has `ads_management`, `pages_manage_ads` scopes.\n3. Inspect `last_error_report.md` context.'}

---

## 4. Context Payload Dump
\`\`\`json
${JSON.stringify({ context, rawError: errorObj }, null, 2)}
\`\`\`
`;

    fs.writeFileSync(reportPath, md, 'utf8');
    this.info(`📄 Detailed error report written to: ${reportPath}`);

    return {
      code,
      subcode,
      fbtrace,
      message,
      diagnosis,
      reportPath
    };
  }
}

export { AuditLogger, COLORS };
