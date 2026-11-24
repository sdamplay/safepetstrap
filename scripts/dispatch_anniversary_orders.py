#!/usr/bin/env python3
"""
SafePet 2-Year Anniversary VIP Gift Order Dispatcher
Creates 1 $0.00 VIP Gift Voucher order per unique customer on r038b3-ux.myshopify.com
with `send_receipt: True` to deliver the custom Order Confirmation email.

Usage:
  python3 scripts/dispatch_anniversary_orders.py --dry-run
  python3 scripts/dispatch_anniversary_orders.py --test-email=your_email@gmail.com
  python3 scripts/dispatch_anniversary_orders.py --live --confirm
"""
import os, sys, json, ssl, time, argparse, urllib.request, urllib.parse, urllib.error

# Load environment variables from .env.migration
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

def extract_unique_customers(token):
    print(f"Loading customer orders from source store ({SRC_DOMAIN})...")
    orders = []
    if os.path.exists(BACKUP_PATH):
        with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
            orders = json.load(f)
        print(f"  Loaded {len(orders)} cached orders from {BACKUP_PATH}")
    else:
        since_id = 0
        while True:
            url = f"https://{SRC_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250&since_id={since_id}"
            req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': token})
            with urllib.request.urlopen(req, context=ctx) as resp:
                batch = json.loads(resp.read().decode('utf-8')).get('orders', [])
                if not batch: break
                orders.extend(batch)
                since_id = batch[-1]['id']
                if len(batch) < 250: break
        print(f"  Fetched {len(orders)} orders directly from API")

    # Group by normalized lowercase email
    customer_map = {}
    for o in orders:
        email = o.get('email') or (o.get('customer') or {}).get('email')
        if not email or '@' not in email:
            continue
        email_clean = email.strip().lower()
        if email_clean not in customer_map:
            cust = o.get('customer') or {}
            ship = o.get('shipping_address') or {}
            customer_map[email_clean] = {
                'email': email_clean,
                'first_name': cust.get('first_name') or ship.get('first_name') or 'VIP Member',
                'last_name': cust.get('last_name') or ship.get('last_name') or '',
                'phone': cust.get('phone') or ship.get('phone') or o.get('phone'),
                'shipping_address': ship,
                'billing_address': o.get('billing_address') or ship,
                'latest_order_name': o.get('name'),
                'latest_order_date': o.get('created_at')
            }

    print(f"  Found {len(customer_map)} unique customer emails.")
    return list(customer_map.values())

def create_gift_order(domain, token, customer_data, send_receipt=True):
    payload = {
        "order": {
            "email": customer_data['email'],
            "phone": customer_data.get('phone'),
            "financial_status": "paid",
            "fulfillment_status": "fulfilled",
            "currency": "USD",
            "current_total_price": "0.00",
            "total_price": "0.00",
            "subtotal_price": "0.00",
            "total_tax": "0.00",
            # Send receipt triggers the custom Order confirmation notification!
            "send_receipt": send_receipt,
            "send_fulfillment_receipt": False,
            "suppress_notifications": not send_receipt,
            "inventory_behaviour": "bypass",
            "tags": "2yr-anniversary-vip-gift, notification-broadcast",
            "note": "SafePet 2-Year Anniversary Complimentary Gift Reservation",
            "line_items": [
                {
                    "title": "SafePet 2-Year Anniversary VIP Gift — Complimentary Dog Seat Belt Voucher",
                    "price": "0.00",
                    "quantity": 1,
                    "requires_shipping": False,
                    "taxable": False
                }
            ],
            "customer": {
                "first_name": customer_data.get('first_name') or "VIP Member",
                "last_name": customer_data.get('last_name') or "",
                "email": customer_data['email'],
                "phone": customer_data.get('phone')
            }
        }
    }

    if customer_data.get('shipping_address'):
        payload['order']['shipping_address'] = customer_data['shipping_address']
    if customer_data.get('billing_address'):
        payload['order']['billing_address'] = customer_data['billing_address']

    url = f"https://{domain}/admin/api/2024-01/orders.json"
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
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
            print(f"  ❌ API Error [{e.code}]: {err_body}")
            raise
    return None

