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
  const creativePayload = {
    name: 'Creative - DSB Flexible Multi-Media (8 Videos + 2 Statics)',
    object_story_spec: {
      page_id: config.pageId,
      instagram_user_id: INSTAGRAM_ACCOUNT_ID,
      link_data: {
        link: PRODUCT_URL,
        message:
          '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
          '👮🏻 Driving with an unrestrained dog can cost you up to a $2,500 fine!\n' +
          '😲 Even at 35 mph, a 50 lb dog hits forward with 1,500 lbs of force.\n' +
          '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts FREE for the next hour!\n\n' +
          '👇 Tap "Get Offer" before the 100 free straps are gone!',
        name: "🎁 Claim Yours Before They're Gone!",
        call_to_action: {
          type: 'GET_OFFER_VIEW',
          value: { link: PRODUCT_URL }
        }
      }
    },
    asset_feed_spec: {
      optimization_type: 'DEGREES_OF_FREEDOM',
      ad_formats: ['SINGLE_VIDEO', 'SINGLE_IMAGE'],
      videos: [
        { video_id: '1823042209524921' }, // New Feed Poli Ad.mp4 (Officer & Mom)
        { video_id: '1120241687540719' }, // Best Free Offer copy.mp4 (ADAC crash + 100 Free card)
        { video_id: '1669203034991017' }, // With subtitle.MP4 (Split screen crash test)
        { video_id: '2984816868543265' }, // Review copy.mp4 (Survivor dog mom testimonial)
        { video_id: '2270424007201856' }, // SafePet UGC 1: Pulled Over $2,500 Fine
        { video_id: '3181779188820780' }, // SafePet UGC 2: Emergency Vet 25mph Word Captions
        { video_id: '1669860634920590' }, // SafePet UGC 3: Emergency Vet PRO Pill Hook
        { video_id: '2322616421855893' } // SafePet UGC 4: Windshield Note Crash Open
      ],
      images: [
        { hash: '5a0877937ff42729fcd8f9c6b4aeace4' }, // creative_clean_06.jpg (Parking lot German Shepherd window rescue)
        { hash: 'bfc11b6026896a8918c6b3a3a6628bd8' } // creative_clean_10.jpg (Overturned SUV in ditch)
      ],
      bodies: [
        {
          text:
            '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
            '👮🏻 Driving with an unrestrained dog can cost you up to a $2,500 fine!\n' +
            '😲 Even at 35 mph, a 50 lb dog hits forward with 1,500 lbs of force.\n' +
            '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts FREE for the next hour!\n\n' +
            '👇 Tap "Get Offer" before the 100 free straps are gone!'
        },
        {
          text:
            'Breaking News for Dog Lovers!\n' +
            'Driving with your furry friend unrestrained can cost up to $2,500 in fines!\n' +
            '• 50 lb dog = 1,500 lbs of force at just 35 mph\n' +
            "Protect them (and yourself!) with our Anti-Whiplash Seat Belt. Limited time offer: get yours free before they're all gone!"
        },
        {
          text:
            'BREAKING: 100 FREE Dog Seat Belts Up for Grabs!\n' +
            'Unrestrained dogs can cost you $2,500 in fines!\n' +
            'At just 35 mph, a 50 lb dog becomes a 1,500 lbs projectile.\n' +
            'Claim your free seat belt now and drive safely with peace of mind!'
        }
      ],
      titles: [
        { text: "🎁 Claim Yours Before They're Gone!" },
        { text: "Don't Let Your Dog Get Fined $2,500!" },
        { text: 'Free Anti-Whiplash Dog Seat Belts' },
        { text: 'Get 100 Free Dog Straps Now' }
      ],
      descriptions: [{ text: '★★★★★ 4.7/5 (Reviews)' }],
      link_urls: [{ website_url: PRODUCT_URL }],
      call_to_action_types: ['GET_OFFER_VIEW'],
      call_ads_configuration: {
        call_destination_type: 'WEBSITE_AND_CALL',
        phone_number: CALL_PHONE_NUMBER
      }
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
      videoAssetsCount: creativePayload.asset_feed_spec.videos.length,
      imageAssetsCount: creativePayload.asset_feed_spec.images.length,
      bodiesCount: creativePayload.asset_feed_spec.bodies.length,
      titlesCount: creativePayload.asset_feed_spec.titles.length
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
  logger.info(`Creative ID : ${creativeId} (8 Videos + 2 Statics + 3 Texts + 4 Headlines)`);
  logger.info(`Manifest    : ${manifestPath}`);
  logger.info('══════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logger.error(`Fatal Flexible Campaign Deployment Error: ${err.message}`);
  process.exit(1);
});
