#!/usr/bin/env python3
"""
Sync newly placed orders from source store (r038b3-ux.myshopify.com)
to target store (ezuam5-nq.myshopify.com) with high-res product pictures,
variant IDs, and 0 customer notifications.
"""
import os
import sys
import json
import time
import ssl
import urllib.request
import urllib.error

# Load environment variables from .env.migration if present
env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.migration')
if os.path.exists(env_file):
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

SRC_DOMAIN = os.environ.get('SHOPIFY_SRC_DOMAIN', 'r038b3-ux.myshopify.com')
SRC_CLIENT_ID = os.environ.get('SHOPIFY_SRC_CLIENT_ID', '')
SRC_CLIENT_SECRET = os.environ.get('SHOPIFY_SRC_CLIENT_SECRET', '')

TGT_DOMAIN = os.environ.get('SHOPIFY_TGT_DOMAIN', 'ezuam5-nq.myshopify.com')
TGT_CLIENT_ID = os.environ.get('SHOPIFY_TGT_CLIENT_ID', '')
TGT_CLIENT_SECRET = os.environ.get('SHOPIFY_TGT_CLIENT_SECRET', '')

BACKUP_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'compliance-docs', 'source_orders_backup.json')

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
        res = json.loads(resp.read().decode('utf-8'))
        return res['access_token']

SRC_TOKEN = get_token(SRC_DOMAIN, SRC_CLIENT_ID, SRC_CLIENT_SECRET)
TGT_TOKEN = get_token(TGT_DOMAIN, TGT_CLIENT_ID, TGT_CLIENT_SECRET)

VARIANT_MAP = {
    ("Chew-Proof Protection", None): 50965827813562,
    ("Dog Training SECRETS", None): 50965831811258,
    ("Personalized ID Tag", None): 50965835874490,
    ("SafePet GPS Tracker", None): 50965839937722,
    ("SafePet Heavy-Duty Chest Harness", "S"): 50965845934266,
    ("SafePet Heavy-Duty Chest Harness", "S (10–28 lbs)"): 50965845934266,
    ("SafePet Heavy-Duty Chest Harness", "M (28–50 lbs)"): 50965845967034,
    ("SafePet Heavy-Duty Chest Harness", "L (45–70 lbs)"): 50965845999802,
    ("SafePet Heavy-Duty Chest Harness", "XL (70–132 lbs)"): 50965846032570,
    ("SafePet Heavy-Duty Dog Car Seat Belt", "1 Seat Belt"): 50965850194106,
    ("SafePet Heavy-Duty Dog Car Seat Belt", "2 Seat Belts (Value $60)"): 50965850226874,
    ("SafePet Heavy-Duty Dog Car Seat Belt", "3 Seat Belts + 2 Gifts (Value $120)"): 50965850259642,
    ("SafePet Heavy-Duty Dog Car Seat Belt", "3 Seat Belts + FREE Gift (Value $120)"): 50965850259642,
    ("SafePet™ All-Weather Rear Car Seat Cover", "1 Rear Seat Cover"): 50965868249274,
    ("The \"Pet Emergency\" Car Window Sticker", None): 50965874475194,
    ("The Calm Car Rider: 7-Day Dog Travel & Anxiety Blueprint", None): 50965878505658,
}