def main():
    parser = argparse.ArgumentParser(description="Dispatch 2-Year Anniversary VIP Gift Orders")
    parser.add_argument('--dry-run', action='store_true', help="Preview customer list without creating orders")
    parser.add_argument('--test-email', type=str, help="Send a single test gift order to this email address")
    parser.add_argument('--live', action='store_true', help="Run live creation across all customers")
    parser.add_argument('--confirm', action='store_true', help="Confirm live broadcast execution")
    args = parser.parse_args()

    token = get_token(SRC_DOMAIN, SRC_CLIENT_ID, SRC_CLIENT_SECRET)
    customers = extract_unique_customers(token)

    if args.dry_run or (not args.test_email and not args.live):
        print("\n" + "="*70)
        print("🔍 DRY-RUN MODE: Customer Broadcast Audit")
        print("="*70)
        print(f"Total Unique Customers Eligible: {len(customers)}")
        print("\nFirst 10 Customers in Queue:")
        for idx, c in enumerate(customers[:10], 1):
            print(f"  [{idx:03d}] {c['first_name']} {c['last_name']} <{c['email']}> (Last Order: {c['latest_order_name']})")
        if len(customers) > 10:
            print(f"  ... and {len(customers) - 10} more customers.")
        print("\nTo send a single test email first:")
        print("  python3 scripts/dispatch_anniversary_orders.py --test-email=YOUR_EMAIL@gmail.com")
        print("\nTo trigger the full live broadcast (after pasting template into Shopify):")
        print("  python3 scripts/dispatch_anniversary_orders.py --live --confirm")
        return

    if args.test_email:
        test_email = args.test_email.strip().lower()
        print(f"\n🚀 Sending TEST Gift Order to: {test_email}...")
        test_cust = {
            'email': test_email,
            'first_name': 'Test Dog Mom',
            'last_name': 'SafePet VIP',
            'phone': '+18005550199'
        }
        res = create_gift_order(SRC_DOMAIN, token, test_cust, send_receipt=True)
        if res:
            print(f"✅ Success! Created Order {res.get('name')} (ID: {res.get('id')}).")
            print(f"👉 Check the inbox of {test_email} to preview the live rendered email!")
        return

    if args.live:
        if not args.confirm:
            print("\n❌ SAFETY HALT: You must pass '--confirm' alongside '--live' to execute the broadcast.")
            print("Please ensure you have replaced the 'Order confirmation' template in Shopify Admin first!")
            sys.exit(1)

        print("\n" + "="*70)
        print(f"🚨 STARTING LIVE VIP ANNIVERSARY BROADCAST ({len(customers)} CUSTOMERS)")
        print("="*70)
        
        success_count = 0
        dispatched_log = []

        for idx, c in enumerate(customers, 1):
            print(f"[{idx}/{len(customers)}] Creating VIP gift order for {c['first_name']} <{c['email']}>...")
            try:
                res = create_gift_order(SRC_DOMAIN, token, c, send_receipt=True)
                if res:
                    success_count += 1
                    dispatched_log.append({
                        'order_name': res.get('name'),
                        'order_id': res.get('id'),
                        'customer_name': f"{c['first_name']} {c['last_name']}",
                        'email': c['email'],
                        'dispatched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                    })
                    print(f"  ✅ Created {res.get('name')} (ID: {res.get('id')})")
            except Exception as e:
                print(f"  ⚠️ Error sending to {c['email']}: {e}")

            time.sleep(0.5)

        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'compliance-docs', 'anniversary_dispatched_orders.json')
        with open(log_path, 'w', encoding='utf-8') as f:
            json.dump(dispatched_log, f, indent=2)

        print("\n" + "="*70)
        print(f"🎉 BROADCAST COMPLETE: {success_count}/{len(customers)} orders created & emails triggered!")
        print(f"📄 Log saved to: {log_path}")
        print("="*70)

if __name__ == '__main__':
    main()
