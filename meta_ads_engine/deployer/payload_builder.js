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
    this.productUrl = config.productUrl || 'https://www.safepetstrap.com/products/dog-seat-belt';
    this.accessToken = config.accessToken || '';
    this.enforcePaused = true; // STRICT CONSTRAINT: NEVER DEPLOY ACTIVE
  }

  /**
   * Helper to execute Graph API POST (native application/json matching v21.0 spec)
   */
  async _post(endpoint, data) {
    const jsonPayload = JSON.stringify({
      ...data,
      access_token: this.accessToken
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/${this.apiVersion}/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonPayload)
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
      req.write(jsonPayload);
      req.end();
    });
  }

  /**
   * 1. Create Campaign (Strictly PAUSED, CBO, OUTCOME_SALES)
   */
  async createCampaign({ name, dailyBudgetCents = 1500, objective = 'OUTCOME_SALES' }) {
    logger.info(`Building Campaign: "${name}" ($${(dailyBudgetCents / 100).toFixed(2)}/day CBO)...`);

    const payload = {
      name,
      objective,
      status: 'PAUSED', // ENFORCED
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
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
   * 2. Create Ad Set (Ad Set ON by default while parent Campaign stays PAUSED)
   */
  async createAdSet({
    campaignId,
    name,
    status = 'ACTIVE',
    countries = ['US'],
    ageMin = 21,
    ageMax = 65,
    genders = null,
    interests = null,
    targeting = null,
    advantageAudience = null
  }) {
    logger.info(`Building Ad Set: "${name}" for Campaign ${campaignId}...`);

    const hasExplicitConstraints = Boolean((genders && genders.length > 0) || (interests && interests.length > 0));
    const resolvedAdvantage = advantageAudience !== null ? advantageAudience : hasExplicitConstraints ? 0 : 1;

    const resolvedTargeting = targeting || {
      geo_locations: {
        countries
      },
      age_min: ageMin,
      age_max: ageMax,
      targeting_automation: {
        advantage_audience: resolvedAdvantage
      }
    };

    if (!targeting) {
      if (genders && genders.length > 0) {
        resolvedTargeting.genders = genders;
      }
      if (interests && interests.length > 0) {
        resolvedTargeting.flexible_spec = [
          {
            interests: interests.map((item) => ({
              id: String(item.id),
              name: String(item.name)
            }))
          }
        ];
      }
    }

    const payload = {
      campaign_id: campaignId,
      name,
      status,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: {
        pixel_id: this.pixelId,
        custom_event_type: 'PURCHASE'
      },
      targeting: resolvedTargeting
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/adsets`, payload);
      logger.success(`✓ Ad Set created in ${status} state! ID: ${res.id}`);
      return { id: res.id, name, status };
    } catch (err) {
      logger.decodeMetaError(err, { action: 'Create AdSet', entity: name });
      throw err;
    }
  }

  /**
   * 3. Create Ad Creative (Single Image or Single Video)
   */
  async createCreative({
    name,
    imageHash,
    videoId,
    primaryText,
    headline,
    description,
    linkUrl,
    callToAction = 'GET_OFFER',
    urlTags = ''
  }) {
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
            type: callToAction,
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
            type: callToAction,
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
    if (urlTags) {
      payload.url_tags = urlTags;
    }

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
   * 4. Create Ad (Ad ON by default while parent Campaign stays PAUSED)
   */
  async createAd({ adsetId, creativeId, name, status = 'ACTIVE' }) {
    logger.info(`Building Ad: "${name}" linking Creative ${creativeId} to AdSet ${adsetId}...`);

    const payload = {
      name,
      adset_id: adsetId,
      creative: {
        creative_id: creativeId
      },
      status
    };

    try {
      const res = await this._post(`act_${this.adAccountId}/ads`, payload);
      logger.success(`✓ Ad created in ${status} state! ID: ${res.id}`);
      return { id: res.id, name, status };
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
            'ACTIVE', // Ad Set Status
            'OFFSITE_CONVERSIONS',
            'IMPRESSIONS',
            escapeCsv(this.pixelId),
            'PURCHASE',
            'US',
            '18',
            '65',
            '', // Ad ID
            escapeCsv(ad.name),
            'ACTIVE', // Ad Status
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
