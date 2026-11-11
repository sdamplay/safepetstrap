/**
 * SafePet Strap - Pro Media Buyer Black Friday Campaign Launcher
 * Executes via Meta Ads MCP Client + Verified OAuth User Token
 *
 * Strategy:
 *  - Account: act_2182816332632833 (SafePet)
 *  - Page: 1169299686277726 (SafePet Strap)
 *  - Pixel: 1062070679630310 (SafePet - PURCHASE optimization)
 *  - Destination URL: https://www.safepetstrap.com/products/dog-seat-belt
 *  - Targeting: US Females Only (genders: [2]), Ages 21-65+, Advantage+ Audience OFF (strict enforcement)
 *  - Audience Structure: 1 Verified Dog-Related Interest per Ad Set (Dogs, Puppy, Dog Grooming)
 *  - Budget: $30.00/day CBO split across Option 1 ($15/day) & Option 2 ($15/day)
 *  - Safety Lock: Strictly PAUSED across all Campaigns, Ad Sets, and Ads
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
const logger = new AuditLogger('BlackFridayLauncher');

const STATIC_ASSETS_DIR = '/Users/imacm1/Downloads/DSB - 30 BLACK FRIDAY Static Ad';
const PRODUCT_URL = 'https://www.safepetstrap.com/products/dog-seat-belt';
const UTM_TAGS = 'utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}';

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

// Verified Meta Interest IDs (Fetched directly from Graph API /search?type=adinterest)
const INTEREST_ADSETS = [
  {
    key: 'dogs',
    adsetName: '[BF 2026] [US-F 21-65+] - Int: Dogs',
    interest: { id: '6003332344237', name: 'Dogs (animals)' }
  },
  {
    key: 'puppy',
    adsetName: '[BF 2026] [US-F 21-65+] - Int: Puppy',
    interest: { id: '6003341040796', name: 'Puppy (dogs)' }
  },
  {
    key: 'dog_grooming',
    adsetName: '[BF 2026] [US-F 21-65+] - Int: Dog Grooming',
    interest: { id: '6003117329068', name: 'Dog grooming (pets)' }
  }
];

function getCreativeLibrary() {
  return {
    option1: [
      {
        key: 'S01_Glitch',
        adName: '[BF 2026] [S01-Glitch] - We Messed Up (100% OFF)',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (45).png',
        headline: '⚠️ WE MESSED UP: 100% OFF Today',
        description: '$19.99 -> $0.00 • Free Today',
        primaryText:
          `Well... our marketing team messed up. 🤦‍♀️🐶\n\n` +
          `For Black Friday, we were supposed to turn on 20% OFF for our Anniversary Sale...\n` +
          `Instead, the code went live at 100% OFF.\n\n` +
          `Right now our bestselling SafePet Dog Car Seat Belt is showing up as literally $0.00 (normally $19.99).\n\n` +
          `Instead of cancelling orders, we decided to leave it live today ONLY as a massive gift to dog moms who refuse to take risks on the road.\n\n` +
          `Because every sudden brake or swerve is terrifying when your baby is unbuckled in the backseat:\n` +
          `🐾 Anti-Whiplash Elastic Bungee: Cushions up to 90% of hard-braking shock\n` +
          `🐾 Universal 21mm Steel Latch: Clicks into any car buckle in 1 second\n` +
          `🐾 360° Tangle-Free Swivel: Safe sitting, standing, or cozy naps\n\n` +
          `Once today's promo batch closes, pricing snaps back to normal.\n\n` +
          `👇 Tap "Get Offer" below before our boss shuts it down!`
      },
      {
        key: 'S02_iMessage',
        adName: '[BF 2026] [S02-Chat] - Sarah iMessage Leak ($0.00)',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (52).png',
        headline: '"omg SafePet is 100% FREE??" 📲',
        description: '100% OFF Black Friday Sale',
        primaryText:
          `"wait WHAT so it's literally free?!" 📲🐶\n\n` +
          `Someone dropped this screenshot in our dog-mom group chat this morning and half of us already ordered one.\n\n` +
          `SafePet is running their Black Friday Anniversary Giveaway and made their #1 Dog Car Seat Belt $0.00 right now.\n\n` +
          `No monthly subscription. No sneaky contract. Just heavy-duty protection for the one who greets you at the door every day.\n\n` +
          `In a 30mph sudden stop, an unbuckled dog launches forward with dangerous force—and regular collars or flimsy leashes can choke them.\n\n` +
          `SafePet clips to their harness + your car's real seatbelt buckle with a built-in shock bungee so every drive feels calm and safe. ❤️\n\n` +
          `👇 Tap "Get Offer" below while this link is still active!`
      },
      {
        key: 'S03_Cart',
        adName: '[BF 2026] [S03-Cart] - Shopify Cart $0.00 Breakdown',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (42).png',
        headline: 'Cart Total: $0.00 (Save $19.99)',
        description: '100% FREE • 2,150+ Reviews',
        primaryText:
          `Look at that cart total: $19.99 ➔ $0.00. 🛒✨🐶\n\n` +
          `Every dog mom knows that heart-stopping second when someone cuts you off, you hit the brakes, and you immediately reach back to check your pup...\n\n` +
          `Don't wait for a close call on the highway to protect your fur baby.\n\n` +
          `For our Black Friday Anniversary Sale, we slashed 100% OFF our flagship Dog Car Seat Belt:\n\n` +
          `✅ Elastic Anti-Whiplash Buffer (protects neck & spine)\n` +
          `✅ Heavy-Duty Nylon + Reflective Night Stitching\n` +
          `✅ 360° Zinc Alloy Swivel Clip\n` +
          `✅ Universal Fit for Cars, SUVs & Trucks\n\n` +
          `Your Cart Total Today: $0.00.\n\n` +
          `👇 Tap "Get Offer" below to claim yours before tonight's cutoff!`
      },
      {
        key: 'S04_Notes',
        adName: '[BF 2026] [S04-Notes] - Notes App Secret Deal',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (41).png',
        headline: 'The Secret $0.00 Dog Belt 🤫',
        description: 'Secret Sale • Claim 1 Free',
        primaryText:
          `Okay dog moms... saving this in my Notes before they turn the link off 🤫📝🐶\n\n` +
          `SafePet unlocked a secret Black Friday Anniversary deal giving away their anti-whiplash Dog Seat Belt for 100% FREE.\n\n` +
          `If your pup:\n` +
          `❌ Tries to climb onto your lap while you're driving\n` +
          `❌ Paces back and forth nervously on highway turns\n` +
          `❌ Slides off the backseat when you brake suddenly\n\n` +
          `This takes 2 seconds to clip in and keeps both of you completely safe & distraction-free.\n\n` +
          `Normally $19.99 — today it's $0.00 for your pup.\n\n` +
          `👇 Tap "Get Offer" below before our Anniversary batch sells out!`
      },
      {
        key: 'S05_Apology',
        adName: '[BF 2026] [S05-FOMO] - Stock Warning Apology',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (33).png',
        headline: '⚠️ Stock Warning: 100% OFF',
        description: 'Stock Going Fast • $0.00',
        primaryText:
          `An honest apology from the SafePet team... 🙏🐶\n\n` +
          `When we made our Dog Seat Belt 100% FREE for our Black Friday Anniversary Sale, we honestly expected stock to last all week.\n\n` +
          `Word spread fast across dog-mom groups—and we blew through most of our promotional inventory in hours.\n\n` +
          `If you've been meaning to stop your pup from sliding around the backseat or distracting you while driving, grab yours right now before we switch back to full price ($19.99).\n\n` +
          `Because their safety shouldn't depend on luck.\n\n` +
          `👇 Tap "Get Offer" below to claim yours while remaining stock lasts!`
      }
    ],
    option2: [
      {
        key: 'S06_Features',
        adName: '[BF 2026] [S06-Proof] - Feature Grid & 4.9★ Stars',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (35).png',
        headline: '4.9★ Rated: 100% FREE Dog Belt',
        description: 'Shock-Absorbing • Free Today',
        primaryText:
          `4.9/5 Stars from 2,150+ verified dog moms—and today it's 100% FREE. ⭐⭐⭐⭐⭐🐶\n\n` +
          `"Keeps my dog secure and gives me total peace of mind!" — Sarah M.\n\n` +
          `Why thousands of pet parents won't drive another mile without SafePet:\n` +
          `🛡️ Shock-Absorbing Bungee protects against sudden stops\n` +
          `🚗 Universal Fit clicks into 99% of vehicle seatbelt latches\n` +
          `🌙 High-Visibility Reflective Stitching for late-night drives\n` +
          `🔄 360° Swivel Clasp prevents twisting & tangling\n\n` +
          `For our Black Friday Anniversary Sale, claim yours for $0.00.\n\n` +
          `👇 Tap "Get Offer" below to protect your co-pilot today!`
      },
      {
        key: 'S07_Comments',
        adName: '[BF 2026] [S07-Social] - Dog Mom Comments Wall',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (56).png',
        headline: '"Just got 1 for my golden!" 🐾',
        description: 'Loved by 50,000+ Dog Moms',
        primaryText:
          `"Wait a FREE dog seat belt?? Just got one for my golden!" 🐕💛\n\n` +
          `Our comments are flooded because dog moms can't believe checkout actually drops to $0.00.\n\n` +
          `If you treat your dog like family (and panic every time a car brakes hard in front of you), this 2-second clip is non-negotiable.\n\n` +
          `Heavy-duty nylon webbing, shock-absorbing bungee, and universal 21mm steel buckle—free for our Black Friday Anniversary event while today's batch lasts.\n\n` +
          `👇 Tap "Get Offer" below to grab one for your pup now!`
      },
      {
        key: 'S08_UsVsThem',
        adName: '[BF 2026] [S08-Meme] - Paying Full Price vs FREE',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (55).png',
        headline: 'Stop Overpaying: 100% FREE Today',
        description: '100% OFF Anniversary Sale',
        primaryText:
          `Paying full price at the pet store for rigid car leashes? 🙅‍♀️\n` +
          `Grabbing SafePet's anti-whiplash Dog Seat Belt for 100% FREE? 👉🐶✅\n\n` +
          `Most pet store straps don't have a shock-absorbing bungee—so one sudden stop still whips your dog forward.\n\n` +
          `SafePet cushions hard braking, clicks cleanly into standard buckles, and gives your best friend comfortable room to sit or curl up.\n\n` +
          `And during our Black Friday Anniversary Sale, it's $0.00.\n\n` +
          `👇 Tap "Get Offer" below to claim yours today!`
      },
      {
        key: 'S09_DontPay',
        adName: '[BF 2026] [S09-Offer] - Zero Cent Bold Black Friday',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (40).png',
        headline: "Don't Pay A Cent: $0.00 Belt",
        description: 'Limit 1 Per Household • Free',
        primaryText:
          `Don't pay $19.99 when our Anniversary Black Friday giveaway sets it to $0.00! 🐶🎁\n\n` +
          `Give your pup safe, comfortable backseat security before your next vet run, errands, or holiday road trip.\n\n` +
          `• Elastic shock-absorbing bungee buffer\n` +
          `• Reflective night-safety weave\n` +
          `• Solid stainless steel latch (fits almost any car)\n` +
          `• Limit 1 Free Dog Seat Belt per household\n\n` +
          `👇 Tap "Get Offer" below to claim your free SafePet Strap now!`
      },
      {
        key: 'S10_EndsTonight',
        adName: '[BF 2026] [S10-Timer] - Ends Tonight Flip Clock',
        file: '30 BLACK FRIDAY Static Ad Templates - Arcads image asset (31).png',
        headline: '⏳ ENDS TONIGHT: 100% FREE',
        description: 'Black Friday Ends Midnight',
        primaryText:
          `🚨 FINAL CALL: Our 100% OFF Black Friday Anniversary Sale ends tonight! ⏳🐶\n\n` +
          `Every ride without a seatbelt puts your best friend one hard brake away from getting hurt.\n\n` +
          `At midnight, the anniversary code expires and our anti-whiplash Dog Seat Belt goes right back to $19.99.\n\n` +
          `Protect your dog on every drive for $0.00 while the countdown is still active.\n\n` +
          `👇 Tap "Get Offer" below to lock in your free belt right now!`
      }
    ]
  };
}

async function verifyEntityPaused(type, id, token, apiVersion) {
  const url = `https://graph.facebook.com/${apiVersion}/${id}?fields=id,name,status,effective_status&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Verification failed for ${type} ${id}: ${data.error.message}`);
  }
  return data;
}

async function main() {
  logger.info('╔══════════════════════════════════════════════════════════════════════════╗');
  logger.info('║  SAFEPET BLACK FRIDAY META ADS DEPLOYMENT (PRO MEDIA BUYER STRUCTURE)    ║');
  logger.info('║  Targeting: US Females 21-65+ | 1 Interest / AdSet | Strict PAUSED Mode  ║');
  logger.info('╚══════════════════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  logger.info(`Target Ad Account : act_${config.adAccountId}`);
  logger.info(`Facebook Page ID  : ${config.pageId}`);
  logger.info(`Meta Pixel ID     : ${config.pixelId}`);
  logger.info(`Product Link      : ${config.productUrl}`);

  // 1. Validate Token & Ad Account Permissions
  const oauth = new OAuthManager(config);
  const auth = await oauth.validateToken();
  if (!auth.valid) {
    throw new Error(`Authentication failed: ${auth.reason}`);
  }

  const library = getCreativeLibrary();
  const allAds = [...library.option1, ...library.option2];

  // 2. Pre-Flight Validation via ffprobe & Meta schema rules
  logger.info('\n━━━ PHASE 1: PRE-FLIGHT MEDIA & COPY VALIDATION (ffprobe) ━━━');
  const validator = new SchemaValidator();
  let validationFailed = false;

  for (const ad of allAds) {
    ad.mediaPath = path.join(STATIC_ASSETS_DIR, ad.file);
    const audit = validator.validateAdPackage({
      mediaPath: ad.mediaPath,
      mediaType: 'image',
      copy: {
        primaryText: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
        destinationUrl: PRODUCT_URL
      }
    });
    if (!audit.valid) {
      validationFailed = true;
    }
  }

  if (validationFailed) {
    throw new Error('Pre-flight validation failed! Check errors above.');
  }
  logger.success(`✓ All ${allAds.length} Black Friday static creatives & copies passed pre-flight checks!`);

  // 3. Initialize MCP Client & Discover Tools
  logger.info('\n━━━ PHASE 2: META ADS MCP CLIENT INITIALIZATION ━━━');
  const mcpClient = new MetaAdsMCPClient(config);
  await mcpClient.listTools();

  // 4. Upload all 10 unique images and create 10 Ad Creatives
  logger.info('\n━━━ PHASE 3: UPLOADING IMAGES & CREATING 10 AD CREATIVES ━━━');
  for (const ad of allAds) {
    const imgRes = await mcpClient.callTool('upload_ad_image', {
      ad_account_id: config.adAccountId,
      file_path: ad.mediaPath
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
  logger.success(`✓ Uploaded 10 images & created 10 Meta Ad Creatives cleanly!`);

  // 5. Build Campaigns -> Single-Interest Female AdSets -> Ads (ALL STRICTLY PAUSED)
  logger.info('\n━━━ PHASE 4: DEPLOYING CAMPAIGNS, SINGLE-INTEREST ADSETS & ADS (PAUSED) ━━━');
  const campaignsSpec = [
    {
      name: '[BF 2026] SafePet - Opt 1: Top 5 Curated Statics ($15/day CBO)',
      dailyBudgetCents: 1500,
      ads: library.option1
    },
    {
      name: '[BF 2026] SafePet - Opt 2: Angle Cluster Testing ($15/day CBO)',
      dailyBudgetCents: 1500,
      ads: library.option2
    }
  ];

  const summary = [];

  for (const campSpec of campaignsSpec) {
    const campRes = await mcpClient.callTool('create_campaign', {
      ad_account_id: config.adAccountId,
      name: campSpec.name,
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      daily_budget: campSpec.dailyBudgetCents
    });

    const verifiedCamp = await verifyEntityPaused('Campaign', campRes.id, config.accessToken, config.apiVersion);
    if (verifiedCamp.status !== 'PAUSED') {
      throw new Error(`Safety lock violation: Campaign ${campRes.id} status is ${verifiedCamp.status}`);
    }

    for (const intSpec of INTEREST_ADSETS) {
      const adsetRes = await mcpClient.callTool('create_ad_set', {
        ad_account_id: config.adAccountId,
        campaign_id: campRes.id,
        name: intSpec.adsetName,
        countries: ['US'],
        age_min: 21,
        age_max: 65,
        genders: [2], // Females only
        interests: [intSpec.interest], // Strictly 1 interest per ad set
        advantage_audience: 0, // Strictly lock female & single interest
        status: 'PAUSED'
      });

      const verifiedAdset = await verifyEntityPaused('AdSet', adsetRes.id, config.accessToken, config.apiVersion);
      if (verifiedAdset.status !== 'PAUSED') {
        throw new Error(`Safety lock violation: AdSet ${adsetRes.id} status is ${verifiedAdset.status}`);
      }

      for (const adSpec of campSpec.ads) {
        const adRes = await mcpClient.callTool('create_ad', {
          ad_account_id: config.adAccountId,
          adset_id: adsetRes.id,
          creative_id: adSpec.creativeId,
          name: adSpec.adName,
          status: 'PAUSED'
        });

        summary.push({
          campaignId: campRes.id,
          campaign: campSpec.name,
          adsetId: adsetRes.id,
          adset: intSpec.adsetName,
          interest: intSpec.interest.name,
          adId: adRes.id,
          adName: adSpec.adName,
          creativeId: adSpec.creativeId,
          status: 'PAUSED'
        });
      }
    }
  }

  // Save deployment manifest locally in logs/ (never a manual import CSV)
  const manifestPath = path.resolve(__dirname, 'logs/black_friday_deployment_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    deployedAt: new Date().toISOString(),
    adAccountId: `act_${config.adAccountId}`,
    pageId: config.pageId,
    pixelId: config.pixelId,
    productUrl: PRODUCT_URL,
    totalCampaigns: campaignsSpec.length,
    totalAdSets: campaignsSpec.length * INTEREST_ADSETS.length,
    totalAds: summary.length,
    entities: summary
  }, null, 2));

  logger.info('\n══════════════════════════════════════════════════════════════════════════');
  logger.success(`🎉 SUCCESS: Deployed ${campaignsSpec.length} Campaigns, ${campaignsSpec.length * INTEREST_ADSETS.length} Single-Interest Female AdSets, and ${summary.length} Ads (ALL PAUSED)!`);
  logger.info(`Manifest logged at: ${manifestPath}`);
  logger.info('══════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logger.error(`Fatal Black Friday Deployment Error: ${err.message}`);
  logger.decodeMetaError(err, { action: 'Black Friday Meta Ads Deployment' });
  process.exit(1);
});
