#!/usr/bin/env python3
"""
Comprehensive Upsell & Product Sync Pipeline for SafePet Strap.
Syncs all upsells, handles, 3-tier product variants, discount codes, and companion products.
"""
import os
import sys
import json
import time
import base64
import urllib.request
import urllib.error

TOKEN = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')

HEADERS = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': TOKEN
}

def api_request(method, endpoint, payload=None):
    url = f"https://{DOMAIN}/admin/api/2024-01/{endpoint}"
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 204:
                    return {}
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                time.sleep(wait_sec)
                continue
            err_body = e.read().decode('utf-8')
            print(f"  ❌ API Error [{e.code}] {method} {endpoint}: {err_body}")
            raise
    return None

def get_product_by_handle(handle):
    res = api_request('GET', f"products.json?handle={handle}")
    prods = res.get('products', [])
    return prods[0] if prods else None

def get_product_by_id(pid):
    res = api_request('GET', f"products/{pid}.json")
    return res.get('product')

def update_product(pid, payload):
    return api_request('PUT', f"products/{pid}.json", {'product': payload})

def create_product(payload):
    return api_request('POST', "products.json", {'product': payload})

def upload_product_image_base64(pid, file_path, alt_text=""):
    if not os.path.exists(file_path):
        print(f"  ⚠️ Image file not found: {file_path}")
        return None
    with open(file_path, 'rb') as f:
        b64_data = base64.b64encode(f.read()).decode('utf-8')
    payload = {
        'image': {
            'attachment': b64_data,
            'filename': os.path.basename(file_path),
            'alt': alt_text
        }
    }
    return api_request('POST', f"products/{pid}/images.json", payload)

def sync_existing_product_handles():
    print("\n--- 1. Syncing Existing Product Handles & Titles ---")
    
    # 1. Harness: speedypet-harness -> harness
    harness = get_product_by_id(10422661349562)
    if harness:
        print(f"Updating Harness (ID: {harness['id']}) to handle 'harness'...")
        update_product(harness['id'], {
            'id': harness['id'],
            'title': 'SafePet Heavy-Duty Chest Harness',
            'handle': 'harness',
            'template_suffix': 'harness'
        })
        print("  ✅ Harness handle updated to 'harness'")

    # 2. GPS Tracker: wireless-tracker -> safepet-gps-tracker
    gps = get_product_by_id(10422660792506)
    if gps:
        print(f"Updating GPS Tracker (ID: {gps['id']}) to handle 'safepet-gps-tracker'...")
        update_product(gps['id'], {
            'id': gps['id'],
            'title': 'SafePet GPS Tracker™',
            'handle': 'safepet-gps-tracker',
            'template_suffix': 'gps-tracker'
        })
        print("  ✅ GPS Tracker handle updated to 'safepet-gps-tracker'")

    # 3. Brush: brush -> safepet-3-in-1-pet-brush
    brush = get_product_by_id(10422660432058)
    if brush:
        print(f"Updating Brush (ID: {brush['id']}) to handle 'safepet-3-in-1-pet-brush'...")
        update_product(brush['id'], {
            'id': brush['id'],
            'title': 'SafePet 3-in-1 Pet Brush',
            'handle': 'safepet-3-in-1-pet-brush',
            'template_suffix': 'pet-brush'
        })
        print("  ✅ Brush handle updated to 'safepet-3-in-1-pet-brush'")

    # 4. Shammy Towel: shammy-dog-towel -> safepet-shammy-dog-towel
    towel = get_product_by_id(10422660595898)
    if towel:
        print(f"Updating Towel (ID: {towel['id']}) to handle 'safepet-shammy-dog-towel'...")
        update_product(towel['id'], {
            'id': towel['id'],
            'title': 'SafePet® Shammy Dog Towel',
            'handle': 'safepet-shammy-dog-towel',
            'template_suffix': 'shammy-towel'
        })
        print("  ✅ Towel handle updated to 'safepet-shammy-dog-towel'")

    # 5. Car Seat Cover: car-seat-cover -> safepet-car-seat-cover
    cover = get_product_by_id(10422661054650)
    if cover:
        print(f"Updating Car Seat Cover (ID: {cover['id']}) to handle 'safepet-car-seat-cover'...")
        update_product(cover['id'], {
            'id': cover['id'],
            'title': 'SafePet™ All-Weather Rear Car Seat Cover',
            'handle': 'safepet-car-seat-cover',
            'template_suffix': 'car-seat-cover'
        })
        print("  ✅ Car Seat Cover handle updated to 'safepet-car-seat-cover'")

    # 6. Main Seat Belt: get-fdsb -> dog-seat-belt with 3 bundle variants
    seatbelt = get_product_by_id(10422661284026)
    if seatbelt:
        print(f"Updating Seat Belt (ID: {seatbelt['id']}) with 3 bundle tiers...")
        update_product(seatbelt['id'], {
            'id': seatbelt['id'],
            'title': 'SafePet Strap™ Heavy-Duty Dog Car Seat Belt',
            'handle': 'dog-seat-belt',
            'template_suffix': 'safepet-strap',
            'options': [{'name': 'Bundle Size'}],
            'variants': [
                {
                    'id': seatbelt['variants'][0]['id'],
                    'option1': '1 Seat Belt',
                    'price': '0.00',
                    'compare_at_price': '29.95',
                    'sku': 'SPS-01',
                    'requires_shipping': True,
                    'inventory_management': 'shopify',
                    'inventory_policy': 'continue'
                },
                {
                    'option1': '2 Seat Belts (Value $60)',
                    'price': '17.95',
                    'compare_at_price': '59.90',
                    'sku': 'SPS-02',
                    'requires_shipping': True,
                    'inventory_management': 'shopify',
                    'inventory_policy': 'continue'
                },
                {
                    'option1': '3 Seat Belts + Free E-Book (Value $120)',
                    'price': '24.95',
                    'compare_at_price': '120.00',
                    'sku': 'SPS-03',
                    'requires_shipping': True,
                    'inventory_management': 'shopify',
                    'inventory_policy': 'continue'
                }
            ]
        })
        print("  ✅ Main Seat Belt updated with 3-tier bundle variants & handle 'dog-seat-belt'")

