const fs = require('fs');
const path = require('path');
const config = require('./config');
const aliClient = require('./aliexpress_client');

const SKU_MAP_FILE = path.join(__dirname, 'sku_mapping.json');

async function inspectProduct() {
  console.log('\n======================================================');
  console.log('   SAFEPET STRAP -> ALIEXPRESS PRODUCT & SKU INSPECTOR');
  console.log('======================================================\n');

  const productId = config.aliexpress.productId;

  if (!productId) {
    console.error('❌ Error: ALI_PRODUCT_ID must be set in fulfillment/.env');
    console.error('Example: If supplier URL is aliexpress.com/item/1005006123456789.html -> set ALI_PRODUCT_ID=1005006123456789\n');
    process.exit(1);
  }

  console.log(`🔎 Fetching product details for AliExpress Product ID: ${productId}...`);

  try {
    const res = await aliClient.getProductDetails(productId);

    if (!res || res.error_response) {
      console.error('❌ Failed to fetch product details from AliExpress:', JSON.stringify(res, null, 2));
      return;
    }

    const item = res.result?.aeop_a_e_product_s_k_us || res.result || res.aeop_a_e_product_s_k_us;
    console.log('\n📦 Product Data Retrieved Successfully!');

    // Check SKU list
    const skuList = res.result?.ae_item_sku_info_dtos || 
                    res.result?.aeop_a_e_product_s_k_us?.aeop_ae_product_sku || [];

    if (!Array.isArray(skuList) || skuList.length === 0) {
      console.log('Raw result structure:', JSON.stringify(res, null, 2));
      return;
    }

    console.log(`\nFound ${skuList.length} Variant SKU(s) on AliExpress:\n`);
    console.log('--------------------------------------------------------------------------------');
    console.log('SKU ID'.padEnd(25) + 'Properties / Color'.padEnd(30) + 'Sale Price'.padEnd(14) + 'Available Stock');
    console.log('--------------------------------------------------------------------------------');

    const mappedVariations = [];

    for (const sku of skuList) {
      const skuId = sku.sku_id || sku.id;
      const props = sku.ae_sku_property_dtos || [];
      const propDesc = props.map(p => `${p.sku_property_name}: ${p.sku_property_value}`).join(', ');
      const attr = propDesc || sku.sku_attr || 'Standard';
      const price = sku.offer_sale_price || sku.sku_price || 'N/A';
      const stock = sku.sku_available_stock !== undefined ? sku.sku_available_stock : (sku.sku_stock || 'In Stock');

      console.log(String(skuId).padEnd(25) + String(attr).substring(0, 28).padEnd(30) + `$${price}`.padEnd(14) + String(stock));

      mappedVariations.push({
        skuId: String(skuId),
        attribute: attr,
        price: price
      });
    }

    console.log('--------------------------------------------------------------------------------\n');

    // Default primary SKU (typically the first one or black)
    const primarySkuId = mappedVariations[0]?.skuId || '';

    const defaultMapping = {
      productId: String(productId),
      variants: {
        'SPS-01': {
          title: '1 Seat Belt — Starter Pack',
          quantityPerOrder: 1,
          skuId: primarySkuId
        },
        'SPS-02': {
          title: '2 Seat Belts — Double Safety',
          quantityPerOrder: 2,
          skuId: primarySkuId
        },
        'SPS-03': {
          title: '3 Seat Belts — SafePet Bundle',
          quantityPerOrder: 3,
          skuId: primarySkuId
        }
      },
      availableAliExpressSkus: mappedVariations
    };

    fs.writeFileSync(SKU_MAP_FILE, JSON.stringify(defaultMapping, null, 2), 'utf8');
    console.log(`💾 Saved SKU mapping blueprint to: fulfillment/sku_mapping.json`);
    console.log(`Default mapped SafePet Strap SKUs (SPS-01, SPS-02, SPS-03) to AliExpress SKU ID: ${primarySkuId}`);
    console.log(`You can customize sku_mapping.json if you want specific color SKU mappings.\n`);

  } catch (err) {
    console.error('❌ Error inspecting product:', err.message);
  }
}

function getSkuMapping() {
  if (fs.existsSync(SKU_MAP_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SKU_MAP_FILE, 'utf8'));
    } catch (e) {
      console.warn('⚠️ Warning: Could not parse sku_mapping.json');
    }
  }
  return null;
}

if (require.main === module) {
  inspectProduct();
}

module.exports = {
  inspectProduct,
  getSkuMapping
};
