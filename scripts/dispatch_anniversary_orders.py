#!/usr/bin/env python3
"""
SafePet 2-Year Anniversary VIP Gift Order Dispatcher (107k Scale Edition)
Creates $0.00 VIP Gift Voucher orders on r038b3-ux.myshopify.com
with `send_receipt: True` to deliver the custom Order Confirmation email.

Features:
  - SQLite Checkpointing & Resumable Queues (never sends duplicate emails)
  - Segmentation: all (107k), buyers (orders_count > 0), leads (abandoned checkouts)
  - Controlled batch sizes (--batch-size=1000)
  - Automatic 429 rate limit backoff
"""
import os, sys, json, ssl, time, sqlite3, argparse, urllib.request, urllib.parse, urllib.error

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

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'compliance-docs', 'customers_107k.db')
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

def get_db_stats():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM customers')
    total = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM customers WHERE status = 'pending'")
    pending = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM customers WHERE status = 'dispatched'")
    dispatched = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count > 0')
    buyers = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count = 0')
    leads = c.fetchone()[0]
    conn.close()
    return {
        'total': total,
        'pending': pending,
        'dispatched': dispatched,
        'buyers': buyers,
        'leads': leads
    }

def get_customers_queue(segment='all', limit=None):
    if not os.path.exists(DB_PATH):
        return []
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    query = "SELECT id, email, first_name, last_name, phone, orders_count FROM customers WHERE status = 'pending'"
    if segment == 'buyers':
        query += " AND orders_count > 0"
    elif segment == 'leads':
        query += " AND orders_count = 0"
    if limit:
        query += f" LIMIT {int(limit)}"
    c.execute(query)
    rows = c.fetchall()
    conn.close()
    return [{
        'id': r[0],
        'email': r[1],
        'first_name': r[2] or 'VIP Member',
        'last_name': r[3] or '',
        'phone': r[4],
        'orders_count': r[5]
    } for r in rows]

