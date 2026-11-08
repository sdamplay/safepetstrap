#!/usr/bin/env python3
"""
Complete Product Image Sync & Template Suffix Automation for SafePet Strap.
1. Assigns exact template_suffix to all 10 custom product templates.
2. Uploads all local/remote gallery images to their respective products.
3. Links variant-specific images to each variant (e.g. Harness S, M, L, XL; Dog Seat Belt 1x, 2x, 3x; UltraPad S, M, L).
"""
import os
import sys
import json
import time
import base64
import ssl
import urllib.request
import urllib.error

TOKEN = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')

if not TOKEN:
    print("❌ Error: SHOPIFY_TARGET_TOKEN environment variable is required.")
    sys.exit(1)

ctx = ssl._create_unverified_context()

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

def get_all_products():
    res = api_request('GET', 'products.json?limit=250')
    return {p['handle']: p for p in res.get('products', [])}

def update_product_template(pid, handle, template_suffix):
    payload = {'product': {'id': pid, 'template_suffix': template_suffix}}
    res = api_request('PUT', f"products/{pid}.json", payload)
    if res and 'product' in res:
        print(f"  ✅ Suffix '{template_suffix}' applied to {handle}")
    else:
        print(f"  ❌ Failed to update suffix for {handle}")

def upload_image_if_missing(pid, existing_images, img_source, alt_text, filename=None):
    """
    img_source: either a local file path or a http(s) URL
    """
    fname = filename or os.path.basename(img_source)
    # Check if an image with this alt or matching filename already exists
    for img in existing_images:
        existing_alt = img.get('alt') or ''
        existing_src = img.get('src') or ''
        if alt_text and existing_alt == alt_text:
            return img['id'], False
        if fname and fname.split('.')[0] in existing_src:
            return img['id'], False

    payload_img = {'alt': alt_text}
    if img_source.startswith('http://') or img_source.startswith('https://'):
        payload_img['src'] = img_source
    else:
        if not os.path.exists(img_source):
            print(f"  ⚠️ Warning: Local file not found: {img_source}")
            return None, False
        with open(img_source, 'rb') as f:
            b64_data = base64.b64encode(f.read()).decode('utf-8')
        payload_img['attachment'] = b64_data
        payload_img['filename'] = fname

    print(f"  📤 Uploading image for product {pid}: {fname} ('{alt_text}')...")
    res = api_request('POST', f"products/{pid}/images.json", {'image': payload_img})
    if res and 'image' in res:
        created_img = res['image']
        existing_images.append(created_img)
        print(f"    ✅ Uploaded! ID: {created_img['id']}")
        time.sleep(0.3)
        return created_img['id'], True
    return None, False

def assign_variant_image(vid, img_id, variant_title):
    if not img_id:
        return
    payload = {'variant': {'id': vid, 'image_id': img_id}}
    res = api_request('PUT', f"variants/{vid}.json", payload)
    if res and 'variant' in res:
        print(f"  🖼️ Variant '{variant_title}' mapped to Image ID {img_id}")
    else:
        print(f"  ❌ Failed to map variant '{variant_title}'")
    time.sleep(0.2)

