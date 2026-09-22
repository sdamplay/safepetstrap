const readline = require('readline');
const config = require('./config');
const aliClient = require('./aliexpress_client');

async function runAuthSetup() {
  console.log('\n======================================================');
  console.log('   SAFEPET STRAP -> ALIEXPRESS OAUTH SETUP WIZARD');
  console.log('======================================================\n');

  const { appKey, appSecret, redirectUri } = config.aliexpress;

  if (!appKey || !appSecret) {
    console.error('❌ Error: ALI_APP_KEY and ALI_APP_SECRET must be configured in fulfillment/.env');
    console.error('👉 Please copy fulfillment/.env.example to fulfillment/.env and fill in your keys.\n');
    process.exit(1);
  }

  const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(appKey)}`;

  console.log('STEP 1: Open the following URL in your browser:');
  console.log('------------------------------------------------------');
  console.log(authUrl);
  console.log('------------------------------------------------------\n');

  console.log('STEP 2: Log in with the AliExpress buyer account you want orders placed from.');
  console.log('Click "Authorize" or "Allow".\n');
  console.log(`STEP 3: After authorizing, your browser will redirect to: ${redirectUri}?code=XXXXXX`);
  console.log('Copy the "code" parameter from your browser address bar.\n');

  // Check if code was provided as CLI argument
  let code = process.argv[2];

  if (!code) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    code = await new Promise(resolve => {
      rl.question('Paste the authorization "code" here and hit Enter: ', answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!code) {
    console.error('❌ Error: No authorization code was provided.');
    process.exit(1);
  }

  console.log(`\n⏳ Exchanging code for Access & Refresh Tokens...`);

  try {
    const tokenResponse = await aliClient.createToken(code);

    if (tokenResponse && (tokenResponse.access_token || tokenResponse.code === 0)) {
      const tokenData = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in,
        expire_time: tokenResponse.expire_time || (Date.now() + (tokenResponse.expires_in || 2592000) * 1000),
        user_id: tokenResponse.user_id,
        user_nick: tokenResponse.user_nick,
        created_at: new Date().toISOString()
      };

      config.saveTokens(tokenData);

      console.log('\n🎉 SUCCESS! AliExpress OAuth connection completed!');
      console.log('------------------------------------------------------');
      console.log(`User ID: ${tokenData.user_id || 'N/A'} (${tokenData.user_nick || 'N/A'})`);
      console.log(`Access Token: ${tokenData.access_token.substring(0, 10)}... (saved securely to tokens.json)`);
      console.log(`Expires In: ${Math.round((tokenResponse.expires_in || 2592000) / 86400)} days`);
      console.log('------------------------------------------------------');
      console.log('\nYou are now ready to run:');
      console.log('👉 npm run inspect:product  (to view your supplier variants & SKU IDs)');
      console.log('👉 npm run fulfill:dry-run  (to preview automated fulfillment on Shopify orders)\n');
    } else {
      console.error('\n❌ AliExpress API returned an error:', JSON.stringify(tokenResponse, null, 2));
      console.error('\nCommon causes:');
      console.error('1. The authorization code expired (it expires in ~5 minutes; generate a new one).');
      console.error('2. The redirect_uri configured in the AliExpress console does not match ALI_REDIRECT_URI.');
      console.error('3. The App Key or App Secret is incorrect.\n');
    }
  } catch (err) {
    console.error('\n❌ Request failed:', err.message);
  }
}

runAuthSetup();
