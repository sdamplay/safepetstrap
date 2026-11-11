/**
 * Meta Ads Engine - Main Execution & Deployment Pipeline
 * Automated deployment into Meta Marketing API strictly in PAUSED state
 * with pre-flight ffprobe validation and dual-output CSV export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from './logger/audit_logger.js';
import { SchemaValidator } from './validators/schema_validator.js';
import { OAuthManager } from './auth/oauth_manager.js';
import { AssetUploader } from './media/asset_uploader.js';
import { PayloadBuilder } from './deployer/payload_builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const logger = new AuditLogger('PipelineOrchestrator');

// Load Configuration
function loadConfig() {
  const configPath = path.resolve(__dirname, 'config/meta_config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      logger.error(`Error parsing meta_config.json: ${e.message}`);
    }
  }

  // Merge with ENV variables
  config.adAccountId = process.env.META_AD_ACCOUNT_ID || config.adAccountId || '2182816332632833';
  config.pageId = process.env.META_PAGE_ID || config.pageId || '61592824665463';
  config.pixelId = process.env.META_PIXEL_ID || config.pixelId || '1062070679630310';
  config.productUrl = config.productUrl || 'https://safepetstrap.com/products/dog-seat-belt';
  config.appId = process.env.META_APP_ID || config.appId || '';
  config.appSecret = process.env.META_APP_SECRET || config.appSecret || '';
  config.accessToken = process.env.META_ACCESS_TOKEN || config.accessToken || '';
  config.apiVersion = config.apiVersion || 'v21.0';

  return config;
}

// Define the Campaign Hierarchy and Creatives
function getCampaignSpecifications() {
  const option1PrimaryText =
    `🎉 IT'S OUR 2-YEAR ANNIVERSARY! (And we're giving away 500 seatbelts for 100% FREE!) 🐶❤️\n\n` +
    `To celebrate over 50,000 dogs protected on the road, we want to give your pup our #1 bestselling car safety strap today.\n\n` +
    `⚠️ Before you take your dog on your next drive, pause and look at this bungee:\n\n` +
    `Did you know that in an emergency brake or 30mph stop, an unrestrained dog flies forward with forces equal to 30x their body weight?\n` +
    `Standard rigid leashes cause horrific neck and spine whiplash.\n\n` +
    `The SafePet Strap changes everything:\n` +
    `✅ Anti-Whiplash Bungee Buffer: Absorbs up to 90% of sudden braking shock.\n` +
    `✅ Universal 21mm Steel Latch: Clicks into standard car buckles in 1 second.\n` +
    `✅ 360° Zinc Alloy Swivel: Zero tangling so your pup can sit or lie down safely.\n\n` +
    `🔴 ANNIVERSARY GIVEAWAY RULES:\n` +
    `• 100% FREE (Valued at $29.95)\n` +
    `• Limited to 1 Free Strap per household\n` +
    `• Only 500 units allocated for today's batch\n\n` +
    `👇 Tap Get Offer below to claim your Free Strap before today's batch is gone!`;

  const option2InCarText =
    `🚨 ANNIVERSARY GIVEAWAY ALERT! 🚨\n\n` +
    `Tired of flimsy dog car straps that jam, get tangled, or don't fit your car's buckles?\n\n` +
    `Check this latch first.\n\n` +
    `Today only, to celebrate our anniversary, we're giving away the SafePet Universal Dog Seat Belt for 100% FREE!\n\n` +
    `🔘 Precision 21mm universal stainless steel latch — clicks into 99% of cars, trucks, and SUVs.\n` +
    `🔘 Integrated shock-absorbing bungee cushions sudden braking.\n` +
    `🔘 Prevents dangerous driver distraction and keeps your dog safely in the backseat.\n\n` +
    `🎁 Claim Yours Free Today (Stock is strictly limited for this promotional batch).`;

  const option2ComparisonText =
    `⚠️ Unrestrained vs Protected: The harsh truth every dog parent must see.\n\n` +
    `In a 30mph crash or sudden hard brake, an unrestrained dog flies into the dashboard with tremendous force.\n\n` +
    `Don't wait for a scare to take action.\n\n` +
    `Click the 21mm latch into your existing car buckle, attach to your dog's harness, and drive with complete peace of mind.\n\n` +
    `Claim your SafePet Strap today (100% Free Promotional Batch)!`;

  const option2UgcReviewText =
    `"This little strap literally saved my Frenchie when someone cut me off on the highway..." ⭐⭐⭐⭐⭐\n\n` +
    `Thousands of dog owners trust SafePet Strap for daily drives.\n\n` +
    `• Elastic anti-whiplash buffer\n` +
    `• Universal 21mm stainless steel buckle\n` +
    `• 360-degree tangle-free swivel snap\n\n` +
    `Claim your free promotional strap today before the anniversary allocation closes.`;

  return [
    {
      id: 'opt1',
      name: 'SafePet [Sales] - Option 1: Top Statics (Anniversary Free Offer)',
      dailyBudgetCents: 1500, // $15.00/day
      adsets: [
        {
          name: 'US - Dog Owners - Broad 18-65+ (Top Statics)',
          ads: [
            {
              name: 'Statics - 2-Year Anniversary Giveaway (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-square-1x1.jpg'),
              mediaType: 'image',
              primaryText: option1PrimaryText,
              headline: '🚨 FREE Anniversary Giveaway: Claim 1 Today',
              description: '100% FREE • Over 50,000+ Dogs Protected ★★★★★',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Statics - Look At This Bungee (Vertical 9:16)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-bungee-9x16.jpg'),
              mediaType: 'image',
              primaryText: option1PrimaryText,
              headline: '🎉 100% FREE Dog Seatbelt (Today Only)',
              description: 'Claim yours before stock runs out',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Statics - Sticky Bungee (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-sticky-bungee-1x1.jpg'),
              mediaType: 'image',
              primaryText: option1PrimaryText,
              headline: '🚨 Look at this bungee before driving',
              description: 'Free Giveaway • 50,000+ Protected',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            }
          ]
        }
      ]
    },
    {
      id: 'opt2',
      name: 'SafePet [Sales] - Option 2: Angle Clusters (In-Car & Emotional Hooks)',
      dailyBudgetCents: 1500, // $15.00/day
      adsets: [
        {
          name: 'US - Dog Owners - Broad 18-65+ (Angle Clusters)',
          ads: [
            {
              name: 'Angle - Tired of Cheap Straps In-Car (Vertical 9:16)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-incar-9x16.jpg'),
              mediaType: 'image',
              primaryText: option2InCarText,
              headline: '🎁 100% FREE Dog Seatbelt (Anniversary Giveaway)',
              description: 'Claim yours before stock runs out',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Angle - Split Comparison Danger vs Safe (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet_split_comparison_1789852424581.jpg'),
              mediaType: 'image',
              primaryText: option2ComparisonText,
              headline: '⚠️ Is Your Dog Protected In The Car?',
              description: 'Free Anniversary Batch • 100% Risk Free',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Angle - Emotional Protection UGC Review (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet_ugc_review_1789852464815.jpg'),
              mediaType: 'image',
              primaryText: option2UgcReviewText,
              headline: '⭐⭐⭐⭐⭐ "Saved My Dog On The Highway"',
              description: 'Over 50,000 Happy Pups Protected',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            }
          ]
        }
      ]
    }
  ];
}

async function main() {
  console.clear();
  logger.info('╔════════════════════════════════════════════════════════════════════╗');
  logger.info('║        META MARKETING API AUTOMATION & AD DEPLOYER ENGINE          ║');
  logger.info('║        Brand: SafePet Strap | Strict Constraint: PAUSED Mode       ║');
  logger.info('╚════════════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  logger.info('Target Project Configuration:');
  logger.info(` • Ad Account ID: act_${config.adAccountId}`);
  logger.info(` • Facebook Page ID: ${config.pageId}`);
  logger.info(` • Meta Pixel ID: ${config.pixelId}`);
  logger.info(` • Target Product URL: ${config.productUrl}`);
  logger.info(` • Graph API Version: ${config.apiVersion}`);

  const campaigns = getCampaignSpecifications();

  // STEP 1: PRE-FLIGHT VALIDATION ENGINE
  logger.info('\n━━━ STEP 1: PRE-FLIGHT ASSET & COPY AUDIT (via ffprobe) ━━━');
  const validator = new SchemaValidator();
  let allValid = true;

  for (const camp of campaigns) {
    logger.info(`Auditing specifications for [${camp.name}]...`);
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        const audit = validator.validateAdPackage({
          mediaPath: ad.mediaPath,
          mediaType: ad.mediaType,
          copy: {
            primaryText: ad.primaryText,
            headline: ad.headline,
            description: ad.description,
            destinationUrl: ad.linkUrl
          }
        });

        if (!audit.valid) {
          allValid = false;
        }
      }
    }
  }

  if (!allValid) {
    logger.error('Pre-flight validation failed for one or more creative assets. Aborting deployment.');
    process.exit(1);
  }
  logger.success('✓ ALL 6 CREATIVE ASSETS AND COPIES PASSED PRE-FLIGHT AUDIT!\n');

  // STEP 2: DUAL-OUTPUT GUARANTEE: CSV BULK IMPORT GENERATOR
  logger.info('━━━ STEP 2: DUAL-OUTPUT GUARANTEE (Bulk Import CSV) ━━━');
  const payloadBuilder = new PayloadBuilder(config);
  const csvExport = payloadBuilder.generateBulkImportCsv(campaigns);
  logger.success(`✓ Generated ${csvExport.recordCount} Ad rows ready for 1-click Ads Manager Bulk Import!\n`);

  // STEP 3: TOKEN VALIDATION & AUTHENTICATION
  logger.info('━━━ STEP 3: META API ACCESS TOKEN CHECK ━━━');
  const oauth = new OAuthManager(config);
  let authResult = await oauth.validateToken();

  if (!authResult.valid) {
    logger.warn('No active/valid Meta Access Token detected in configuration.');

    if (config.appId && config.appSecret) {
      logger.info('Meta App credentials detected. Launching local OAuth 2.0 PKCE listener...');
      try {
        const newToken = await oauth.startOAuthFlow();
        config.accessToken = newToken;
        payloadBuilder.accessToken = newToken;
        authResult = await oauth.validateToken(newToken);
      } catch (err) {
        logger.error(`OAuth flow failed: ${err.message}`);
      }
    } else {
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('ℹ️  HOW TO COMPLETE DIRECT API DEPLOYMENT:');
      logger.warn('1. Set your Meta Access Token or System User Token in:');
      logger.warn('   meta_ads_engine/config/meta_config.json -> "accessToken"');
      logger.warn('   OR run with: META_ACCESS_TOKEN="your_token" node meta_ads_engine/deploy_ads.js');
      logger.warn('');
      logger.warn('2. OR 1-CLICK INSTANT FALLBACK (No Token Required):');
      logger.warn('   The pre-formatted Meta_Ads_Manager_Bulk_Import.csv is ready on your desktop:');
      logger.warn(`   • ${csvExport.paths[0]}`);
      logger.warn(`   • ${csvExport.paths[1]}`);
      logger.warn('   Simply open Meta Ads Manager > Click "Export and Import" > "Import Ads".');
      logger.warn('   All campaigns, adsets, copy, and targeting will load instantly in PAUSED state.');
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }
  }

  // STEP 4: ASSET INGESTION & UPLOAD
  logger.info('━━━ STEP 4: MEDIA ASSET INGESTION (act_{id}/adimages) ━━━');
  const uploader = new AssetUploader(config);

  for (const camp of campaigns) {
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        if (ad.mediaType === 'image') {
          const res = await uploader.uploadImage(ad.mediaPath);
          ad.imageHash = res.hash;
        } else if (ad.mediaType === 'video') {
          const res = await uploader.uploadVideo(ad.mediaPath);
          ad.videoId = res.videoId;
        }
      }
    }
  }
  logger.success('✓ All media assets confirmed on Meta CDN!\n');

  // STEP 5: DEPLOY CAMPAIGN HIERARCHY IN PAUSED STATE
  logger.info('━━━ STEP 5: DEPLOYING CAMPAIGN HIERARCHY (STRICTLY PAUSED) ━━━');
  const deploymentReport = [];

  for (const camp of campaigns) {
    logger.info(`\nDeploying Campaign: "${camp.name}"...`);
    const createdCamp = await payloadBuilder.createCampaign({
      name: camp.name,
      dailyBudgetCents: camp.dailyBudgetCents
    });

    for (const adset of camp.adsets) {
      const createdAdSet = await payloadBuilder.createAdSet({
        campaignId: createdCamp.id,
        name: adset.name
      });

      for (const ad of adset.ads) {
        const createdCreative = await payloadBuilder.createCreative({
          name: `Creative - ${ad.name}`,
          imageHash: ad.imageHash,
          videoId: ad.videoId,
          primaryText: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          linkUrl: ad.linkUrl
        });

        const createdAd = await payloadBuilder.createAd({
          adsetId: createdAdSet.id,
          creativeId: createdCreative.id,
          name: ad.name
        });

        deploymentReport.push({
          campaign: createdCamp.name,
          campaignId: createdCamp.id,
          adset: createdAdSet.name,
          adsetId: createdAdSet.id,
          ad: createdAd.name,
          adId: createdAd.id,
          status: 'PAUSED'
        });
      }
    }
  }

  logger.info('\n════════════════════════════════════════════════════════════════════');
  logger.success('🎉 DEPLOYMENT COMPLETED SUCCESSFULLY WITH ZERO UNPAUSED ADS!');
  logger.info('════════════════════════════════════════════════════════════════════');
  console.table(deploymentReport);
}

main().catch((err) => {
  logger.error(`Fatal Execution Error: ${err.message}`);
  logger.decodeMetaError(err, { action: 'Main Execution Pipeline' });
  process.exit(1);
});
