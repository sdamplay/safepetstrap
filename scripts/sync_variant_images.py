#!/usr/bin/env python3
import os
import csv
import json
import time
import urllib.request
import urllib.error

TOKEN = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')
CSV_PATH = '/Users/imacm1/Downloads/products_export_1.csv'

def main():
    print(f"Parsing variant images from {CSV_PATH}...")
    csv_variant_images = {}
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        r = csv.DictReader(f)
        for row in r:
            h = row.get('Handle')
            v_img = row.get('Variant Image')
            if not h or not v_img:
                continue
            opt1 = row.get('Option1 Value', '')
            opt2 = row.get('Option2 Value', '')
            opt3 = row.get('Option3 Value', '')
            sku = row.get('Variant SKU', '')
            key = (h, sku, opt1, opt2, opt3)
            csv_variant_images[key] = v_img.strip()

    print(f"Total CSV variant image mappings: {len(csv_variant_images)}")

    print(f"Fetching products from {DOMAIN}...")
    url = f'https://{DOMAIN}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,variants,images'
    req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': TOKEN})
    with urllib.request.urlopen(req) as resp:
        prods = json.loads(resp.read().decode('utf-8'))['products']

    updated_count = 0
    already_set = 0

    for p in prods:
        h = p['handle']
        images = p.get('images', [])
        img_map = {}
        for img in images:
            clean_src = img['src'].split('?')[0]
            fname = clean_src.split('/')[-1]
            img_map[clean_src] = img['id']
            img_map[fname] = img['id']

        for v in p.get('variants', []):
            vid = v['id']
            current_img_id = v.get('image_id')
            opt1 = v.get('option1') or ''
            opt2 = v.get('option2') or ''
            opt3 = v.get('option3') or ''
            sku = v.get('sku') or ''

            target_img = csv_variant_images.get((h, sku, opt1, opt2, opt3))
            if not target_img:
                target_img = csv_variant_images.get((h, '', opt1, opt2, opt3))

            if target_img:
                clean_target = target_img.split('?')[0]
                target_fname = clean_target.split('/')[-1]
                matched_id = img_map.get(clean_target) or img_map.get(target_fname)
                if matched_id:
                    if current_img_id == matched_id:
                        already_set += 1
                        continue

                    # Update variant
                    v_url = f'https://{DOMAIN}/admin/api/2024-01/variants/{vid}.json'
                    payload = {'variant': {'id': vid, 'image_id': matched_id}}
                    v_req = urllib.request.Request(
                        v_url,
                        data=json.dumps(payload).encode('utf-8'),
                        headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN}
                    )
                    v_req.get_method = lambda: 'PUT'
                    
                    for attempt in range(5):
                        try:
                            with urllib.request.urlopen(v_req) as v_resp:
                                updated_count += 1
                                print(f"  [{updated_count}/238] Updated {p['title']} ({v.get('title')}) -> Image ID {matched_id}")
                                break
                        except urllib.error.HTTPError as e:
                            if e.code == 429:
                                retry_after = float(e.headers.get('Retry-After', 2.0))
                                time.sleep(retry_after)
                            else:
                                print(f"  ❌ Error updating variant {vid}: {e.code}")
                                break
                    time.sleep(0.1)

    print(f"\n==========================================")
    print(f"VARIANT IMAGE SYNC COMPLETE!")
    print(f"Updated: {updated_count} | Already Set: {already_set} | Total: {len(csv_variant_images)}")
    print(f"==========================================")

if __name__ == '__main__':
    main()
