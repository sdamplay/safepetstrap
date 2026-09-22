const fs = require('fs');
const path = require('path');
const config = require('./config');
const aliClient = require('./aliexpress_client');

const CATALOG_FILE = path.join(__dirname, 'catalog.json');

function extractProductId(input) {
  if (!input) return null;
  // Match digits in URL like /item/3256811984485167.html or raw digits
  const match = String(input).match(/(\d{10,20})/);
  return match ? match[1] : null;
}

async function addProduct() {
  const args = process.argv.slice(2);
  const inputId = args[0];
  const customKeyword = args[1] || '';

  console.log('\n======================================================');
  console.log('   SAFEPET STRAP -> ALIEXPRESS PRODUCT ONBOARDING');
  console.log('======================================================\n');

  if (!inputId) {
    console.log('Usage:');
    console.log('  node fulfillment/add_product.js <AliExpress_URL_or_ID> [Shopify_Keyword]\n');
    console.log('Examples:');
    console.log('  node fulfillment/add_product.js 3256801234567890 "brush"');
    console.log('  node fulfillment/add_product.js https://www.aliexpress.us/item/3256801234567890.html "towel"\n');
    process.exit(1);
  }

  const productId = extractProductId(inputId);
  if (!productId) {
    console.error(`❌ Could not extract a valid AliExpress Product ID from: "${inputId}"`);
    process.exit(1);
  }

  console.log(`🔎 Fetching live product data for AliExpress Product ID: ${productId}...`);

  try {
    const res = await aliClient.getProductDetails(productId);
    if (!res || res.error_response) {
      console.error('❌ Failed to fetch product details from AliExpress:', JSON.stringify(res, null, 2));
      process.exit(1);
    }

    const baseInfo = res.result?.ae_item_base_info_dto || {};
    const skuList = res.result?.ae_item_sku_info_dtos || [];
    const productTitle = baseInfo.subject || 'AliExpress Supplier Product';

    console.log(`\n✅ Product Found: "${productTitle}"`);
    console.log(`   Total Variant SKUs: ${skuList.length}\n`);

    const skus = [];
    console.log('--------------------------------------------------------------------------------');
    console.log('SKU ID'.padEnd(22) + 'Variant Attributes'.padEnd(35) + 'Price'.padEnd(10) + 'Stock');
    console.log('--------------------------------------------------------------------------------');

    for (const sku of skuList) {
      const skuId = String(sku.sku_id || sku.id);
      const props = sku.ae_sku_property_dtos || [];
      const attr = props.map(p => `${p.sku_property_name}: ${p.sku_property_value}`).join(', ') || sku.sku_attr || 'Default';
      const price = sku.offer_sale_price || sku.sku_price || '0.00';
      const stock = sku.sku_available_stock !== undefined ? sku.sku_available_stock : (sku.sku_stock || 'In Stock');

      console.log(skuId.padEnd(22) + attr.substring(0, 33).padEnd(35) + `$${price}`.padEnd(10) + String(stock));

      skus.push({
        sku_id: skuId,
        sku_attr: sku.sku_attr || '',
        price: price,
        attr: attr
      });
    }
    console.log('--------------------------------------------------------------------------------\n');

    // Load existing catalog
    let catalog = {};
    if (fs.existsSync(CATALOG_FILE)) {
      try {
        catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      } catch (e) {
        catalog = {};
      }
    }

    // Determine catalog entry name & keywords
    const entryName = customKeyword 
      ? customKeyword.charAt(0).toUpperCase() + customKeyword.slice(1)
      : productTitle.split(',')[0].trim().substring(0, 30);

    const keywordList = [
      entryName.toLowerCase(),
      ...(customKeyword ? [customKeyword.toLowerCase()] : [])
    ];

    catalog[entryName] = {
      product_id: productId,
      keywords: Array.from(new Set(keywordList)),
      title: productTitle,
      skus: skus
    };

    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');

    console.log(`💾 Product successfully added to catalog!`);
    console.log(`   Catalog File: fulfillment/catalog.json`);
    console.log(`   Category Name: "${entryName}"`);
    console.log(`   Shopify Match Keywords: [${catalog[entryName].keywords.join(', ')}]`);
    console.log(`\n🎉 Any future Shopify order containing "${entryName}" in its title will now automatically fulfill this product on AliExpress!\n`);

  } catch (err) {
    console.error('❌ Error during product onboarding:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  addProduct();
}

module.exports = { addProduct };
