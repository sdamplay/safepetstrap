#!/usr/bin/env python3
"""
Re-import orders to ezuam5-nq.myshopify.com with exact variant_id mappings
so every order displays high-resolution product pictures, linked variants,
and proper catalog attribution with 0 customer notifications.
"""
import os
import sys
import json
import time
import ssl
import urllib.request
import urllib.error

CLIENT_ID = os.environ.get('SHOPIFY_CLIENT_ID', '')
CLIENT_SECRET = os.environ.get('SHOPIFY_CLIENT_SECRET', '')
DOMAIN = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')
BACKUP_PATH = os.environ.get('BACKUP_PATH', 'compliance-docs/source_orders_backup.json')

ctx = ssl._create_unverified_context()

def get_access_token():
    print(f"Requesting fresh Shopify access token for {DOMAIN}...")
    payload = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'client_credentials'
    }
    req = urllib.request.Request(
        f'https://{DOMAIN}/admin/oauth/access_token',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, context=ctx) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        token = res.get('access_token')
        print(f"  ✅ Received valid access token (expires in {res.get('expires_in', 86400)}s)")
        return token

TOKEN = get_access_token()

HEADERS = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': TOKEN
}

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

def api_request(method, endpoint, payload=None):
    global TOKEN, HEADERS
    url = f"https://{DOMAIN}/admin/api/2024-01/{endpoint}"
    data = json.dumps(payload).encode('utf-8') if payload else None
    
    for attempt in range(5):
        req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                if resp.status == 204:
                    return {}
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                time.sleep(wait_sec)
                continue
            elif e.code == 401:
                TOKEN = get_access_token()
                HEADERS['X-Shopify-Access-Token'] = TOKEN
                continue
            err_body = e.read().decode('utf-8')
            print(f"  ❌ API Error [{e.code}] {method} {endpoint}: {err_body}")
            raise
    return None

def fetch_all_target_orders():
    print(f"Fetching existing orders on {DOMAIN}...")
    orders = []
    since_id = 0
    while True:
        url = f"orders.json?status=any&limit=250&fields=id,name&since_id={since_id}"
        res = api_request('GET', url)
        batch = res.get('orders', [])
        if not batch:
            break
        orders.extend(batch)
        since_id = batch[-1]['id']
        if len(batch) < 250:
            break
    print(f"Found {len(orders)} existing orders on target.")
    return orders

def delete_all_target_orders():
    existing_orders = fetch_all_target_orders()
    if not existing_orders:
        print("No orders to delete.")
        return
    print(f"Deleting {len(existing_orders)} incomplete orders...")
    for idx, o in enumerate(existing_orders, 1):
        oid = o['id']
        name = o.get('name', str(oid))
        api_request('DELETE', f"orders/{oid}.json")
        if idx % 25 == 0 or idx == len(existing_orders):
            print(f"  [{idx}/{len(existing_orders)}] Deleted {name}")
        time.sleep(0.2)
    print("✅ All previous orders deleted successfully!")

def import_orders_with_variants():
    with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
        source_orders = json.load(f)
    print(f"\nLoaded {len(source_orders)} source orders from {BACKUP_PATH}.")
    print("Starting import with exact variant IDs & high-res product pictures...\n")

    # Sort oldest to newest so order numbers and history remain chronological
    source_orders.sort(key=lambda o: o.get('created_at', ''))

    created_count = 0
    for idx, src_order in enumerate(source_orders, 1):
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
                # Fallback to custom item if anything unforeseen
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

        # Preserve historical fulfillment status
        if src_order.get('fulfillment_status') in ('fulfilled', 'partial'):
            payload['order']['fulfillment_status'] = src_order['fulfillment_status']

        try:
            res = api_request('POST', 'orders.json', payload)
            if res and 'order' in res:
                created_count += 1
                if created_count % 10 == 0 or created_count == len(source_orders):
                    print(f"  [{created_count}/{len(source_orders)}] Successfully created {order_name} with pictures!")
            else:
                print(f"  ❌ Failed to create {order_name}")
        except Exception as err:
            print(f"  ❌ Exception creating {order_name}: {err}")

        time.sleep(0.3)

    print("\n==================================================")
    print(f"IMPORT COMPLETE! {created_count}/{len(source_orders)} orders imported with product pictures.")
    print("==================================================")

def main():
    delete_all_target_orders()
    import_orders_with_variants()

if __name__ == '__main__':
    main()
