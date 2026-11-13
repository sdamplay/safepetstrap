/**
 * SafePet Strap - Dog Mom Winning Creatives Test Launcher (Smart Concept-Isolated ABO)
 *
 * Pro Media Buyer Architecture:
 *  - Domain & Offer : https://www.safepetstrap.com/products/dog-seat-belt ("FREE Next-Hour 100 Giveaway")
 *  - Creatives      : 4 Videos + 6 Proven Static Ads from /Users/imacm1/Downloads/SafePet Strap
 *  - Targeting      : US Females Only (genders: [2]), Ages 21-65+, Interest: Dogs (6003332344237), Advantage+ OFF
 *  - Structure      : 1 ABO Campaign (PAUSED / OFF) -> 3 Concept-Isolated Ad Sets (ACTIVE / ON):
 *      * Ad Set 1 ($25/day) - Concept 1 (Police Authority & Law):   3 Ads (1 Video + 2 Statics)
 *      * Ad Set 2 ($25/day) - Concept 2 (Crash Lab & Direct Offer):  3 Ads (2 Videos + 1 Static)
 *      * Ad Set 3 ($25/day) - Concept 3 (Mom Confession & Child Seat): 4 Ads (1 Video + 3 Statics)
 *    Total Budget: $75/day ($25/day per concept ad set)
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
const logger = new AuditLogger('DogMomWinnersLauncher');

const BASE_DIR = '/Users/imacm1/Downloads/SafePet Strap';
const STATIC_DIR = path.join(BASE_DIR, 'Static Ads DSB');
const THUMB_DIR = path.join(BASE_DIR, 'thumbs');
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

function getDogMomMatrix() {
  return {
    campaignName: '[SafePet] 2026 Dog Mom Winning Creatives Test (Smart Concept ABO)',
    adsets: [
      {
        key: 'C1_PoliceLaw',
        name: '[SafePet] [C1-PoliceLaw] - US-F 21-65+ (Dogs) [$25/day]',
        dailyBudgetCents: 2500,
        ads: [
          {
            key: 'V01_PoliceAuthority',
            type: 'video',
            adName: '[SafePet] [V01-PoliceAuthority] - Stone Mills Officer & Mom Warning',
            videoFile: 'New Feed Poli Ad.mp4',
            thumbFile: 'thumb_new_feed_poli.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Next Hour Only • Limit 1',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '👮🏻 It\'s against the law to travel with an unrestrained dog!\n' +
              '😲 You can get a fine of up to $2,500 and 9 penalty points!\n' +
              '🚨 Even at 25 mph, an unbuckled dog hits forward with over 1,200 lbs of impact force.\n' +
              '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts 100% FREE for the next hour!\n\n' +
              '✅ Clicks into your standard car buckle in 1 second\n' +
              '✅ Heavy-duty rip-stop nylon with 360° tangle-free swivel\n' +
              '✅ Elastic bungee cuts 90% of sudden braking shock\n\n' +
              '👇 Tap "Get Offer" before the 100 free straps are gone!'
          },
          {
            key: 'S01_ViralRescue',
            type: 'image',
            adName: '[SafePet] [S01-ViralRescue] - Parking Lot German Shepherd Window Rescue',
            imageFile: 'creative_clean_06.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Next Hour Only • Limit 1',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '👮🏻 It\'s against the law to travel with an unrestrained dog in your vehicle!\n' +
              '😲 You can face fines up to $2,500 and dangerous road hazards.\n' +
              '❤️ To protect our community\'s pups, we are Giving Away 100 Dog Seat Belts for 100% FREE for the next hour!\n\n' +
              '🐶 Keep your furry best friend safe on every car ride.\n' +
              '👇 Tap "Get Offer" to claim your free seat belt now!'
          },
          {
            key: 'S02_RolloverConsequence',
            type: 'image',
            adName: '[SafePet] [S02-RolloverConsequence] - Overturned SUV in Ditch',
            imageFile: 'creative_clean_10.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Giving Away 100 Next Hour',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '🚨 One sudden turn or blown tire can flip a car in seconds.\n' +
              '👮🏻 Unrestrained pets become dangerous projectiles during an accident.\n' +
              '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts 100% FREE for the next hour!\n\n' +
              '👇 Tap "Get Offer" before the free giveaway batch closes!'
          }
        ]
      },
      {
        key: 'C2_CrashLabGiveaway',
        name: '[SafePet] [C2-CrashLabGiveaway] - US-F 21-65+ (Dogs) [$25/day]',
        dailyBudgetCents: 2500,
        ads: [
          {
            key: 'V02_CrashLabGiveaway',
            type: 'video',
            adName: '[SafePet] [V02-CrashLabGiveaway] - ADAC Crash Test + 100 Free Offer Packshot',
            videoFile: 'Best Free Offer copy.mp4',
            thumbFile: 'thumb_best_free_offer.jpg',
            headline: '🚨 100 FREE Dog Seat Belts',
            description: 'Next Hour Only • Save $19.99',
            primaryText:
              '⛔️ ATTENTION DOG MOMS ⛔️\n' +
              '🩺 VET WARNING: Standard rigid leashes cause severe neck whiplash during sudden stops.\n' +
              '💥 Watch what happens in a crash: unbuckled dogs fly directly into the dashboard.\n' +
              '❤️ That\'s why we\'re giving away 100 SafePet Anti-Whiplash Seat Belts 100% FREE today!\n\n' +
              '🐾 Protects your pup\'s neck with an elastic shock buffer\n' +
              '🐾 Keeps eager dogs off your lap and away from foot pedals\n' +
              '🐾 Universal 21mm steel latch fits all cars, trucks & SUVs\n\n' +
              '👇 Tap below to claim your FREE seat belt before stock runs out!'
          },
          {
            key: 'V03_SplitScreenLab',
            type: 'video',
            adName: '[SafePet] [V03-SplitScreenLab] - IAG Crash Test Without vs With SafePet',
            videoFile: 'With subtitle.MP4',
            thumbFile: 'thumb_with_subtitle.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Giving Away 100 Next Hour',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '🚨 Laboratory tested: Even at less than 15 mph, an unbuckled dog launches forward violently.\n' +
              '❤️ Claim 1 Anti-Whiplash Dog Seat Belt 100% FREE — Giving Away 100 Next Hour!\n\n' +
              '✅ Absorbs up to 90% of sudden braking force\n' +
              '✅ Clicks securely into any standard seatbelt buckle\n' +
              '✅ Keeps your co-pilot safe in their seat\n\n' +
              '👇 Tap "Get Offer" now before the 100 free straps run out!'
          },
          {
            key: 'S03_FoggedWindow',
            type: 'image',
            adName: '[SafePet] [S03-FoggedWindow] - Beagle Paws and Tongue on Glass',
            imageFile: 'creative_clean_08.jpg',
            headline: '🐶 Keep Your Baby Safe',
            description: '100 Free Giveaways Left',
            primaryText:
              '⛔️ ATTENTION DOG MOMS ⛔️\n' +
              '💔 Don\'t let your baby slide, scramble, or panic in the backseat.\n' +
              '❤️ We are Giving Away 100 Anti-Whiplash Dog Seat Belts 100% FREE for the next hour!\n\n' +
              '🐶 Keeps your pup calm, comfortable, and protected on every ride.\n' +
              '👇 Tap "Get Offer" to claim your free strap today!'
          }
        ]
      },
      {
        key: 'C3_MomEmotionRescue',
        name: '[SafePet] [C3-MomEmotionRescue] - US-F 21-65+ (Dogs) [$25/day]',
        dailyBudgetCents: 2500,
        ads: [
          {
            key: 'V04_MomConfession',
            type: 'video',
            adName: '[SafePet] [V04-MomConfession] - Survivor Dog Mom Real Testimonial',
            videoFile: 'Review copy.mp4',
            thumbFile: 'thumb_review_copy.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: '100 Free Giveaways Left',
            primaryText:
              '⛔️ "I USED TO THINK WE WERE JUST DRIVING 5 MINUTES DOWN THE ROAD..." ⛔️\n' +
              '😭 "Then someone slammed their brakes in front of me at 25 mph. Everything in my car flew forward... out the window would have been her fate if she wasn\'t buckled."\n' +
              '❤️ To protect more pups from tragedy, we are giving away 100 Dog Seat Belts 100% FREE this hour!\n\n' +
              '👇 Tap "Get Offer" before the free giveaway ends!'
          },
          {
            key: 'S04_ChildSeatFlipped',
            type: 'image',
            adName: '[SafePet] [S04-ChildSeatFlipped] - Inside Overturned Car Graco Child Seat',
            imageFile: 'creative_clean_11.jpg',
            headline: '🐶 Keep Your Baby Safe',
            description: '4.9★ Rated • Free Today',
            primaryText:
              '⛔️ TO EVERY DOG MOM ⛔️\n' +
              '💔 You would never let your child ride in the backseat without a car seat. So why do we let our dogs roam loose?\n' +
              '🚗 One sudden stop at 25 mph turns your sweet pup into a 1,200 lb projectile.\n' +
              '❤️ We want every dog safe on the road: Claim 1 Anti-Whiplash Dog Seat Belt 100% FREE for the next hour!\n\n' +
              '🐶 Clicks in 1 second — gives you total peace of mind on every drive.\n' +
              '👇 Tap "Get Offer" now to protect your co-pilot!'
          },
          {
            key: 'S05_MomWindowConnection',
            type: 'image',
            adName: '[SafePet] [S05-MomWindowConnection] - Dog Mom Touching Glass at Grocery Store',
            imageFile: 'creative_clean_04.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Limit 1 Per Pet Parent',
            primaryText:
              '⛔️ TO EVERY DOG PARENT ⛔️\n' +
              '❤️ They trust us with their whole life every time they jump in the car.\n' +
              '👮🏻 Driving with an unbuckled dog can cost up to a $2,500 fine and severe injury.\n' +
              '🎁 That\'s why we\'re giving away 100 Anti-Whiplash Seat Belts 100% FREE for the next hour!\n\n' +
              '👇 Tap "Get Offer" below to claim yours before they\'re gone!'
          },
          {
            key: 'S06_ClinicEmergencyRescue',
            type: 'image',
            adName: '[SafePet] [S06-ClinicEmergencyRescue] - Carried Injured Dog in Parking Lot',
            imageFile: 'creative_clean_01.jpg',
            headline: '🎁 Claim Yours Before They\'re Gone!',
            description: 'Next Hour Only • $0.00',
            primaryText:
              '⛔️ ATTENTION DOG OWNERS ⛔️\n' +
              '🚨 Emergency Vet visits from sudden car stops can cost thousands of dollars.\n' +
              '😲 At 30 mph, a 45 lb dog launches forward with over 1,350 lbs of force.\n' +
              '❤️ We are Giving Away 100 Dog Seat Belts 100% FREE for the next hour to prevent accidents!\n\n' +
              '👇 Tap "Get Offer" now before the 100 free straps run out!'
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
  logger.info('║  SAFEPET DOG MOM WINNING CREATIVES CAMPAIGN (SMART CONCEPT-ISOLATED ABO)║');
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

  const matrix = getDogMomMatrix();
  const validator = new SchemaValidator();

  // Phase 1: Pre-Flight Audit of all 10 creatives (4 videos, 4 thumbnails, 6 statics, 10 copies)
  logger.info('\n━━━ PHASE 1: PRE-FLIGHT MEDIA, THUMBNAIL & COPY VALIDATION ━━━');
  let validationFailed = false;

  for (const adset of matrix.adsets) {
    for (const ad of adset.ads) {
      if (ad.type === 'video') {
        ad.videoPath = path.join(BASE_DIR, ad.videoFile);
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
      } else {
        ad.imagePath = path.join(STATIC_DIR, ad.imageFile);

        const imgAudit = validator.validateAdPackage({
          mediaPath: ad.imagePath,
          mediaType: 'image',
          copy: {
            primaryText: ad.primaryText,
            headline: ad.headline,
            description: ad.description,
            destinationUrl: PRODUCT_URL
          }
        });

        if (!imgAudit.valid) {
          validationFailed = true;
        }
      }
    }
  }

  if (validationFailed) {
    throw new Error('Pre-flight validation failed! Check errors above.');
  }
  logger.success('✓ All 4 videos, 4 thumbnails, 6 static images, and 10 ad copies passed pre-flight!');

  // Phase 2: Initialize Meta Ads MCP Client
  logger.info('\n━━━ PHASE 2: META ADS MCP CLIENT INITIALIZATION ━━━');
  const mcpClient = new MetaAdsMCPClient(config);
  await mcpClient.listTools();

  // Phase 3: Upload Assets & Create 10 Ad Creatives
  logger.info('\n━━━ PHASE 3: UPLOADING ASSETS & CREATING 10 AD CREATIVES ━━━');
  for (const adset of matrix.adsets) {
    for (const ad of adset.ads) {
      if (ad.type === 'video') {
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
      } else {
        const imgRes = await mcpClient.callTool('upload_ad_image', {
          ad_account_id: config.adAccountId,
          file_path: ad.imagePath
        });
        ad.imageHash = imgRes.image_hash;

        const creativeRes = await mcpClient.callTool('create_ad_creative', {
          ad_account_id: config.adAccountId,
          name: `Creative - ${ad.adName}`,
          page_id: config.pageId,
          image_hash: ad.imageHash,
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
  }
  logger.success('✓ Uploaded all assets and created 10 Ad Creatives!');

  // Phase 4: Deploy 1 ABO Campaign (PAUSED) -> 3 Concept Ad Sets (ACTIVE) -> 10 Ads (ACTIVE)
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
        adType: adSpec.type,
        mediaFile: adSpec.type === 'video' ? adSpec.videoFile : adSpec.imageFile,
        creativeId: adSpec.creativeId,
        status: verifiedAd.status,
        effectiveStatus: verifiedAd.effective_status
      });
    }
  }

  const manifestPath = path.resolve(__dirname, 'logs/dogmom_winners_deployment_manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        deployedAt: new Date().toISOString(),
        adAccountId: `act_${config.adAccountId}`,
        pageId: config.pageId,
        pixelId: config.pixelId,
        productUrl: PRODUCT_URL,
        totalDailyBudgetUSD: 75,
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
    `🎉 SUCCESS: Deployed 1 ABO Campaign (PAUSED), ${matrix.adsets.length} Concept AdSets (ACTIVE), and ${entities.length} Dog Mom Ads (ACTIVE)!`
  );
  logger.info(`Manifest logged at: ${manifestPath}`);
  logger.info('══════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logger.error(`Fatal Dog Mom Campaign Deployment Error: ${err.message}`);
  logger.decodeMetaError(err, { action: 'Dog Mom Meta Ads Deployment' });
  process.exit(1);
});
