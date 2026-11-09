#!/usr/bin/env python3
"""
Sanitize all Shopify orders:
1. Remove all 'ae-placed', 'ali-placed', 'ali-id:*', 'fulfill-ae', 'fulfill-ali' tags.
2. Replace placed tags with 'PLAY'.
3. Clean notes to remove any mention of 'AliExpress' or 'dropship', keeping clean 'Order ID: X - YYYY-MM-DD'.
4. Zero customer notifications.
"""
import os
import sys
import json
import time
import re
import ssl
import urllib.request
import urllib.error

ctx = ssl._create_unverified_context()

def get_token(domain, client_id, client_secret):
    payload = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'client_credentials'
    }
    req = urllib.request.Request(
        f'https://{domain}/admin/oauth/access_token',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))['access_token']

def clean_tags(raw_tags):
    tags = [t.strip() for t in (raw_tags or '').split(',') if t.strip()]
    had_placed = False
    cleaned = []

    for t in tags:
        tl = t.lower()
        if tl in ('ae-placed', 'ali-placed') or tl.startswith('ali-id:') or tl in ('fulfill-ae', 'fulfill-ali', 'aliexpress'):
            had_placed = True
            continue
        cleaned.append(t)

    if had_placed:
        if 'PLAY' not in cleaned:
            cleaned.append('PLAY')

    return cleaned, had_placed

def clean_note(raw_note):
    if not raw_note:
        return ''

    lines = raw_note.split('\n')
    cleaned_lines = []

    for line in lines:
        l_stripped = line.strip()
        if not l_stripped:
            continue
        # Remove lines that literally say [AliExpress Order: ...] if there is another Order ID line
        if re.search(r'\[AliExpress\s+Order:?\s*[^\]]+\]', l_stripped, re.I):
            # Convert to clean Order ID line if not redundant
            extracted_ids = re.findall(r'\d{12,20}', l_stripped)
            if extracted_ids:
                l_stripped = f"Order ID: {', '.join(extracted_ids)}"
            else:
                continue

        # Sanitize any remaining aliexpress / dropship mentions
        l_stripped = re.sub(r'AliExpress\s*', '', l_stripped, flags=re.I).strip()
        l_stripped = re.sub(r'Dropship(ping)?\s*', '', l_stripped, flags=re.I).strip()
        if l_stripped:
            cleaned_lines.append(l_stripped)

    # Deduplicate lines
    unique_lines = []
    for l in cleaned_lines:
        if l not in unique_lines:
            unique_lines.append(l)

    return '\n'.join(unique_lines)

def sanitize_orders(domain, client_id, client_secret):
    print(f"\n==================================================")
    print(f" SANITIZING SHOPIFY ORDERS -> REPLACING WITH 'PLAY'")
    print(f" Domain: {domain}")
    print(f"==================================================\n")

    token = get_token(domain, client_id, client_secret)

    orders = []
    since_id = 0
    print("⏳ Fetching all orders...")
    while True:
        url = f"https://{domain}/admin/api/2024-01/orders.json?status=any&limit=250&since_id={since_id}"
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': token})
        with urllib.request.urlopen(req, context=ctx) as r:
            batch = json.loads(r.read())['orders']
            if not batch:
                break
            orders.extend(batch)
            since_id = batch[-1]['id']
            if len(batch) < 250:
                break

    print(f"📋 Loaded {len(orders)} total orders. Scanning for tags & notes to sanitize...\n")

    updated_count = 0
    skipped_count = 0

    for order in orders:
        order_name = order.get('name')
        orig_tags = order.get('tags') or ''
        orig_note = order.get('note') or ''

        new_tags_list, had_bad_tag = clean_tags(orig_tags)
        new_tags_str = ', '.join(new_tags_list)
        new_note = clean_note(orig_note)

        # Check if anything changed
        tags_changed = set([t.strip() for t in orig_tags.split(',') if t.strip()]) != set(new_tags_list)
        note_changed = orig_note.strip() != new_note.strip()

        if not tags_changed and not note_changed:
            skipped_count += 1
            continue

        put_url = f"https://{domain}/admin/api/2024-01/orders/{order['id']}.json"
        payload = {
            'order': {
                'id': order['id'],
                'tags': new_tags_str,
                'note': new_note
            }
        }
        req_put = urllib.request.Request(
            put_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': token
            },
            method='PUT'
        )

        for attempt in range(5):
            try:
                with urllib.request.urlopen(req_put, context=ctx) as r_put:
                    res = json.loads(r_put.read())['order']
                    print(f"🛡️  Sanitized {order_name}: Tags -> \"{new_tags_str}\"")
                    updated_count += 1
                    break
            except urllib.error.HTTPError as he:
                if he.code == 429:
                    wait_sec = float(he.headers.get('Retry-After', 1.5))
                    time.sleep(wait_sec)
                    continue
                print(f"❌ Error updating {order_name} [{he.code}]: {he.read().decode('utf-8')}")
                break
            except Exception as e:
                print(f"❌ Error updating {order_name}: {e}")
                break

        time.sleep(0.35)

    print(f"\n==================================================")
    print(f" SANITIZATION COMPLETE!")
    print(f" Orders Cleaned to 'PLAY': {updated_count}")
    print(f" Already Clean / Skipped:   {skipped_count}")
    print(f"==================================================\n")

if __name__ == '__main__':
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.migration')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as ef:
            for line in ef:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

    domain = os.environ.get('SHOPIFY_TGT_DOMAIN', 'ezuam5-nq.myshopify.com')
    client_id = os.environ.get('SHOPIFY_TGT_CLIENT_ID', '')
    client_secret = os.environ.get('SHOPIFY_TGT_CLIENT_SECRET', '')

    sanitize_orders(domain, client_id, client_secret)
