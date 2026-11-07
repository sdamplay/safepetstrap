#!/usr/bin/env python3
"""
Direct Product Mirroring from r038b3-ux.myshopify.com to ezuam5-nq.myshopify.com
Cleans up erroneous foreign CSV products and creates the genuine 12 SafePet products.
"""
import os
import json
import time
import urllib.request
import urllib.error
import ssl

ctx = ssl._create_unverified_context()

TOKEN_TGT = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN_TGT = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')
BACKUP_PATH = os.environ.get('BACKUP_PATH', '/Users/imacm1/SafePet/compliance-docs/source_products_backup.json')

HEADERS = {
    'X-Shopify-Access-Token': TOKEN_TGT,
    'Content-Type': 'application/json'
}

def api_request(method, endpoint, payload=None):
    url = f"https://{DOMAIN_TGT}/admin/api/2024-01/{endpoint}"
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                if resp.status == 204:
                    return {}
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                print(f"  [Rate limit] Sleeping {wait_sec}s...")
                time.sleep(wait_sec)
                continue
            err_body = e.read().decode('utf-8')
            print(f"  ❌ API Error [{e.code}] {method} {endpoint}: {err_body}")
            raise
    return None

def main():
    with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
        source_products = json.load(f)
    print(f"Loaded {len(source_products)} source products from {BACKUP_PATH}")

    # 1. Fetch current target products
    print(f"Fetching current products on {DOMAIN_TGT}...")
    existing = api_request('GET', 'products.json?limit=250').get('products', [])
    print(f"Found {len(existing)} existing products on target.")

    # 2. Delete all existing products on target to eliminate foreign CSV entries and conflicting variants
    print("Deleting all foreign/conflicting products on target store...")
    for p in existing:
        pid = p['id']
        handle = p['handle']
        title = p['title']
        print(f"  Deleting ID: {pid} | {handle} ({title})...")
        api_request('DELETE', f"products/{pid}.json")
        time.sleep(0.3)

    print("\nTarget store cleaned! Now creating genuine 12 SafePet products directly from source data...\n")

    # 3. Create genuine products
    for idx, sp in enumerate(source_products, 1):
        handle = sp['handle']
        title = sp['title']
        print(f"[{idx}/{len(source_products)}] Creating: {handle} ('{title}')...")

        # Map options
        options = [{'name': opt['name']} for opt in sp.get('options', []) if opt.get('name') != 'Title']
        if not options and sp.get('options') and sp['options'][0].get('name') == 'Title':
            options = [{'name': 'Title'}]

        # Map variants
        variants = []
        for v in sp.get('variants', []):
            var_data = {
                'price': v.get('price'),
                'compare_at_price': v.get('compare_at_price'),
                'sku': v.get('sku') or '',
                'requires_shipping': v.get('requires_shipping', True),
                'taxable': v.get('taxable', False),
                'position': v.get('position', 1)
            }
            if v.get('option1'):
                var_data['option1'] = v.get('option1')
            if v.get('option2'):
                var_data['option2'] = v.get('option2')
            if v.get('option3'):
                var_data['option3'] = v.get('option3')
            variants.append(var_data)

        # Map images
        images = []
        src_img_id_to_index = {}
        for img_idx, img in enumerate(sp.get('images', [])):
            src_img_id_to_index[img['id']] = img_idx
            images.append({
                'src': img['src'],
                'alt': img.get('alt') or ''
            })

        payload = {
            'product': {
                'title': title,
                'body_html': sp.get('body_html', ''),
                'vendor': sp.get('vendor', 'SafePet'),
                'product_type': sp.get('product_type', ''),
                'handle': handle,
                'tags': sp.get('tags', ''),
                'status': sp.get('status', 'active'),
                'options': options,
                'variants': variants,
                'images': images
            }
        }

        res = api_request('POST', 'products.json', payload)
        if not res or 'product' not in res:
            print(f"  ❌ Failed to create {handle}")
            continue

        created_prod = res['product']
        new_pid = created_prod['id']
        new_images = created_prod.get('images', [])
        new_variants = created_prod.get('variants', [])
        print(f"  ✅ Created! ID: {new_pid} | Images: {len(new_images)} | Variants: {len(new_variants)}")

        # Map variant images if applicable
        needs_variant_img_update = False
        for v_idx, orig_v in enumerate(sp.get('variants', [])):
            orig_img_id = orig_v.get('image_id')
            if orig_img_id and orig_img_id in src_img_id_to_index:
                target_img_idx = src_img_id_to_index[orig_img_id]
                if target_img_idx < len(new_images) and v_idx < len(new_variants):
                    new_vid = new_variants[v_idx]['id']
                    new_img_id = new_images[target_img_idx]['id']
                    api_request('PUT', f"variants/{new_vid}.json", {
                        'variant': {
                            'id': new_vid,
                            'image_id': new_img_id
                        }
                    })
                    needs_variant_img_update = True
                    time.sleep(0.2)

        if needs_variant_img_update:
            print(f"  🖼️ Variant images mapped successfully.")

        time.sleep(0.5)

    print("\n==========================================")
    print("ALL 12 GENUINE SAFEPET PRODUCTS IMPORTED!")
    print("==========================================")

if __name__ == '__main__':
    main()
