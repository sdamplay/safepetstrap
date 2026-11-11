/**
 * SafePet Strap - 5-Video Mom-Native 1.1x UGC Test Launcher (Smart Concept-Isolated ABO)
 *
 * Pro Media Buyer Architecture:
 *  - Domain & Offer : https://www.safepetstrap.com/products/dog-seat-belt ("FREE Next-Hour 100 Giveaway")
 *  - Videos         : All 5 Anti-AI 1.10x masters from /Users/imacm1/Downloads/DSB-UGC/Ready_For_Meta
 *  - Targeting      : US Females Only (genders: [2]), Ages 21-65+, Interest: Dogs (6003332344237), Advantage+ OFF
 *  - Structure      : 1 ABO Campaign (PAUSED / OFF) -> 3 Concept-Isolated Ad Sets (ACTIVE / ON):
 *      * Ad Set 1 ($25/day) - Concept 1 (Pulled Over $2,500 Fine): 1 Hero Video
 *      * Ad Set 2 ($40/day) - Concept 2 (Emergency Vet 25mph):      2 Head-to-Head Edit Variants
 *      * Ad Set 3 ($40/day) - Concept 3 (Windshield Note Bella):    2 Head-to-Head Hook Variants
 *    Total Budget: $105/day (saves 47.5% vs $200/day 5x$40 while eliminating concept starvation & audience overlap)
 *  - Safety Rule    : Campaign PAUSED (OFF), all Ad Sets & Ads ACTIVE (ON) -> effective_status: CAMPAIGN_PAUSED
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from './logger/audit_logger.js';
import { SchemaValidator } from './validators/schema_validator.js';
import { OAuthManager } from './auth/oauth_manager.js';
import { MetaAdsMCPClient } from './mcp/meta_ads_mcp_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('UGCTestLauncher');

const READY_DIR = '/Users/imacm1/Downloads/DSB-UGC/Ready_For_Meta';
const THUMB_DIR = path.join(READY_DIR, 'thumbs');
const PRODUCT_URL = 'https://www.safepetstrap.com/products/dog-seat-belt';
const UTM_TAGS =
  'utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}';

function loadConfig() {
  const configPath = path.resolve(__dirname, 'config/meta_config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

  return {
    ...config,
    adAccountId: process.env.META_AD_ACCOUNT_ID || config.adAccountId || '2182816332632833',
    pageId: process.env.META_PAGE_ID || config.pageId || '1169299686277726',
    pixelId: process.env.META_PIXEL_ID || config.pixelId || '1062070679630310',
    productUrl: PRODUCT_URL,
    apiVersion: config.apiVersion || 'v21.0',
    accessToken: process.env.META_ACCESS_TOKEN || config.accessToken || '',
    enforcePaused: true,
    generateCsvBackup: false
  };
}

const DOGS_INTEREST = { id: '6003332344237', name: 'Dogs (animals)' };

function getUgcTestMatrix() {
  return {
    campaignName: '[UGC 2026] SafePet - 5-Video 1.1x Mom-Native Test (Smart Concept ABO)',
    adsets: [
      {
        key: 'C1_Law_2500Fine',
        name: '[UGC 2026] [C1-Law-$2500Fine] - US-F 21-65+ (Dogs) [$25/day]',
        dailyBudgetCents: 2500,
        ads: [
          {
            key: 'V01_PulledOver_2500Fine',
            adName: '[UGC 2026] [V01-Law] - Pulled Over $2,500 Fine (1.1x)',
            videoFile: 'SafePet_UGC_01_PulledOver_2500Fine_1.1x.mp4',
            thumbFile: 'SafePet_UGC_01_PulledOver_2500Fine_1.1x_thumb.jpg',
            headline: '🚨 100 FREE Dog Seat Belts Today',
            description: 'Next Hour Only • Save $19.99',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '👮🏻 Driving with an unrestrained dog can cost you up to a $2,500 fine!\n' +
              '😲 Even at 35 mph, a 50 lb dog hits forward with 1,500 lbs of force.\n' +
              '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts FREE for the next hour!\n\n' +
              '👇 Tap "Get Offer" before the 100 free straps are gone!'
          }
        ]
      },
      {
        key: 'C2_EmergencyVet_25mph',
        name: '[UGC 2026] [C2-EmergencyVet-25mph] - US-F 21-65+ (Dogs) [$40/day]',
        dailyBudgetCents: 4000,
        ads: [
          {
            key: 'V02_Vet_AutoCaptions',
            adName: '[UGC 2026] [V02-VetWord] - 25mph Vet Word Captions (1.1x)',
            videoFile: 'SafePet_UGC_02_EmergencyVet_AutoCaptions_1.1x.mp4',
            thumbFile: 'SafePet_UGC_02_EmergencyVet_AutoCaptions_1.1x_thumb.jpg',
            headline: '🐶 Keep Your Baby Safe — $0.00',
            description: '100 Free Next Hour Only',
            primaryText:
              '⛔️ ATTENTION DOG MOMS ⛔️\n' +
              '🚨 We were only going 25 mph when another car swerved...\n' +
              '🩺 At 30 mph, a 50 lb dog launches with 1,500 lbs of force.\n' +
              '❤️ Claim 1 Anti-Whiplash Dog Seat Belt 100% FREE — Giving Away 100 Next Hour!\n\n' +
              '🐾 Absorbs 80% of sudden braking shock\n' +
              '🐾 Stops lap-climbing & pedal distractions\n' +
              '👇 Tap "Get Offer" now while free stock lasts!'
          },
          {
            key: 'V03_Vet_PRO_FixedHook',
            adName: '[UGC 2026] [V03-VetPill] - 25mph Vet Fixed Hook Card (1.1x)',
            videoFile: 'SafePet_UGC_03_EmergencyVet_PRO_FixedHook_1.1x.mp4',
            thumbFile: 'SafePet_UGC_03_EmergencyVet_PRO_FixedHook_1.1x_thumb.jpg',
            headline: 'Claim 1 FREE Dog Seat Belt ❤️',
            description: 'Only 100 Left • 4.9★ Rated',
            primaryText:
              '⛔️ ATTENTION DOG MOMS ⛔️\n' +
              '🚨 Left the pet clinic in tears — we were only going 25 mph when a car swerved.\n' +
              '🩺 Vet Warning: At 30 mph, a 50 lb dog hits forward with 1,500 lbs of force.\n' +
              '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts FREE for the next hour!\n\n' +
              '👇 Tap "Get Offer" below to protect your co-pilot today!'
          }
        ]
      },
      {
        key: 'C3_WindshieldNote_Bella',
        name: '[UGC 2026] [C3-WindshieldNote] - US-F 21-65+ (Dogs) [$40/day]',
        dailyBudgetCents: 4000,
        ads: [
          {
            key: 'V04_Windshield_CrashOpen',
            adName: '[UGC 2026] [V04-NoteCrash] - Crash Open + Bella Note (1.1x)',
            videoFile: 'SafePet_UGC_04_WindshieldNote_CrashOpen_1.1x.mp4',
            thumbFile: 'SafePet_UGC_04_WindshieldNote_CrashOpen_1.1x_thumb.jpg',
            headline: "⚠️ Don't Risk Your Dog (FREE)",
            description: '100 Free Today • Limit 1',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '😭 Found this heartbreaking note on my windshield after leaving the dog park...\n' +
              '👮🏻 Unrestrained pups risk a $2,500 citation — and 1 sudden stop can be fatal.\n' +
              "❤️ That is why we're giving away 100 Dog Seat Belts FREE for the next hour!\n\n" +
              'Clicks into your seatbelt latch in 1 second with an anti-whiplash bungee.\n' +
              '👇 Tap "Get Offer" to protect your co-pilot before checkout closes!'
          },
          {
            key: 'V05_Windshield_ParkOpen',
            adName: '[UGC 2026] [V05-NotePark] - Dog Park Note Open (1.1x)',
            videoFile: 'SafePet_UGC_05_WindshieldNote_ParkOpen_1.1x.mp4',
            thumbFile: 'SafePet_UGC_05_WindshieldNote_ParkOpen_1.1x_thumb.jpg',
            headline: '❤️ Claim Your FREE Dog Belt',
            description: 'Giving Away 100 Next Hour',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '👮🏻 Travelling with an unbuckled dog can lead to a $2,500 fine & citation!\n' +
              '❤️ For the next hour ONLY, claim 1 Anti-Whiplash Dog Seat Belt 100% FREE!\n\n' +
              '✅ Clicks into any car buckle in 1 second\n' +
              '✅ Shock-absorbing bungee cuts 80% road shock\n' +
              '✅ 360° swivel keeps pups off your lap & pedals\n\n' +
              '👇 Tap below before the 1-hour batch runs out!'
          }
        ]
      }
    ]
  };
}

async function verifyEntityStatus(type, id, token, apiVersion) {
  const fields = type === 'Ad' ? 'id,name,status,effective_status' : 'id,name,status,effective_status,daily_budget';
  const url = `https://graph.facebook.com/${apiVersion}/${id}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Verification failed for ${type} ${id}: ${data.error.message}`);
  }
  return data;
}

async function main() {
  logger.info('╔══════════════════════════════════════════════════════════════════════════╗');
  logger.info('║  SAFEPET 5-VIDEO 1.1x UGC SMART TEST DEPLOYMENT (CONCEPT-ISOLATED ABO)   ║');
  logger.info('║  Targeting: US Females 21-65+ | Dogs | Camp PAUSED, AdSets & Ads ACTIVE  ║');
  logger.info('╚══════════════════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  logger.info(`Target Ad Account : act_${config.adAccountId}`);
  logger.info(`Facebook Page ID  : ${config.pageId}`);
  logger.info(`Meta Pixel ID     : ${config.pixelId}`);
  logger.info(`Product Link      : ${config.productUrl}`);

  const oauth = new OAuthManager(config);
  const auth = await oauth.validateToken();
  if (!auth.valid) {
    throw new Error(`Authentication failed: ${auth.reason}`);
  }
  logger.success(`✓ Authenticated Token Validated (User: ${auth.user?.name || 'Verified'})`);

  const matrix = getUgcTestMatrix();
  const validator = new SchemaValidator();

  // Phase 1: Pre-Flight Audit of all 5 Videos, 5 Thumbnails, and 5 Copies
  logger.info('\n━━━ PHASE 1: PRE-FLIGHT MEDIA, THUMBNAIL & COPY VALIDATION ━━━');
  let validationFailed = false;
  for (const adset of matrix.adsets) {
    for (const ad of adset.ads) {
      ad.videoPath = path.join(READY_DIR, ad.videoFile);
      ad.thumbPath = path.join(THUMB_DIR, ad.thumbFile);

      const vidAudit = validator.validateAdPackage({
        mediaPath: ad.videoPath,
        mediaType: 'video',
        copy: {
          primaryText: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          destinationUrl: PRODUCT_URL
        }
      });
      const thumbAudit = validator.validateImage(ad.thumbPath);

      if (!vidAudit.valid || !thumbAudit.valid) {
        validationFailed = true;
      }
    }
  }

  if (validationFailed) {
    throw new Error('Pre-flight validation failed! Check errors above.');
  }
  logger.success('✓ All 5 Ready_For_Meta 1.1x videos, 5 thumbnails, and 5 ad copies passed pre-flight!');

  // Phase 2: Initialize Meta Ads MCP Client
  logger.info('\n━━━ PHASE 2: META ADS MCP CLIENT INITIALIZATION ━━━');
  const mcpClient = new MetaAdsMCPClient(config);
  await mcpClient.listTools();

  // Phase 3: Upload 5 Thumbnails & 5 Videos + Create 5 Video Ad Creatives
  logger.info('\n━━━ PHASE 3: UPLOADING 5 VIDEOS + 5 THUMBNAILS & CREATING AD CREATIVES ━━━');
  for (const adset of matrix.adsets) {
    for (const ad of adset.ads) {
      const thumbRes = await mcpClient.callTool('upload_ad_image', {
        ad_account_id: config.adAccountId,
        file_path: ad.thumbPath
      });
      ad.thumbHash = thumbRes.image_hash;

      const vidRes = await mcpClient.callTool('upload_ad_video', {
        ad_account_id: config.adAccountId,
        file_path: ad.videoPath,
        title: ad.adName
      });
      ad.videoId = vidRes.video_id;

      const creativeRes = await mcpClient.callTool('create_ad_creative', {
        ad_account_id: config.adAccountId,
        name: `Creative - ${ad.adName}`,
        page_id: config.pageId,
        image_hash: ad.thumbHash,
        video_id: ad.videoId,
        link_url: PRODUCT_URL,
        primary_text: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
        call_to_action: 'GET_OFFER',
        url_tags: UTM_TAGS
      });
      ad.creativeId = creativeRes.id;
    }
  }
  logger.success('✓ Uploaded all 5 videos & thumbnails and built 5 Video Ad Creatives!');

  // Phase 4: Deploy 1 ABO Campaign (PAUSED) -> 3 Concept Ad Sets (ACTIVE) -> 5 Ads (ACTIVE)
  logger.info('\n━━━ PHASE 4: DEPLOYING SMART CONCEPT-ISOLATED ABO HIERARCHY ━━━');
  const campRes = await mcpClient.callTool('create_campaign', {
    ad_account_id: config.adAccountId,
    name: matrix.campaignName,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    daily_budget: null
  });

  const verifiedCamp = await verifyEntityStatus('Campaign', campRes.id, config.accessToken, config.apiVersion);
  if (verifiedCamp.status !== 'PAUSED') {
    throw new Error(`Safety lock violation: Campaign ${campRes.id} status is ${verifiedCamp.status}`);
  }

  const entities = [];
  for (const adsetSpec of matrix.adsets) {
    const adsetRes = await mcpClient.callTool('create_ad_set', {
      ad_account_id: config.adAccountId,
      campaign_id: campRes.id,
      name: adsetSpec.name,
      daily_budget: adsetSpec.dailyBudgetCents,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      countries: ['US'],
      age_min: 21,
      age_max: 65,
      genders: [2], // Females only
      interests: [DOGS_INTEREST],
      advantage_audience: 0,
      status: 'ACTIVE'
    });

    const verifiedAdset = await verifyEntityStatus('AdSet', adsetRes.id, config.accessToken, config.apiVersion);
    if (verifiedAdset.status !== 'ACTIVE') {
      throw new Error(`Status rule violation: AdSet ${adsetRes.id} status is ${verifiedAdset.status}`);
    }

    for (const adSpec of adsetSpec.ads) {
      const adRes = await mcpClient.callTool('create_ad', {
        ad_account_id: config.adAccountId,
        adset_id: adsetRes.id,
        creative_id: adSpec.creativeId,
        name: adSpec.adName,
        status: 'ACTIVE'
      });

      const verifiedAd = await verifyEntityStatus('Ad', adRes.id, config.accessToken, config.apiVersion);
      entities.push({
        campaignId: campRes.id,
        campaign: matrix.campaignName,
        campaignStatus: verifiedCamp.status,
        adsetId: adsetRes.id,
        adset: adsetSpec.name,
        adsetDailyBudgetCents: adsetSpec.dailyBudgetCents,
        adsetStatus: verifiedAdset.status,
        interest: DOGS_INTEREST.name,
        adId: adRes.id,
        adName: adSpec.adName,
        videoId: adSpec.videoId,
        thumbHash: adSpec.thumbHash,
        creativeId: adSpec.creativeId,
        status: verifiedAd.status,
        effectiveStatus: verifiedAd.effective_status
      });
    }
  }

  const manifestPath = path.resolve(__dirname, 'logs/ugc_test_deployment_manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        deployedAt: new Date().toISOString(),
        adAccountId: `act_${config.adAccountId}`,
        pageId: config.pageId,
        pixelId: config.pixelId,
        productUrl: PRODUCT_URL,
        totalDailyBudgetUSD: 105,
        totalCampaigns: 1,
        totalAdSets: matrix.adsets.length,
        totalAds: entities.length,
        statusPolicy: { campaign: 'PAUSED', adset: 'ACTIVE', ad: 'ACTIVE' },
        entities
      },
      null,
      2
    )
  );

  logger.info('\n══════════════════════════════════════════════════════════════════════════');
  logger.success(
    `🎉 SUCCESS: Deployed 1 ABO Campaign (PAUSED), ${matrix.adsets.length} Concept AdSets (ACTIVE), and ${entities.length} 1.1x UGC Video Ads (ACTIVE)!`
  );
  logger.info(`Manifest logged at: ${manifestPath}`);
  logger.info('══════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logger.error(`Fatal UGC Test Deployment Error: ${err.message}`);
  logger.decodeMetaError(err, { action: '5-Video UGC Meta Ads Deployment' });
  process.exit(1);
});
