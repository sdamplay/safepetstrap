/**
 * Meta Ads Engine - Payload Builder & Dual-Output CSV Generator
 * Constructs strictly PAUSED Campaign -> AdSet -> Creative -> Ad hierarchy
 * and compiles Meta_Ads_Manager_Bulk_Import.csv fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { AuditLogger } from '../logger/audit_logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('PayloadBuilder');

export class PayloadBuilder {
  constructor(config = {}) {
    this.apiVersion = config.apiVersion || 'v21.0';
    this.adAccountId = String(config.adAccountId || '').replace(/^act_/, '');
    this.pageId = String(config.pageId || '');
    this.pixelId = String(config.pixelId || '');
    this.productUrl = config.productUrl || 'https://safepetstrap.com/products/dog-seat-belt';
    this.accessToken = config.accessToken || '';
    this.enforcePaused = true; // STRICT CONSTRAINT: NEVER DEPLOY ACTIVE
  }

  /**
   * Helper to execute Graph API POST
   */
  async _post(endpoint, data) {
    const postData = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'object' && v !== null) {
        postData.append(k, JSON.stringify(v));
      } else if (v !== undefined && v !== null) {
        postData.append(k, String(v));
      }
    }
    postData.append('access_token', this.accessToken);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/${this.apiVersion}/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData.toString())
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`Meta API error: ${json.error?.message || body}`);
              err.response = json;
              err.statusCode = res.statusCode;
              reject(err);
            }
          } catch {
            reject(new Error(`Invalid response: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData.toString());
      req.end();
    });
  }

  /**
   * 1. Create Campaign (Strictly PAUSED, CBO, OUTCOME_SALES)
   */
  async createCampaign({ name, dailyBudgetCents = 1500 }) {
    logger.info(`Building Campaign: "${name}" ($${(dailyBudgetCents / 100).toFixed(2)}/day CBO)...`);

    const payload = {
      name,
      objective: 'OUTCOME_SALES',
      status: 'PAUSED', // ENFORCED
      special_ad_categories: ['NONE'],
      daily_budget: dailyBudgetCents,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/campaigns`, payload);
      logger.success(`✓ Campaign created in PAUSED state! ID: ${res.id}`);
      return { id: res.id, name, status: 'PAUSED' };
    } catch (err) {
      logger.decodeMetaError(err, { action: 'Create Campaign', entity: name });
      throw err;
    }
  }

  /**
   * 2. Create Ad Set (Strictly PAUSED, Offsite Conversions / Purchase)
   */
  async createAdSet({ campaignId, name }) {
    logger.info(`Building Ad Set: "${name}" for Campaign ${campaignId}...`);

    const payload = {
      campaign_id: campaignId,
      name,
      status: 'PAUSED', // ENFORCED
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: {
        pixel_id: this.pixelId,
        custom_event_type: 'PURCHASE'
      },
      targeting: {
        geo_locations: {
          countries: ['US']
        },
        age_min: 18,
        age_max: 65,
        targeting_automation: {
          advantage_audience: 1
        }
      }
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/adsets`, payload);
      logger.success(`✓ Ad Set created in PAUSED state! ID: ${res.id}`);
      return { id: res.id, name, status: 'PAUSED' };
    } catch (err) {
      logger.decodeMetaError(err, { action: 'Create AdSet', entity: name });
      throw err;
    }
  }

  /**
   * 3. Create Ad Creative (Single Image or Single Video)
   */
  async createCreative({ name, imageHash, videoId, primaryText, headline, description, linkUrl }) {
    logger.info(`Building Ad Creative: "${name}"...`);

    const destLink = linkUrl || this.productUrl;
    let objectStorySpec;

    if (videoId) {
      objectStorySpec = {
        page_id: this.pageId,
        video_data: {
          video_id: videoId,
          image_url: `https://graph.facebook.com/${this.apiVersion}/${videoId}/thumbnails`,
          title: headline,
          message: primaryText,
          call_to_action: {
            type: 'GET_OFFER',
            value: {
              link: destLink
            }
          }
        }
      };
    } else {
      objectStorySpec = {
        page_id: this.pageId,
        link_data: {
          image_hash: imageHash,
          link: destLink,
          message: primaryText,
          name: headline,
          description: description || '',
          call_to_action: {
            type: 'GET_OFFER',
            value: {
              link: destLink
            }
          }
        }
      };
    }

    const payload = {
      name,
      object_story_spec: objectStorySpec
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/adcreatives`, payload);
      logger.success(`✓ Ad Creative created! ID: ${res.id}`);
      return { id: res.id, name };
    } catch (err) {
      logger.decodeMetaError(err, { action: 'Create Ad Creative', entity: name });
      throw err;
    }
  }

  /**
   * 4. Create Ad (Strictly PAUSED, links AdSet + Creative)
   */
  async createAd({ adsetId, creativeId, name }) {
    logger.info(`Building Ad: "${name}" linking Creative ${creativeId} to AdSet ${adsetId}...`);

    const payload = {
      name,
      adset_id: adsetId,
      creative: {
        creative_id: creativeId
      },
      status: 'PAUSED' // ENFORCED
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/ads`, payload);
      logger.success(`✓ Ad created in PAUSED state! ID: ${res.id}`);
      return { id: res.id, name, status: 'PAUSED' };
    } catch (err) {
      logger.decodeMetaError(err, { action: 'Create Ad', entity: name });
      throw err;
    }
  }

  /**
   * DUAL-OUTPUT GUARANTEE:
   * Generate Meta_Ads_Manager_Bulk_Import.csv for 1-click manual upload fallback.
   */
  generateBulkImportCsv(campaignBatches = []) {
    logger.info('Generating Meta Ads Manager Bulk Import CSV (Dual-Output Guarantee)...');

    const headers = [
      'Campaign ID',
      'Campaign Name',
      'Campaign Status',
      'Campaign Objective',
      'Buying Type',
      'Campaign Daily Budget',
      'Bid Strategy',
      'Special Ad Category',
      'Ad Set ID',
      'Ad Set Name',
      'Ad Set Status',
      'Optimization Goal',
      'Billing Event',
      'Pixel ID',
      'Conversion Event',
      'Countries',
      'Min Age',
      'Max Age',
      'Ad ID',
      'Ad Name',
      'Ad Status',
      'Facebook Page ID',
      'Link URL',
      'Title',
      'Body',
      'Link Description',
      'Call to Action',
      'Image Hash / File'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = [];
    rows.push(headers.join(','));

    for (const camp of campaignBatches) {
      const campName = camp.name;
      const budget = (camp.dailyBudgetCents / 100).toFixed(2);

      for (const adset of camp.adsets || []) {
        const adsetName = adset.name;

        for (const ad of adset.ads || []) {
          const row = [
            '', // Campaign ID
            escapeCsv(campName),
            'PAUSED', // Campaign Status
            'OUTCOME_SALES',
            'AUCTION',
            budget,
            'LOWEST_COST_WITHOUT_CAP',
            'NONE',
            '', // Ad Set ID
            escapeCsv(adsetName),
            'PAUSED', // Ad Set Status
            'OFFSITE_CONVERSIONS',
            'IMPRESSIONS',
            escapeCsv(this.pixelId),
            'PURCHASE',
            'US',
            '18',
            '65',
            '', // Ad ID
            escapeCsv(ad.name),
            'PAUSED', // Ad Status
            escapeCsv(this.pageId),
            escapeCsv(ad.linkUrl || this.productUrl),
            escapeCsv(ad.headline),
            escapeCsv(ad.primaryText),
            escapeCsv(ad.description || ''),
            'GET_OFFER',
            escapeCsv(ad.imageHash || path.basename(ad.mediaPath || ''))
          ];
          rows.push(row.join(','));
        }
      }
    }

    const csvContent = rows.join('\r\n');

    // Save to ~/Downloads, ~/Desktop, and meta_ads_engine/exports/
    const targets = [
      path.join(os.homedir(), 'Downloads', 'Meta_Ads_Manager_Bulk_Import.csv'),
      path.join(os.homedir(), 'Desktop', 'Meta_Ads_Manager_Bulk_Import.csv'),
      path.resolve(__dirname, '../exports/Meta_Ads_Manager_Bulk_Import.csv')
    ];

    for (const t of targets) {
      try {
        const dir = path.dirname(t);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(t, csvContent, 'utf8');
        logger.success(`✓ Generated Bulk Import CSV at: ${t}`);
      } catch (e) {
        logger.warn(`Could not write CSV to ${t}: ${e.message}`);
      }
    }

    return {
      success: true,
      paths: targets,
      recordCount: rows.length - 1
    };
  }
}