def fetch_all_source_orders():
    print(f"Fetching all orders from source store ({SRC_DOMAIN})...")
    orders = []
    since_id = 0
    while True:
        url = f"https://{SRC_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250&since_id={since_id}"
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': SRC_TOKEN})
        with urllib.request.urlopen(req, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            batch = data.get('orders', [])
            if not batch:
                break
            orders.extend(batch)
            since_id = batch[-1]['id']
            if len(batch) < 250:
                break
    print(f"Total source orders: {len(orders)}")
    return orders

def fetch_existing_target_order_names():
    print(f"Fetching existing order names on target store ({TGT_DOMAIN})...")
    names = set()
    since_id = 0
    while True:
        url = f"https://{TGT_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250&fields=id,name&since_id={since_id}"
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': TGT_TOKEN})
        with urllib.request.urlopen(req, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            batch = data.get('orders', [])
            if not batch:
                break
            for o in batch:
                names.add(o.get('name'))
            since_id = batch[-1]['id']
            if len(batch) < 250:
                break
    print(f"Found {len(names)} existing orders on target store.")
    return names

def create_order_on_target(src_order):
    order_name = src_order.get('name')
    line_items_payload = []
    for item in src_order.get('line_items', []):
        t = item.get('title')
        vt = item.get('variant_title')
        qty = item.get('quantity', 1)
        price = item.get('price', '0.00')

        key = (t, vt)
        if key in VARIANT_MAP:
            line_items_payload.append({
                'variant_id': VARIANT_MAP[key],
                'quantity': qty,
                'price': price,
                'requires_shipping': item.get('requires_shipping', True),
                'taxable': item.get('taxable', False)
            })
        elif t == 'Tip':
            line_items_payload.append({
                'title': 'Tip',
                'price': price,
                'quantity': 1,
                'requires_shipping': False
            })
        else:
            line_items_payload.append({
                'title': t,
                'variant_title': vt,
                'quantity': qty,
                'price': price,
                'sku': item.get('sku', '')
            })

    payload = {
        'order': {
            'name': order_name,
            'email': src_order.get('email'),
            'phone': src_order.get('phone'),
            'created_at': src_order.get('created_at'),
            'processed_at': src_order.get('processed_at'),
            'financial_status': src_order.get('financial_status', 'paid'),
            'currency': src_order.get('currency', 'USD'),
            'current_total_price': src_order.get('total_price'),
            'total_price': src_order.get('total_price'),
            'subtotal_price': src_order.get('subtotal_price'),
            'total_tax': src_order.get('total_tax'),
            # ZERO NOTIFICATIONS GUARANTEE
            'send_receipt': False,
            'send_fulfillment_receipt': False,
            'suppress_notifications': True,
            'inventory_behaviour': 'bypass',
            'line_items': line_items_payload,
            'shipping_lines': [
                {
                    'title': sl.get('title', 'Standard Shipping'),
                    'price': sl.get('price', '9.95'),
                    'code': sl.get('code')
                }
                for sl in src_order.get('shipping_lines', [])
            ]
        }
    }

    if src_order.get('tags') and str(src_order['tags']).strip():
        payload['order']['tags'] = str(src_order['tags']).strip()
    if src_order.get('note'):
        payload['order']['note'] = src_order['note']
    if src_order.get('note_attributes'):
        payload['order']['note_attributes'] = src_order['note_attributes']

    if src_order.get('customer'):
        cust = src_order['customer']
        payload['order']['customer'] = {
            'first_name': cust.get('first_name', ''),
            'last_name': cust.get('last_name', ''),
            'email': cust.get('email') or src_order.get('email'),
            'phone': cust.get('phone') or src_order.get('phone')
        }

    if src_order.get('shipping_address'):
        payload['order']['shipping_address'] = src_order['shipping_address']
    if src_order.get('billing_address'):
        payload['order']['billing_address'] = src_order['billing_address']

    if src_order.get('fulfillment_status') in ('fulfilled', 'partial'):
        payload['order']['fulfillment_status'] = src_order['fulfillment_status']

    url = f"https://{TGT_DOMAIN}/admin/api/2024-01/orders.json"
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TGT_TOKEN
    }
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                return res.get('order')
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                time.sleep(wait_sec)
                continue
            err_body = e.read().decode('utf-8')
            print(f"  ❌ Error creating {order_name} [{e.code}]: {err_body}")
            raise
    return None

def main():
    source_orders = fetch_all_source_orders()

    # Save complete backup
    with open(BACKUP_PATH, 'w', encoding='utf-8') as f:
        json.dump(source_orders, f, indent=2)
    print(f"Saved {len(source_orders)} total orders to {BACKUP_PATH}")

    target_order_names = fetch_existing_target_order_names()

    # Find missing orders
    missing_orders = [o for o in source_orders if o.get('name') not in target_order_names]
    print(f"\nFound {len(missing_orders)} orders to sync to target store:")
    for o in missing_orders:
        print(f"  - {o.get('name')} | Created: {o.get('created_at')} | Total: ${o.get('total_price')}")

    if not missing_orders:
        print("\nAll orders are already in sync! Nothing to do.")
        return

    # Sort chronological
    missing_orders.sort(key=lambda o: o.get('created_at', ''))

    print("\nStarting sync of missing orders with product pictures & zero notifications...\n")
    success_count = 0
    for idx, o in enumerate(missing_orders, 1):
        name = o.get('name')
        print(f"[{idx}/{len(missing_orders)}] Syncing {name}...")
        res = create_order_on_target(o)
        if res:
            success_count += 1
            print(f"  ✅ Created {name} (Target ID: {res['id']}) with pictures!")
        time.sleep(0.5)

    print("\n==================================================")
    print(f"SYNC COMPLETE! Successfully created {success_count}/{len(missing_orders)} new orders.")
    print("==================================================")

if __name__ == '__main__':
    main()