def create_missing_upsell_products():
    print("\n--- 2. Creating Missing Upsell & Companion Products ---")

    # 1. The Calm Car Rider E-Book
    ebook = get_product_by_handle('the-calm-car-rider-ebook')
    if not ebook:
        print("Creating 'the-calm-car-rider-ebook'...")
        body_html = """<p><strong>Transform your dog into a settled, quiet, and happy passenger in just 7 days!</strong></p>
<p>Does your dog whine, pace, pant uncontrollably, or try to climb onto your lap every time you drive? <em>The Calm Car Rider</em> is the official vet-approved behavioral and physical blueprint designed to eliminate car ride panic at the root.</p>
<h3>What's Inside The Blueprint:</h3>
<ul>
  <li><strong>The 7-Day Calm Passenger Protocol:</strong> Daily 10-minute desensitization sessions that rewire your dog's brain from fear to comfort.</li>
  <li><strong>Vestibular Motion Sickness Cure:</strong> Why dogs get car sick and the 3 simple rules to stop nausea, drool, and vomiting.</li>
  <li><strong>Physical Kinetic Anchoring:</strong> How using the SafePet Strap stabilizes their inner ear balance system during turns and braking.</li>
  <li><strong>Rapid Troubleshooting Guide:</strong> Immediate solutions for high-pitched whining, strap chewing, and barking at passing cars.</li>
  <li><strong>Pre-Trip Road Safety Checklist:</strong> Essential pre-drive checks to keep your dog 100% safe.</li>
</ul>
<p><em>Instant digital download provided immediately upon checkout (PDF & HTML format compatible with all smartphones, tablets, and computers).</em></p>"""
        p = create_product({
            'title': 'The Calm Car Rider: 7-Day Dog Travel & Anxiety Blueprint (Digital E-Book)',
            'handle': 'the-calm-car-rider-ebook',
            'body_html': body_html,
            'vendor': 'SafePet Strap',
            'product_type': 'Digital Book',
            'tags': 'Ebook, Digital Download, Dog Training, Car Anxiety, Free Bonus, Upsell',
            'status': 'active',
            'template_suffix': 'the-calm-car-rider',
            'variants': [{
                'price': '9.95',
                'compare_at_price': '29.00',
                'sku': 'SPS-EB-01',
                'requires_shipping': False,
                'inventory_management': None
            }]
        })
        ebook_id = p['product']['id']
        print(f"  ✅ Created E-Book (ID: {ebook_id})")
        # Upload cover image
        img_path = '/Users/imacm1/.gemini/antigravity/brain/ed7e42f2-ccf6-462e-bebc-0c1881331fcb/calm_car_rider_1786962513347.jpg'
        if os.path.exists(img_path):
            upload_product_image_base64(ebook_id, img_path, "The Calm Car Rider E-Book Cover")
            print("  ✅ Uploaded E-Book cover image")
    else:
        print("  ℹ️ E-Book already exists")

    # 2. Lifetime Replacement Warranty (Chew-Proof Protection)
    warranty = get_product_by_handle('lifetime-replacement-warranty')
    if not warranty:
        print("Creating 'lifetime-replacement-warranty'...")
        body_html = """<p><strong>100% Zero-Questions-Asked Replacement Guarantee</strong></p>
<p>Protect your dog seat belt, harness, and travel gear for life against chew damage, sharp puppy teeth, extreme pulling, or accidental wear and tear. If your dog ever chews through your strap, we replace it instantly for FREE.</p>"""
        p = create_product({
            'title': 'Chew-Proof Protection & Lifetime Replacement Warranty',
            'handle': 'lifetime-replacement-warranty',
            'body_html': body_html,
            'vendor': 'SafePet Strap',
            'product_type': 'Warranty Service',
            'tags': 'Warranty, Chew-Proof, Upsell, Cart-Hidden',
            'status': 'active',
            'variants': [{
                'price': '7.95',
                'compare_at_price': '19.95',
                'sku': 'SPS-WAR-01',
                'requires_shipping': False,
                'inventory_management': None
            }]
        })
        war_id = p['product']['id']
        print(f"  ✅ Created Lifetime Warranty (ID: {war_id})")
    else:
        print("  ℹ️ Lifetime Warranty already exists")

    # 3. The "Pet Emergency" Car Window Sticker
    sticker = get_product_by_handle('the-pet-emergency-car-window-sticker')
    if not sticker:
        print("Creating 'the-pet-emergency-car-window-sticker'...")
        body_html = """<p><strong>High-Visibility Reflective Emergency Rescue Decal</strong></p>
<p>In the event of an accident or vehicle emergency, first responders need to know that your pet is secured inside. This heavy-duty, weather-resistant, reflective window decal alerts emergency crews immediately to ensure your pet is safely rescued.</p>"""
        p = create_product({
            'title': 'The "Pet Emergency" Car Window Safety Sticker',
            'handle': 'the-pet-emergency-car-window-sticker',
            'body_html': body_html,
            'vendor': 'SafePet Strap',
            'product_type': 'Car Accessories',
            'tags': 'Sticker, Safety, Decal, Upsell',
            'status': 'active',
            'template_suffix': 'window-sticker',
            'variants': [{
                'price': '4.95',
                'compare_at_price': '14.95',
                'sku': 'SPS-STK-01',
                'requires_shipping': True,
                'inventory_management': None
            }]
        })
        print(f"  ✅ Created Window Sticker (ID: {p['product']['id']})")
    else:
        print("  ℹ️ Window Sticker already exists")

    # 4. Personalized ID Tag
    id_tag = get_product_by_handle('personalized-id-tag')
    if not id_tag:
        print("Creating 'personalized-id-tag'...")
        body_html = """<p><strong>Custom Laser-Engraved Stainless Steel Pet ID Tag</strong></p>
<p>Keep your pet safe wherever they travel. Deeply laser engraved with your dog's name and primary contact phone number. Crafted from rust-proof stainless steel with a mirror-polished finish.</p>"""
        p = create_product({
            'title': 'Personalized Engraved Pet ID Tag',
            'handle': 'personalized-id-tag',
            'body_html': body_html,
            'vendor': 'SafePet Strap',
            'product_type': 'Pet Accessories',
            'tags': 'Tag, Engraved, ID Tag, Custom, Upsell',
            'status': 'active',
            'template_suffix': 'id-tag',
            'variants': [{
                'price': '9.95',
                'compare_at_price': '24.95',
                'sku': 'SPS-TAG-01',
                'requires_shipping': True,
                'inventory_management': None
            }]
        })
        print(f"  ✅ Created Personalized ID Tag (ID: {p['product']['id']})")
    else:
        print("  ℹ️ Personalized ID Tag already exists")

    # 5. SafePet UltraPad
    pad = get_product_by_handle('safepet-ultrapad')
    if not pad:
        print("Creating 'safepet-ultrapad'...")
        body_html = """<p><strong>Ultra-Absorbent 4-Layer Waterproof Washable Protection Mat</strong></p>
<p>The ultimate multi-purpose protection mat for car seats, trunks, couches, and floors. Locks in moisture, mud, drool, and pet hair with a non-slip silicone bottom grip.</p>"""
        p = create_product({
            'title': 'SafePet UltraPad™ Washable Heavy-Duty Car & Home Mat',
            'handle': 'safepet-ultrapad',
            'body_html': body_html,
            'vendor': 'SafePet Strap',
            'product_type': 'Pet Mat',
            'tags': 'Mat, Pee Pad, Car Seat, Waterproof, Upsell',
            'status': 'active',
            'template_suffix': 'puppy-pad',
            'options': [{'name': 'Size'}],
            'variants': [
                {'option1': 'Small (20" x 28")', 'price': '29.95', 'compare_at_price': '49.95', 'sku': 'SPS-PAD-S'},
                {'option1': 'Medium (28" x 36")', 'price': '39.95', 'compare_at_price': '64.95', 'sku': 'SPS-PAD-M'},
                {'option1': 'Large (36" x 48")', 'price': '49.95', 'compare_at_price': '79.95', 'sku': 'SPS-PAD-L'}
            ]
        })
        pad_id = p['product']['id']
        print(f"  ✅ Created SafePet UltraPad (ID: {pad_id})")
        for img_name, label in [('puppy-pad-size-s.jpg', 'Size S'), ('puppy-pad-size-m.jpg', 'Size M'), ('puppy-pad-size-l.jpg', 'Size L'), ('ocu-ultrapad-car-lifestyle.jpg', 'Lifestyle')]:
            p_img = os.path.join('/Users/imacm1/SafePet/assets', img_name)
            if os.path.exists(p_img):
                upload_product_image_base64(pad_id, p_img, label)
        print("  ✅ Uploaded UltraPad images")
    else:
        print("  ℹ️ SafePet UltraPad already exists")