def main():
    print("==================================================")
    print("STEP 1: FETCHING PRODUCTS & UPDATING TEMPLATE SUFFIXES")
    print("==================================================")
    products = get_all_products()

    TEMPLATE_MAP = {
        'dog-seat-belt': 'safepet-strap',
        'harness': 'harness',
        'safepet-car-seat-cover': 'car-seat-cover',
        'safepet-ultrapad': 'puppy-pad',
        'personalized-id-tag': 'id-tag',
        'safepet-3-in-1-pet-brush': 'pet-brush',
        'safepet-gps-tracker': 'gps-tracker',
        'safepet-shammy-dog-towel': 'shammy-towel',
        'the-pet-emergency-car-window-sticker': 'window-sticker',
        'the-calm-car-rider-ebook': 'the-calm-car-rider'
    }

    for handle, suffix in TEMPLATE_MAP.items():
        if handle in products:
            p = products[handle]
            if p.get('template_suffix') != suffix:
                update_product_template(p['id'], handle, suffix)
            else:
                print(f"  ℹ️ {handle} already has suffix '{suffix}'")

    print("\n==================================================")
    print("STEP 2: SYNCING PRODUCT IMAGES & VARIANT MAPPINGS")
    print("==================================================")
    # Refresh products
    products = get_all_products()

    # 1. HARNESS
    if 'harness' in products:
        p = products['harness']
        pid = p['id']
        imgs = list(p.get('images', []))
        variants = p.get('variants', [])
        print(f"\n--- Processing 'harness' (ID: {pid}) ---")

        # Variant images
        s_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Harness-XS-JackRussel-2-min_1080x.webp',
            'SafePet No-Pull Harness Small Jack Russell',
            'harness-small-jack-russell.webp'
        )
        m_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Harness_Medium_Variant-min_1080x.webp',
            'SafePet No-Pull Harness Medium Beagle',
            'harness-medium-beagle.webp'
        )
        l_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Harness_Large_Variant-min_1080x.webp',
            'SafePet No-Pull Harness Large Golden Retriever',
            'harness-large-golden.webp'
        )
        xl_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Harness_X-Large_Variant-min_1080x.webp',
            'SafePet No-Pull Harness X-Large German Shepherd',
            'harness-xlarge-shepherd.webp'
        )

        # Gallery images
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Harness_info _1_-min.png',
            'SafePet No-Pull Harness Breathable Mesh & Safety Lock Features',
            'harness-features-infographic.png'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0106/9085/4971/products/pawsafe-dog-harness-vest-feature-dog-1_700x700_d196747a-9bab-4f19-bfe6-226758bdaaba.jpg',
            'SafePet Harness Ergonomic Comfort Padded Vest'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0106/9085/4971/products/pawsafe-dog-harness-vest-feature-dog-2_700x700_4ba8e712-336b-4095-b3f4-e5a93bbd74ce.jpg',
            'SafePet Harness No Choke Pull Distribution'
        )

        # Map variants
        for v in variants:
            title = v.get('title', '')
            vid = v['id']
            if 'XL' in title or title.startswith('XL'):
                assign_variant_image(vid, xl_img_id, title)
            elif 'L ' in title or title.startswith('L'):
                assign_variant_image(vid, l_img_id, title)
            elif 'M ' in title or title.startswith('M'):
                assign_variant_image(vid, m_img_id, title)
            elif 'S ' in title or title.startswith('S'):
                assign_variant_image(vid, s_img_id, title)

    # 2. DOG SEAT BELT
    if 'dog-seat-belt' in products:
        p = products['dog-seat-belt']
        pid = p['id']
        imgs = list(p.get('images', []))
        variants = p.get('variants', [])
        print(f"\n--- Processing 'dog-seat-belt' (ID: {pid}) ---")

        b1_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/1_seat_belt_variant-min_fdb26d4e-10c4-4715-b9b5-8c6ff488ca89.png',
            'SafePet 1 Dog Car Seat Belt Universal Latch',
            'safepet-1-seat-belt-variant.png'
        )
        b2_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/2_seat_belt_variant-min_9a1490cc-b799-4e1d-bc80-01b695dc38b0.png',
            'SafePet 2 Dog Car Seat Belts Value Pack',
            'safepet-2-seat-belt-variant.png'
        )
        b3_img_id, _ = upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/safepet-3pack-ebook-offer.jpg',
            'SafePet 3 Dog Car Seat Belts + Free E-Book Ultimate Pack',
            'safepet-3pack-ebook-offer.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/hero-testimonial-proof.jpg',
            'SafePet Seat Belt Proven Safety Customer Testimonial',
            'safepet-hero-testimonial-proof.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/Hot-Car-Adjustable-Dog-Seat-Belt-Upgraded-Auto-Seatbelt-Harness-Leads-Buffer-Elastic-Reflective-Safety-Rope.webp',
            'SafePet Elastic Anti-Whiplash Buffer & 360 Swivel Carabiner',
            'safepet-seatbelt-features-detail.webp'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0106/9085/4971/products/61_mBxUnb3L._SX679.jpg',
            'SafePet Aircraft Grade Swivel Clip Close Up'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0106/9085/4971/products/71Epam28RoL._SX679.jpg',
            'SafePet Universal 21mm Stainless Steel Buckle Fit'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0106/9085/4971/products/81UdpTKmOtL._SX679.jpg',
            'SafePet Reflective Night Threading Visibility'
        )

        for v in variants:
            title = v.get('title', '')
            vid = v['id']
            if '1 ' in title or title.startswith('1'):
                assign_variant_image(vid, b1_img_id, title)
            elif '2 ' in title or title.startswith('2'):
                assign_variant_image(vid, b2_img_id, title)
            elif '3 ' in title or title.startswith('3'):
                assign_variant_image(vid, b3_img_id, title)

    # 3. ULTRAPAD
    if 'safepet-ultrapad' in products:
        p = products['safepet-ultrapad']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'safepet-ultrapad' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ultrapad-product-white.png',
            'SafePet UltraPad Reusable Waterproof Dog Car Seat Pad White Studio',
            'ultrapad-product-white.png'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ultrapad-hero-frenchie.jpg',
            'SafePet UltraPad French Bulldog Car Seat Protection',
            'ultrapad-hero-frenchie.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ultrapad-layer-breakdown.jpg',
            'SafePet UltraPad 4-Layer Advanced Waterproof & Odor Locking Technology',
            'ultrapad-layer-breakdown.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ultrapad-machine-washable.jpg',
            'SafePet UltraPad 100% Machine Washable & Quick Dry',
            'ultrapad-machine-washable.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ultrapad-size-guide.jpg',
            'SafePet UltraPad Sizing & Dog Breed Fit Guide',
            'ultrapad-size-guide.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ocu-ultrapad-car-lifestyle.jpg',
            'SafePet UltraPad Backseat Travel Protection',
            'ocu-ultrapad-car-lifestyle.jpg'
        )

    # 4. CAR SEAT COVER
    if 'safepet-car-seat-cover' in products:
        p = products['safepet-car-seat-cover']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'safepet-car-seat-cover' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ocu-seatcover-upsell-infographic.jpg',
            'SafePet All-Weather Car Seat Cover Multi-Layer Durability',
            'ocu-seatcover-upsell-infographic.jpg'
        )

    # 5. PERSONALIZED ID TAG
    if 'personalized-id-tag' in products:
        p = products['personalized-id-tag']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'personalized-id-tag' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/id-tag-your-dog-transparent_1080x.webp',
            'SafePet Custom Laser Engraved Dog ID Tag',
            'id-tag-your-dog-transparent.webp'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/1tag.jpg',
            'SafePet Personalized Tag 1 Pack',
            'id-tag-1pack.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/2tags.jpg',
            'SafePet Personalized Tag 2 Pack',
            'id-tag-2pack.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/3tags.jpg',
            'SafePet Personalized Tag 3 Pack',
            'id-tag-3pack.jpg'
        )
        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/What-to-Put-on-Dog-Tag-Step-13.jpg',
            'SafePet Custom ID Tag Laser Engraved Information Guide',
            'id-tag-engraving-guide.jpg'
        )

    # 6. PET BRUSH
    if 'safepet-3-in-1-pet-brush' in products:
        p = products['safepet-3-in-1-pet-brush']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'safepet-3-in-1-pet-brush' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/brush.jpeg',
            'SafePet 3-in-1 Self-Cleaning Deshedding Pet Brush',
            'safepet-brush-white.jpeg'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0603/1219/1070/files/Image1-01.png?v=1739711060',
            'SafePet 3-in-1 Pet Brush 2 Pack Value'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0603/1219/1070/files/Image2Revised-02.png?v=1739711060',
            'SafePet 3-in-1 Pet Brush 3 Pack Family Bundle'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0603/1219/1070/files/7_5b14a201-c8b5-402d-ae83-802ff53a13bf.jpg?v=1739711209',
            'SafePet 3-in-1 Pet Brush Gentle Grooming Bristles'
        )

    # 7. GPS TRACKER
    if 'safepet-gps-tracker' in products:
        p = products['safepet-gps-tracker']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'safepet-gps-tracker' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/Downloads/2023-Smart-Mini-GPS-Tracker-Anti-Lost-Finder-iTag-Tracker-Alarm-GPS-Locator-Wireles-Positioning-Wallet.jpg_.webp',
            'SafePet Smart Real-Time GPS Pet Tracker Device',
            'safepet-gps-tracker-device.webp'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0603/1219/1070/files/47fb9033a41d334cbb25f938b11e1fbad93d94c9-500_3f1d0987-5b0f-4e5c-b690-e24ab797f47e.webp',
            'SafePet GPS Tracker Collar Attachment'
        )
        upload_image_if_missing(
            pid, imgs,
            'https://cdn.shopify.com/s/files/1/0603/1219/1070/files/d90f6092694a309a63cf8f45f3ae1c63a9b19d26-500_5247d3d7-51cb-4b2c-93b3-e7e8e18c624d.webp',
            'SafePet GPS Tracker Waterproof Rugged Design'
        )

    # 8. SHAMMY DOG TOWEL
    if 'safepet-shammy-dog-towel' in products:
        p = products['safepet-shammy-dog-towel']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'safepet-shammy-dog-towel' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/shammy_dog_towel_card.png',
            'SafePet Ultra-Absorbent Quick-Dry Shammy Dog Towel',
            'shammy_dog_towel_card.png'
        )

    # 9. WINDOW STICKER
    if 'the-pet-emergency-car-window-sticker' in products:
        p = products['the-pet-emergency-car-window-sticker']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'the-pet-emergency-car-window-sticker' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/sticker_dog_on_board.png',
            'SafePet Pet Emergency Rescue Alert Car Window Decal',
            'sticker_dog_on_board.png'
        )

    # 10. CALM CAR RIDER EBOOK
    if 'the-calm-car-rider-ebook' in products:
        p = products['the-calm-car-rider-ebook']
        pid = p['id']
        imgs = list(p.get('images', []))
        print(f"\n--- Processing 'the-calm-car-rider-ebook' (ID: {pid}) ---")

        upload_image_if_missing(
            pid, imgs,
            '/Users/imacm1/SafePet/assets/ebook-calm-car-rider.jpg',
            'The Calm Car Rider Complete Dog Vehicle Anxiety Guide E-Book',
            'ebook-calm-car-rider.jpg'
        )

    print("\n==================================================")
    print("ALL PRODUCT IMAGES & TEMPLATES SUCCESSFULLY SYNCED!")
    print("==================================================")

if __name__ == '__main__':
    main()
