#!/usr/bin/env python3
"""
Sync placed AliExpress Order IDs and tags back to Shopify orders.
Can target either the new store (ezuam5-nq) or old store (r038b3-ux).
"""
import os
import sys
import json
import time
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

def sync_store(target='new'):
    placed_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fulfillment', 'placed_orders.json')
    with open(placed_path, 'r', encoding='utf-8') as f:
        placed_orders = json.load(f)

    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.migration')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as ef:
            for line in ef:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

    if target == 'new':
        domain = os.environ.get('SHOPIFY_TGT_DOMAIN', 'ezuam5-nq.myshopify.com')
        client_id = os.environ.get('SHOPIFY_TGT_CLIENT_ID', '')
        client_secret = os.environ.get('SHOPIFY_TGT_CLIENT_SECRET', '')
    else:
        domain = os.environ.get('SHOPIFY_SRC_DOMAIN', 'r038b3-ux.myshopify.com')
        client_id = os.environ.get('SHOPIFY_SRC_CLIENT_ID', '')
        client_secret = os.environ.get('SHOPIFY_SRC_CLIENT_SECRET', '')

    print(f"\n==================================================")
    print(f" Syncing AE Order IDs -> Shopify: {domain}")
    print(f"==================================================\n")

    try:
        token = get_token(domain, client_id, client_secret)
    except Exception as e:
        print(f"❌ Failed to get access token for {domain}: {e}")
        return

    # Fetch orders on domain
    print(f"⏳ Fetching orders from {domain}...")
    orders = []
    since_id = 0
    while True:
        url = f"https://{domain}/admin/api/2024-01/orders.json?status=any&limit=250&since_id={since_id}"
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': token})
        try:
            with urllib.request.urlopen(req, context=ctx) as r:
                batch = json.loads(r.read())['orders']
                if not batch:
                    break
                orders.extend(batch)
                since_id = batch[-1]['id']
                if len(batch) < 250:
                    break
        except Exception as e:
            print(f"❌ Error fetching orders: {e}")
            return

    orders_by_name = {o['name']: o for o in orders}
    print(f"📋 Loaded {len(orders)} orders from {domain}.\n")

    updated_count = 0
    skipped_count = 0
    error_count = 0

    for order_name, info in sorted(placed_orders.items()):
        if order_name == '#SPS941227':
            print(f"⏭️  {order_name}: Manually fulfilled by user. Skipping.")
            skipped_count += 1
            continue

        ali_ids = info.get('ali_order_ids', [])
        if not ali_ids or ali_ids == ['MANUALLY_FULFILLED']:
            continue

        shopify_order = orders_by_name.get(order_name)
        if not shopify_order:
            print(f"⚠️  {order_name} not found on {domain}!")
            error_count += 1
            continue

        existing_tags = [t.strip() for t in (shopify_order.get('tags') or '').split(',') if t.strip()]
        new_tags = list(existing_tags)
        if 'ae-placed' not in new_tags:
            new_tags.append('ae-placed')
        for aid in ali_ids:
            id_tag = f"ali-id:{aid}"
            if id_tag not in new_tags:
                new_tags.append(id_tag)

        # Build note
        date_str = info.get('placed_at', '2026-11-09')[:10]
        ae_note_line = f"Order ID: {', '.join(ali_ids)} - {date_str}"
        existing_note = (shopify_order.get('note') or '').strip()
        if ae_note_line not in existing_note:
            new_note = f"{existing_note}\n{ae_note_line}".strip() if existing_note else ae_note_line
        else:
            new_note = existing_note

        tags_changed = set(existing_tags) != set(new_tags)
        note_changed = existing_note != new_note

        if not tags_changed and not note_changed:
            print(f"✨ {order_name} is already up to date with AE IDs: {', '.join(ali_ids)}")
            skipped_count += 1
            continue

        # Update order
        put_url = f"https://{domain}/admin/api/2024-01/orders/{shopify_order['id']}.json"
        payload = {
            'order': {
                'id': shopify_order['id'],
                'tags': ', '.join(new_tags),
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

        try:
            with urllib.request.urlopen(req_put, context=ctx) as r_put:
                res = json.loads(r_put.read())['order']
                print(f"✅ {order_name} updated on {domain} -> AE Order ID(s): {', '.join(ali_ids)}")
                updated_count += 1
        except urllib.error.HTTPError as he:
            err_msg = he.read().decode('utf-8')
            print(f"❌ Failed to update {order_name} on {domain} [{he.code}]: {err_msg}")
            error_count += 1
        except Exception as e:
            print(f"❌ Failed to update {order_name} on {domain}: {e}")
            error_count += 1

        time.sleep(0.4)

    print(f"\n==================================================")
    print(f" SUMMARY for {domain}:")
    print(f" Updated: {updated_count}")
    print(f" Skipped: {skipped_count}")
    print(f" Errors:  {error_count}")
    print(f"==================================================\n")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'new'
    sync_store(target)