def mark_customer_status(email, status, order_name=None, error_msg=None):
    if not os.path.exists(DB_PATH):
        return
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        UPDATE customers
        SET status = ?, order_name = ?, dispatched_at = ?, error_message = ?
        WHERE email = ?
    ''', (status, order_name, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), error_msg, email))
    conn.commit()
    conn.close()

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
    parser = argparse.ArgumentParser(description="Dispatch 2-Year Anniversary VIP Gift Orders (107k Scale Edition)")
    parser.add_argument('--dry-run', action='store_true', help="Audit database and display status")
    parser.add_argument('--test-email', type=str, help="Send a single test gift order to this email address")
    parser.add_argument('--segment', choices=['all', 'buyers', 'leads'], default='all', help="Target segment: all (107k), buyers (orders>0), leads (orders=0)")
    parser.add_argument('--batch-size', type=int, default=None, help="Process a specific batch limit (e.g. 1000)")
    parser.add_argument('--store', choices=['old', 'new'], default='old', help="Store to dispatch from ('old': r038b3-ux, 'new': ezuam5-nq)")
    parser.add_argument('--live', action='store_true', help="Run live creation")
    parser.add_argument('--confirm', action='store_true', help="Confirm live broadcast execution")
    args = parser.parse_args()

    # Determine target store domain and credentials
    if args.store == 'new':
        target_domain = TGT_DOMAIN
        target_cid = TGT_CLIENT_ID
        target_sec = TGT_CLIENT_SECRET
    else:
        target_domain = SRC_DOMAIN
        target_cid = SRC_CLIENT_ID
        target_sec = SRC_CLIENT_SECRET

    token = get_token(target_domain, target_cid, target_sec)
    stats = get_db_stats()

    if args.dry_run or (not args.test_email and not args.live):
        print("\n" + "="*70)
        print(f"🔍 107K DATABASE AUDIT & STATUS (Target Store: {target_domain})")
        print("="*70)
        if stats:
            print(f"Total Unique Valid Customers in DB : {stats['total']:,}")
            print(f"  • Past Buyers (orders_count > 0) : {stats['buyers']:,}")
            print(f"  • Leads / Checkouts (orders = 0) : {stats['leads']:,}")
            print(f"  • Pending in Queue               : {stats['pending']:,}")
            print(f"  • Already Dispatched             : {stats['dispatched']:,}")
        else:
            print("Database is currently exporting or not initialized.")
            print("Run 'python3 scripts/export_all_customers.py' to build the 107k database.")

        queue = get_customers_queue(segment=args.segment, limit=5)
        if queue:
            print(f"\nNext 5 Customers in Queue [Segment: {args.segment.upper()}]:")
            for idx, c in enumerate(queue, 1):
                role = "BUYER" if c['orders_count'] > 0 else "LEAD"
                print(f"  [{idx}] [{role}] {c['first_name']} {c['last_name']} <{c['email']}>")

        print("\nCommands:")
        print("  1. Send Test Email:")
        print("     python3 scripts/dispatch_anniversary_orders.py --test-email=YOUR_EMAIL@gmail.com")
        print("  2. Run First Batch (e.g. 500 or 1,000 customers):")
        print(f"     python3 scripts/dispatch_anniversary_orders.py --live --confirm --segment={args.segment} --batch-size=1000")
        print("  3. Run Full Unattended Broadcast:")
        print(f"     python3 scripts/dispatch_anniversary_orders.py --live --confirm --segment={args.segment}")
        return

    if args.test_email:
        test_email = args.test_email.strip().lower()
        print(f"\n🚀 Sending TEST Gift Order to: {test_email} (via {target_domain})...")
        test_cust = {
            'email': test_email,
            'first_name': 'Test Dog Mom',
            'last_name': 'SafePet VIP',
            'phone': '+18005550199'
        }
        try:
            res = create_gift_order(target_domain, token, test_cust, send_receipt=True)
            if res:
                print(f"✅ Success! Created Order {res.get('name')} (ID: {res.get('id')}).")
                print(f"👉 Check the inbox of {test_email} to preview the live rendered email!")
        except urllib.error.HTTPError as e:
            if e.code == 403 and 'write_orders' in str(e.read()):
                print(f"\n❌ [Scope Required]: Your Custom App on '{target_domain}' needs the 'write_orders' permission.")
                print("👉 In Shopify Admin: Settings > Apps and sales channels > Develop apps")
                print("   Click your App > Configuration > Admin API > Check 'write_orders' > Save & Install!")
            else:
                raise
        return

    if args.live:
        if not args.confirm:
            print("\n❌ SAFETY HALT: You must pass '--confirm' alongside '--live' to execute the broadcast.")
            print("Please ensure you have replaced the 'Order confirmation' template in Shopify Admin first!")
            sys.exit(1)

        queue = get_customers_queue(segment=args.segment, limit=args.batch_size)
        if not queue:
            print("\n✅ Queue is empty! All customers in this segment have already been dispatched.")
            return

        print("\n" + "="*70)
        print(f"🚨 STARTING LIVE VIP ANNIVERSARY BROADCAST")
        print(f"Queue Size: {len(queue):,} customers | Segment: {args.segment.upper()} | Target: {target_domain}")
        print("="*70)

        success_count = 0
        error_count = 0
        start_time = time.time()

        for idx, c in enumerate(queue, 1):
            em = c['email']
            role = "BUYER" if c['orders_count'] > 0 else "LEAD"
            print(f"[{idx:,}/{len(queue):,}] [{role}] Creating order for {c['first_name']} <{em}>...")
            try:
                res = create_gift_order(target_domain, token, c, send_receipt=True)
                if res:
                    success_count += 1
                    order_name = res.get('name')
                    mark_customer_status(em, 'dispatched', order_name=order_name)
                    print(f"  ✅ Created {order_name} (ID: {res.get('id')})")
            except Exception as e:
                error_count += 1
                mark_customer_status(em, 'error', error_msg=str(e))
                print(f"  ⚠️ Error sending to {em}: {e}")

            # 2 requests/sec to respect Shopify standard bucket
            time.sleep(0.4)

            if idx % 100 == 0:
                elapsed = time.time() - start_time
                rate = idx / elapsed
                remaining = (len(queue) - idx) / rate if rate > 0 else 0
                print(f"--- Progress: {idx:,}/{len(queue):,} ({idx/len(queue)*100:.1f}%) | Speed: {rate:.1f} orders/sec | Est. Remaining: {remaining/60:.1f} mins ---")

        total_elapsed = time.time() - start_time
        print("\n" + "="*70)
        print(f"🎉 BATCH COMPLETE: {success_count:,} orders created | {error_count:,} errors | Elapsed: {total_elapsed/60:.1f} mins")
        print(f"Database checkpoint updated: {DB_PATH}")
        print("="*70)

if __name__ == '__main__':
    main()
