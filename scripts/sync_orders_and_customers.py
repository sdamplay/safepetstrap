#!/usr/bin/env python3
import os
import json
import time
import urllib.request
import urllib.error

TOKEN_SRC = os.environ.get('SHOPIFY_SRC_TOKEN', '')
DOMAIN_SRC = os.environ.get('SHOPIFY_SRC_DOMAIN', 'safepet-strap.myshopify.com')

TOKEN_TGT = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN_TGT = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')

def get_existing_target_orders():
    orders = {}
    url = f'https://{DOMAIN_TGT}/admin/api/2024-01/orders.json?status=any&limit=250&fields=id,name,email'
    while url:
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': TOKEN_TGT})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for o in data.get('orders', []):
                orders[o['name']] = o['id']
            # Check Link header for next page
            link_header = resp.headers.get('Link')
            url = None
            if link_header:
                for part in link_header.split(','):
                    if 'rel="next"' in part:
                        url = part.split(';')[0].strip('<> ')
    return orders

def fetch_source_orders():
    print(f"Fetching all orders from source store: {DOMAIN_SRC}...")
    orders = []
    url = f'https://{DOMAIN_SRC}/admin/api/2024-01/orders.json?status=any&limit=250'
    while url:
        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': TOKEN_SRC})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            batch = data.get('orders', [])
            orders.extend(batch)
            print(f"  Fetched {len(batch)} orders (total so far: {len(orders)})")
            link_header = resp.headers.get('Link')
            url = None
            if link_header:
                for part in link_header.split(','):
                    if 'rel="next"' in part:
                        url = part.split(';')[0].strip('<> ')
    return orders

def create_order_on_target(src_order):
    payload = {
        'order': {
            'name': src_order.get('name'),
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
            'note': src_order.get('note'),
            'note_attributes': src_order.get('note_attributes', []),
            # ZERO NOTIFICATIONS GUARANTEE
            'send_receipt': False,
            'send_fulfillment_receipt': False,
            'suppress_notifications': True,
            'inventory_behaviour': 'bypass',
            'line_items': [
                {
                    'title': item.get('title'),
                    'variant_title': item.get('variant_title'),
                    'price': item.get('price'),
                    'quantity': item.get('quantity'),
                    'sku': item.get('sku'),
                    'requires_shipping': item.get('requires_shipping', True),
                    'taxable': item.get('taxable', False)
                }
                for item in src_order.get('line_items', [])
            ],
            'shipping_lines': [
                {
                    'title': sl.get('title'),
                    'price': sl.get('price'),
                    'code': sl.get('code')
                }
                for sl in src_order.get('shipping_lines', [])
            ]
        }
    }

    if src_order.get('customer'):
        cust = src_order['customer']
        payload['order']['customer'] = {
            'first_name': cust.get('first_name', ''),
            'last_name': cust.get('last_name', ''),
            'email': cust.get('email') or src_order.get('email'),
            'phone': cust.get('phone') or src_order.get('phone'),
            'verified_email': True,
            'send_email_welcome': False
        }

    if src_order.get('billing_address'):
        payload['order']['billing_address'] = src_order['billing_address']

    if src_order.get('shipping_address'):
        payload['order']['shipping_address'] = src_order['shipping_address']

    if src_order.get('tags') and src_order['tags'].strip():
        payload['order']['tags'] = src_order['tags'].strip()

    if src_order.get('fulfillments'):
        valid_fulfillments = []
        for f in src_order['fulfillments']:
            t_num = f.get('tracking_number')
            t_comp = f.get('tracking_company')
            if t_num:
                valid_fulfillments.append({
                    'tracking_number': t_num,
                    'tracking_company': t_comp or 'USPS',
                    'status': 'success'
                })
        if valid_fulfillments:
            payload['order']['fulfillments'] = valid_fulfillments

    tgt_req = urllib.request.Request(
        f'https://{DOMAIN_TGT}/admin/api/2024-01/orders.json',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN_TGT}
    )

    for attempt in range(5):
        try:
            with urllib.request.urlopen(tgt_req) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                return res.get('order')
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                time.sleep(wait_sec)
            else:
                err_body = e.read().decode('utf-8')
                print(f"  ❌ Error creating {src_order.get('name')}: {e.code} - {err_body}")
                return None
    return None

def main():
    # Save a complete local JSON backup first
    src_orders = fetch_source_orders()
    backup_path = '/Users/imacm1/SafePet/compliance-docs/source_orders_backup.json'
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(src_orders, f, indent=2)
    print(f"Saved complete backup of {len(src_orders)} source orders to {backup_path}")

    existing_target_orders = get_existing_target_orders()
    print(f"Found {len(existing_target_orders)} existing orders on target store {DOMAIN_TGT}.")

    # Sort orders chronologically so they are created in original order (earliest to latest)
    src_orders.sort(key=lambda o: o.get('created_at', ''))

    created_count = 0
    skipped_count = 0

    for idx, order in enumerate(src_orders, 1):
        name = order.get('name')
        if name in existing_target_orders:
            print(f"[{idx}/{len(src_orders)}] Skipping already synced order: {name}")
            skipped_count += 1
            continue

        res = create_order_on_target(order)
        if res:
            created_count += 1
            cust_email = res.get('customer', {}).get('email') or res.get('email')
            print(f"[{idx}/{len(src_orders)}] ✅ Synced {name} | ID: {res['id']} | Customer: {cust_email} | Total: ${res.get('total_price')}")
        else:
            print(f"[{idx}/{len(src_orders)}] ❌ Failed to sync {name}")
        time.sleep(0.3)

    print("\n==========================================")
    print("ORDERS & CUSTOMERS SYNC COMPLETE!")
    print(f"Total Source Orders: {len(src_orders)}")
    print(f"Newly Created: {created_count}")
    print(f"Already Synced: {skipped_count}")
    print(f"All customer notifications strictly suppressed: YES")
    print("==========================================")

if __name__ == '__main__':
    main()
