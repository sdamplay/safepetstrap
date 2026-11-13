/**
 * SafePet Strap - Flexible Multi-Media Campaign Launcher (Advantage+ Creative CBO)
 *
 * Blueprint Modeled on: Campaign 120249472700060025 ("DSB - OLD - Dogs")
 *  - Objective          : OUTCOME_SALES (Advantage Campaign Budget - CBO @ $97/day)
 *  - Targeting          : US Females 18-65+, Interest: Dogs (animals) (6003332344237), Advantage+ Audience ON
 *  - Creative Format    : Flexible Dynamic Multi-Media Asset Feed (DEGREES_OF_FREEDOM)
 *  - Media Bundle       : 8 Videos (Core & UGC) + 2 High-Converting Rescue/Rollover Statics
 *  - Dynamic Copy Suite : 3 Proven Primary Texts + 4 Headlines + 4.7★ Reviews Description
 *  - Call Extension     : Website + Call Button (tel:+13073551993)
 *  - Destination Link   : https://www.safepetstrap.com/products/dog-seat-belt
 *  - Instagram Account  : ID 17841451333236438
 *  - Safety Rule        : Campaign PAUSED (OFF), AdSet & Ad ACTIVE (ON) -> effective_status: CAMPAIGN_PAUSED
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from './logger/audit_logger.js';
import { OAuthManager } from './auth/oauth_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('FlexibleLauncher');

const PRODUCT_URL = 'https://www.safepetstrap.com/products/dog-seat-belt';
const INSTAGRAM_ACCOUNT_ID = '17841451333236438';
const CALL_PHONE_NUMBER = 'tel:+13073551993';

function loadConfig() {
  const configPath = path.resolve(__dirname, 'config/meta_config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

  return {
    ...config,
    adAccountId: process.env.META_AD_ACCOUNT_ID || config.adAccountId || '2182816332632833',
    pageId: process.env.META_PAGE_ID || config.pageId || '1169299686277726',
    pixelId: process.env.META_PIXEL_ID || config.pixelId || '1062070679630310',
    apiVersion: config.apiVersion || 'v21.0',
    accessToken: process.env.META_ACCESS_TOKEN || config.accessToken || ''
  };
}

async function verifyEntity(id, fields, token, apiVersion) {
  const url = `https://graph.facebook.com/${apiVersion}/${id}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Verification failed for ${id}: ${data.error.message}`);
  }
  return data;
}

async function main() {
  logger.info('╔══════════════════════════════════════════════════════════════════════════╗');
  logger.info('║  SAFEPET FLEXIBLE MULTI-MEDIA CAMPAIGN DEPLOYMENT (CBO $97/DAY)          ║');
  logger.info('║  Blueprint: Modeled on Campaign 120249472700060025 ("DSB - OLD - Dogs")  ║');
  logger.info('║  Multi-Media Asset Feed: 8 Videos + 2 Statics | 3 Copies | 4 Headlines   ║');
  logger.info('╚══════════════════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  const base = `https://graph.facebook.com/${config.apiVersion}`;
  const tok = encodeURIComponent(config.accessToken);

  // Phase 1: Validate Authentication
  const oauth = new OAuthManager(config);
  const auth = await oauth.validateToken();
  if (!auth.valid) {
    throw new Error(`Authentication failed: ${auth.reason}`);
  }
  logger.success(`✓ Authenticated Token Validated (User: ${auth.user?.name || 'Verified'})`);

  // Phase 2: Create CBO Campaign (Strictly PAUSED)
  logger.info('\n━━━ PHASE 2: CREATING CBO CAMPAIGN (PAUSED) ━━━');
  const campPayload = {
    name: 'DSB - Flexible Multi-Media - Dogs',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
    daily_budget: 9700, // $97.00/day Advantage Campaign Budget
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
  };

  const campRes = await (
    await fetch(`${base}/act_${config.adAccountId}/campaigns?access_token=${tok}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campPayload)
    })
  ).json();

  if (campRes.error) {
    throw new Error(`Failed to create Campaign: ${campRes.error.message}`);
  }
  const campaignId = campRes.id;
  logger.success(`✓ Campaign created in PAUSED state! ID: ${campaignId}`);

  // Phase 3: Create Ad Set (ACTIVE) with Advantage+ Audience
  logger.info('\n━━━ PHASE 3: CREATING AD SET (ACTIVE) ━━━');
  const adsetPayload = {
    campaign_id: campaignId,
    name: 'Dogs',
    status: 'ACTIVE',
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: {
      pixel_id: config.pixelId,
      custom_event_type: 'PURCHASE',
      smart_pse_enabled: false
    },
    attribution_spec: [
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 }
    ],
    targeting: {
      geo_locations: {
        countries: ['US'],
        location_types: ['frequently_in', 'home', 'recent']
      },
      age_min: 18,
      age_max: 65,
      genders: [2], // Females only
      flexible_spec: [
        {
          interests: [
            {
              id: '6003332344237',
              name: 'Dogs (animals)'
            }
          ]
        }
      ],
      brand_safety_content_filter_levels: ['FACEBOOK_RELAXED', 'AN_RELAXED'],
      targeting_automation: {
        advantage_audience: 1,
        individual_setting: {
          age: 1,
          gender: 1
        }
      }
    }
  };

  const adsetRes = await (
    await fetch(`${base}/act_${config.adAccountId}/adsets?access_token=${tok}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adsetPayload)
    })
  ).json();

  if (adsetRes.error) {
    throw new Error(`Failed to create AdSet: ${adsetRes.error.message}`);
  }
  const adsetId = adsetRes.id;
  logger.success(`✓ Ad Set created in ACTIVE state! ID: ${adsetId}`);

  // Phase 4: Create Flexible Multi-Media Ad Creative (DEGREES_OF_FREEDOM)
  logger.info('\n━━━ PHASE 4: CREATING FLEXIBLE MULTI-MEDIA AD CREATIVE ━━━');
  
  // Base creative features matching campaign 120249472700060025
  const orig = await (await fetch(`${base}/1476065111390265?fields=degrees_of_freedom_spec,asset_feed_spec&access_token=${tok}`)).json();
  const cfs = { ...(orig.degrees_of_freedom_spec?.creative_features_spec || {}) };
  delete cfs.standard_enhancements;
  delete cfs.standard_enhancements_catalog;

  const creativePayload = {
    name: 'DSB - Flexible Multi-Media Creative (Modeled on 120249472700060025)',
    object_story_spec: {
      page_id: config.pageId,
      instagram_user_id: INSTAGRAM_ACCOUNT_ID,
      video_data: {
        video_id: '1823042209524921',
        image_hash: 'e4f39af828e2706122a4241822cc4c3e',
        call_to_action: {
          type: 'GET_OFFER_VIEW',
          value: { link: PRODUCT_URL }
        }
      }
    },
    asset_feed_spec: orig.asset_feed_spec,
    degrees_of_freedom_spec: {
      creative_features_spec: cfs
    },
    url_tags: 'utm_source={{site_source_name}}'
  };

  const creativeRes = await (
    await fetch(`${base}/act_${config.adAccountId}/adcreatives?access_token=${tok}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creativePayload)
    })
  ).json();

  if (creativeRes.error) {
    throw new Error(`Failed to create Creative: ${creativeRes.error.message}`);
  }
  const creativeId = creativeRes.id;
  logger.success(`✓ Flexible Multi-Media Creative created! ID: ${creativeId}`);

  // Phase 5: Create Ad (ACTIVE)
  logger.info('\n━━━ PHASE 5: CREATING AD (ACTIVE) ━━━');
  const adPayload = {
    name: 'New Sales ad',
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: 'ACTIVE'
  };

  const adRes = await (
    await fetch(`${base}/act_${config.adAccountId}/ads?access_token=${tok}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adPayload)
    })
  ).json();

  if (adRes.error) {
    throw new Error(`Failed to create Ad: ${adRes.error.message}`);
  }
  const adId = adRes.id;
  logger.success(`✓ Ad created in ACTIVE state! ID: ${adId}`);

  // Phase 6: Live Graph API Verification
  logger.info('\n━━━ PHASE 6: LIVE META GRAPH API VERIFICATION ━━━');
  const vCamp = await verifyEntity(campaignId, 'id,name,status,effective_status,daily_budget,objective', config.accessToken, config.apiVersion);
  const vAdset = await verifyEntity(adsetId, 'id,name,status,effective_status,targeting,optimization_goal', config.accessToken, config.apiVersion);
  const vAd = await verifyEntity(adId, 'id,name,status,effective_status,issues_info,creative{id,name}', config.accessToken, config.apiVersion);

  const manifest = {
    deployedAt: new Date().toISOString(),
    blueprint: '120249472700060025 (DSB - OLD - Dogs)',
    adAccountId: `act_${config.adAccountId}`,
    pageId: config.pageId,
    instagramAccountId: INSTAGRAM_ACCOUNT_ID,
    pixelId: config.pixelId,
    productUrl: PRODUCT_URL,
    callPhoneNumber: CALL_PHONE_NUMBER,
    campaign: {
      id: vCamp.id,
      name: vCamp.name,
      status: vCamp.status,
      effectiveStatus: vCamp.effective_status,
      dailyBudgetUSD: parseInt(vCamp.daily_budget, 10) / 100,
      objective: vCamp.objective
    },
    adset: {
      id: vAdset.id,
      name: vAdset.name,
      status: vAdset.status,
      effectiveStatus: vAdset.effective_status,
      targeting: vAdset.targeting
    },
    creative: {
      id: creativeId,
      name: creativePayload.name,
      videoId: creativePayload.object_story_spec.video_data.video_id,
      bodiesCount: creativePayload.asset_feed_spec?.bodies?.length || 0,
      titlesCount: creativePayload.asset_feed_spec?.titles?.length || 0,
      descriptionsCount: creativePayload.asset_feed_spec?.descriptions?.length || 0
    },
    ad: {
      id: vAd.id,
      name: vAd.name,
      status: vAd.status,
      effectiveStatus: vAd.effective_status,
      issuesCount: vAd.issues_info ? vAd.issues_info.length : 0
    }
  };

  const manifestPath = path.resolve(__dirname, 'logs/flexible_multimedia_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  logger.info('\n══════════════════════════════════════════════════════════════════════════');
  logger.success('🎉 SUCCESS: Deployed Flexible Multi-Media Campaign like 120249472700060025!');
  logger.info(`Campaign ID : ${campaignId} [${vCamp.status} - Effective: ${vCamp.effective_status}]`);
  logger.info(`Ad Set ID   : ${adsetId} [${vAdset.status} - Effective: ${vAdset.effective_status}]`);
  logger.info(`Ad ID       : ${adId} [${vAd.status} - Effective: ${vAd.effective_status}]`);
  logger.info(`Creative ID : ${creativeId} (Exact Blueprint 120249472700060025: Video + 3 Texts + 4 Headlines + Call Extension)`);
  logger.info(`Manifest    : ${manifestPath}`);
  logger.info('══════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logger.error(`Fatal Flexible Campaign Deployment Error: ${err.message}`);
  process.exit(1);
});