def create_upsell_discount_codes():
    print("\n--- 3. Creating Price Rules & Discount Codes ---")
    
    # Check existing price rules
    rules_resp = api_request('GET', 'price_rules.json')
    existing_rules = {r['title']: r['id'] for r in rules_resp.get('price_rules', [])}

    # 1. HARNESS2X ($4.00 off for 2x harness)
    if 'HARNESS2X' not in existing_rules:
        print("Creating price rule & discount code for HARNESS2X ($4.00 off)...")
        pr = api_request('POST', 'price_rules.json', {
            'price_rule': {
                'title': 'HARNESS2X',
                'target_type': 'line_item',
                'target_selection': 'all',
                'allocation_method': 'across',
                'value_type': 'fixed_amount',
                'value': '-4.00',
                'customer_selection': 'all',
                'starts_at': '2026-01-01T00:00:00Z'
            }
        })
        pr_id = pr['price_rule']['id']
        api_request('POST', f"price_rules/{pr_id}/discount_codes.json", {
            'discount_code': {'code': 'HARNESS2X'}
        })
        print("  ✅ Created discount code: HARNESS2X")
    else:
        print("  ℹ️ HARNESS2X already exists")

    # 2. HARNESS3X ($15.00 off for 3x harness)
    if 'HARNESS3X' not in existing_rules:
        print("Creating price rule & discount code for HARNESS3X ($15.00 off)...")
        pr = api_request('POST', 'price_rules.json', {
            'price_rule': {
                'title': 'HARNESS3X',
                'target_type': 'line_item',
                'target_selection': 'all',
                'allocation_method': 'across',
                'value_type': 'fixed_amount',
                'value': '-15.00',
                'customer_selection': 'all',
                'starts_at': '2026-01-01T00:00:00Z'
            }
        })
        pr_id = pr['price_rule']['id']
        api_request('POST', f"price_rules/{pr_id}/discount_codes.json", {
            'discount_code': {'code': 'HARNESS3X'}
        })
        print("  ✅ Created discount code: HARNESS3X")
    else:
        print("  ℹ️ HARNESS3X already exists")

    # 3. EXAMPLE10 (10% off for popup)
    if 'EXAMPLE10' not in existing_rules:
        print("Creating price rule & discount code for EXAMPLE10 (10% off)...")
        pr = api_request('POST', 'price_rules.json', {
            'price_rule': {
                'title': 'EXAMPLE10',
                'target_type': 'line_item',
                'target_selection': 'all',
                'allocation_method': 'across',
                'value_type': 'percentage',
                'value': '-10.0',
                'customer_selection': 'all',
                'starts_at': '2026-01-01T00:00:00Z'
            }
        })
        pr_id = pr['price_rule']['id']
        api_request('POST', f"price_rules/{pr_id}/discount_codes.json", {
            'discount_code': {'code': 'EXAMPLE10'}
        })
        print("  ✅ Created discount code: EXAMPLE10")
    else:
        print("  ℹ️ EXAMPLE10 already exists")

if __name__ == '__main__':
    sync_existing_product_handles()
    create_missing_upsell_products()
    create_upsell_discount_codes()
    print("\n🎉 ALL UPSELL PRODUCTS, HANDLES, AND DISCOUNTS ARE FULLY SYNCED!")
