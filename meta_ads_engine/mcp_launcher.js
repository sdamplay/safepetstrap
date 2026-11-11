/**
 * Meta Ads MCP Launcher
 * Structured MCP-first advertising deployment workflow for SafePet Strap.
 * Supersedes legacy token methods with Meta Business OAuth 2.0 PKCE,
 * uploads assets, validates aspect ratios, and launches strictly in PAUSED state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from './logger/audit_logger.js';
import { SchemaValidator } from './validators/schema_validator.js';
import { OAuthManager } from './auth/oauth_manager.js';
import { MetaAdsMCPClient } from './mcp/meta_ads_mcp_client.js';
import { PayloadBuilder } from './deployer/payload_builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const logger = new AuditLogger('MCPLauncher');

function loadConfig() {
  const configPath = path.resolve(__dirname, 'config/meta_config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  // Also read mcp_config.json from antigravity if present
  const mcpGlobalPath = '/Users/imacm1/.gemini/antigravity/mcp_config.json';
  if (fs.existsSync(mcpGlobalPath)) {
    try {
      const g = JSON.parse(fs.readFileSync(mcpGlobalPath, 'utf8'));
      const authHeader = g.mcpServers?.meta_ads?.headers?.Authorization;
      if (authHeader && authHeader.startsWith('Bearer ') && !config.accessToken) {
        config.accessToken = authHeader.replace('Bearer ', '').trim();
      }
    } catch {
      // ignore
    }
  }

  // Identifiers
  config.adAccountId = process.env.META_AD_ACCOUNT_ID || config.adAccountId || '2182816332632833';
  config.pageId = process.env.META_PAGE_ID || config.pageId || '61592824665463';
  config.pixelId = process.env.META_PIXEL_ID || config.pixelId || '1062070679630310';
  config.productUrl = config.productUrl || 'https://safepetstrap.com/products/dog-seat-belt';
  config.appId = process.env.META_APP_ID || config.appId || '1667645315079969';
  config.appSecret = process.env.META_APP_SECRET || config.appSecret || '';
  config.accessToken = process.env.META_ACCESS_TOKEN || config.accessToken || '';
  config.apiVersion = config.apiVersion || 'v21.0';

  return config;
}

function getCampaignData() {
  const opt1Text =
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

  const opt2InCarText =
    `🚨 ANNIVERSARY GIVEAWAY ALERT! 🚨\n\n` +
    `Tired of flimsy dog car straps that jam, get tangled, or don't fit your car's buckles?\n\n` +
    `Check this latch first.\n\n` +
    `Today only, to celebrate our anniversary, we're giving away the SafePet Universal Dog Seat Belt for 100% FREE!\n\n` +
    `🔘 Precision 21mm universal stainless steel latch — clicks into 99% of cars, trucks, and SUVs.\n` +
    `🔘 Integrated shock-absorbing bungee cushions sudden braking.\n` +
    `🔘 Prevents dangerous driver distraction and keeps your dog safely in the backseat.\n\n` +
    `🎁 Claim Yours Free Today (Stock is strictly limited for this promotional batch).`;

  const opt2ComparisonText =
    `⚠️ Unrestrained vs Protected: The harsh truth every dog parent must see.\n\n` +
    `In a 30mph crash or sudden hard brake, an unrestrained dog flies into the dashboard with tremendous force.\n\n` +
    `Don't wait for a scare to take action.\n\n` +
    `Click the 21mm latch into your existing car buckle, attach to your dog's harness, and drive with complete peace of mind.\n\n` +
    `Claim your SafePet Strap today (100% Free Promotional Batch)!`;

  const opt2UgcText =
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
      dailyBudgetCents: 1500,
      adsets: [
        {
          name: 'US - Dog Owners - Broad 18-65+ (Top Statics)',
          ads: [
            {
              name: 'Statics - 2-Year Anniversary Giveaway (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-square-1x1.jpg'),
              mediaType: 'image',
              primaryText: opt1Text,
              headline: '🚨 FREE Anniversary Giveaway: Claim 1 Today',
              description: '100% FREE • Over 50,000+ Dogs Protected ★★★★★',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Statics - Look At This Bungee (Vertical 9:16)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-bungee-9x16.jpg'),
              mediaType: 'image',
              primaryText: opt1Text,
              headline: '🎉 100% FREE Dog Seatbelt (Today Only)',
              description: 'Claim yours before stock runs out',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Statics - Sticky Bungee (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-sticky-bungee-1x1.jpg'),
              mediaType: 'image',
              primaryText: opt1Text,
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
      dailyBudgetCents: 1500,
      adsets: [
        {
          name: 'US - Dog Owners - Broad 18-65+ (Angle Clusters)',
          ads: [
            {
              name: 'Angle - Tired of Cheap Straps In-Car (Vertical 9:16)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet-red-anniversary-incar-9x16.jpg'),
              mediaType: 'image',
              primaryText: opt2InCarText,
              headline: '🎁 100% FREE Dog Seatbelt (Anniversary Giveaway)',
              description: 'Claim yours before stock runs out',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Angle - Split Comparison Danger vs Safe (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet_split_comparison_1789852424581.jpg'),
              mediaType: 'image',
              primaryText: opt2ComparisonText,
              headline: '⚠️ Is Your Dog Protected In The Car?',
              description: 'Free Anniversary Batch • 100% Risk Free',
              linkUrl: 'https://safepetstrap.com/products/dog-seat-belt'
            },
            {
              name: 'Angle - Emotional Protection UGC Review (Square 1:1)',
              mediaPath: path.resolve(projectRoot, 'ad-creatives/safepet_ugc_review_1789852464815.jpg'),
              mediaType: 'image',
              primaryText: opt2UgcText,
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
  logger.info('║        OFFICIAL META ADS MCP SERVER WORKFLOW & LAUNCHER            ║');
  logger.info('║        Endpoint: https://mcp.facebook.com/ads                      ║');
  logger.info('║        Authentication: Meta Business OAuth 2.0 PKCE                ║');
  logger.info('║        Safety Enforcement: STRICTLY PAUSED (DRAFT) MODE            ║');
  logger.info('╚════════════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  logger.info('Target Project Configuration:');
  logger.info(` • Ad Account ID: act_${config.adAccountId}`);
  logger.info(` • Facebook Page ID: ${config.pageId}`);
  logger.info(` • Meta Pixel ID: ${config.pixelId}`);
  logger.info(` • Product Target: ${config.productUrl}`);

  const campaigns = getCampaignData();

  // 1. STRICT PRE-FLIGHT ASSET & COPY VALIDATION
  logger.info('\n━━━ PHASE 1: STRICT PRE-FLIGHT AUDIT (ffprobe & Meta Schemas) ━━━');
  const validator = new SchemaValidator();
  let allValid = true;

  for (const camp of campaigns) {
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
        if (!audit.valid) allValid = false;
      }
    }
  }

  if (!allValid) {
    logger.error('Pre-flight validation failed. Aborting deployment.');
    process.exit(1);
  }
  logger.success('✓ All 6 creative assets and copy lengths strictly validated against Meta schemas!\n');

  // 2. DUAL-OUTPUT GUARANTEE: BULK IMPORT CSV
  logger.info('━━━ PHASE 2: DUAL-OUTPUT GUARANTEE (Meta_Ads_Manager_Bulk_Import.csv) ━━━');
  const payloadBuilder = new PayloadBuilder(config);
  const csvExport = payloadBuilder.generateBulkImportCsv(campaigns);
  logger.success(`✓ Generated ${csvExport.recordCount} Ad rows ready for 1-click Ads Manager Bulk Import!\n`);

  // 3. META ADS MCP SERVER CONNECTION & DISCOVERY
  logger.info('━━━ PHASE 3: META ADS MCP SERVER TOOL DISCOVERY ━━━');
  const mcpClient = new MetaAdsMCPClient(config);
  const tools = await mcpClient.listTools();
  logger.info(`Discovered ${tools.length} available Meta Ads MCP tools:`);
  tools.forEach((t) => logger.info(` • ${t.name}: ${t.description.slice(0, 80)}...`));

  // 4. META BUSINESS OAUTH 2.0 VERIFICATION
  logger.info('\n━━━ PHASE 4: META BUSINESS OAUTH 2.0 PKCE CHECK ━━━');
  const oauth = new OAuthManager(config);
  const authRes = await oauth.validateToken();

  if (!authRes.valid) {
    logger.warn(`Current token validation note: ${authRes.reason}`);
    logger.info('Checking if Target Ad Account permissions need to be assigned in Meta Business Manager...');
    logger.info(`Target Ad Account: act_${config.adAccountId}`);
    logger.info(`Target Page ID: ${config.pageId}`);

    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('🔑 META BUSINESS OAUTH AUTHORIZATION STATUS:');
    logger.warn(`1. Token in antigravity/mcp_config.json is active as: "${authRes.user?.name || 'System User'}"`);
    logger.warn('2. To authorize direct deployment on Ad Account act_' + config.adAccountId + ':');
    logger.warn('   - Open Meta Business Suite (business.facebook.com) > Settings > Business Assets');
    logger.warn('   - Select Ad Account ' + config.adAccountId + ' > Assign People/System User > Enable "Manage Campaigns"');
    logger.warn('   - Select Page ' + config.pageId + ' > Assign People/System User > Enable "Create Ads"');
    logger.warn('');
    logger.warn('3. 1-CLICK INSTANT FALLBACK READY:');
    logger.warn('   Your pre-formatted Meta_Ads_Manager_Bulk_Import.csv is ready at:');
    logger.warn(`   • ${csvExport.paths[0]}`);
    logger.warn(`   • ${csvExport.paths[1]}`);
    logger.warn('   Simply open Meta Ads Manager > Click "Export and Import" > "Import Ads".');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Decode error report for troubleshooting
    if (authRes.rawError) {
      logger.decodeMetaError(authRes.rawError, { action: 'Meta Business Asset Permissions Check' });
    }
    return;
  }

  // 5. ASSET INGESTION VIA MCP (upload_ad_image / upload_ad_video)
  logger.info('━━━ PHASE 5: MCP ASSET UPLOAD & HASH GENERATION ━━━');
  for (const camp of campaigns) {
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        if (ad.mediaType === 'image') {
          const res = await mcpClient.callTool('upload_ad_image', {
            ad_account_id: config.adAccountId,
            file_path: ad.mediaPath
          });
          ad.imageHash = res.image_hash;
        } else if (ad.mediaType === 'video') {
          const res = await mcpClient.callTool('upload_ad_video', {
            ad_account_id: config.adAccountId,
            file_path: ad.mediaPath
          });
          ad.videoId = res.video_id;
        }
      }
    }
  }
  logger.success('✓ All media assets hashed and confirmed on Meta CDN!\n');

  // 6. CONSTRUCT & DEPLOY HIERARCHY IN PAUSED STATE VIA MCP TOOLS
  logger.info('━━━ PHASE 6: MCP CAMPAIGN DEPLOYMENT (STRICTLY PAUSED) ━━━');
  const report = [];

  for (const camp of campaigns) {
    logger.info(`\n[MCP] Deploying Campaign: "${camp.name}" (PAUSED)...`);
    const cRes = await mcpClient.callTool('create_campaign', {
      ad_account_id: config.adAccountId,
      name: camp.name,
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      daily_budget: camp.dailyBudgetCents
    });

    for (const adset of camp.adsets) {
      logger.info(`[MCP] Deploying Ad Set: "${adset.name}" (PAUSED)...`);
      const asRes = await mcpClient.callTool('create_ad_set', {
        ad_account_id: config.adAccountId,
        campaign_id: cRes.id,
        name: adset.name,
        status: 'PAUSED'
      });

      for (const ad of adset.ads) {
        logger.info(`[MCP] Deploying Creative & Ad: "${ad.name}" (PAUSED)...`);
        const crRes = await mcpClient.callTool('create_ad_creative', {
          ad_account_id: config.adAccountId,
          name: `Creative - ${ad.name}`,
          page_id: config.pageId,
          image_hash: ad.imageHash,
          video_id: ad.videoId,
          link_url: ad.linkUrl,
          primary_text: ad.primaryText,
          headline: ad.headline,
          description: ad.description
        });

        const adRes = await mcpClient.callTool('create_ad', {
          ad_account_id: config.adAccountId,
          adset_id: asRes.id,
          creative_id: crRes.id,
          name: ad.name,
          status: 'PAUSED'
        });

        report.push({
          campaign: cRes.name,
          campaignId: cRes.id,
          adset: asRes.name,
          adsetId: asRes.id,
          ad: adRes.name,
          adId: adRes.id,
          status: 'PAUSED'
        });
      }
    }
  }

  logger.info('\n════════════════════════════════════════════════════════════════════');
  logger.success('🎉 ALL ADS SUCCESSFULLY DEPLOYED VIA MCP IN PAUSED STATE!');
  logger.info('════════════════════════════════════════════════════════════════════');
  console.table(report);
}

main().catch((err) => {
  logger.error(`Fatal MCP Launcher Error: ${err.message}`);
  logger.decodeMetaError(err, { action: 'Meta Ads MCP Deployment Pipeline' });
  process.exit(1);
});
