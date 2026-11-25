#!/usr/bin/env python3
"""
SafePet 2-Year Anniversary Smart Dispatcher & Anti-Ban Delivery Engine (107k Scale)
Creates $0.00 VIP Anniversary Gift Voucher orders on Shopify with `send_receipt: True`
to deliver the custom Order Confirmation email directly to customer primary inboxes.

SMART ANTI-BAN & ANTI-SPAM PROTECTIONS:
  1. Progressive Warm-Up Ladder: 7-stage ramp curve to prime sender reputation with Gmail/Yahoo.
  2. List Hygiene & Typo Shield: Automatically uses audited & cleaned emails from SQLite.
  3. Anti-Fingerprint Pacing: Randomized delay jitter (±0.35s) + scheduled micro-pauses.
  4. Leaky Bucket Rate Limiting: Dynamic 429 Retry-After handling with automatic backoff.
  5. 100% Resumable SQLite Checkpoint: Zero duplicates, instant resume from anywhere.
"""
import os, sys, json, ssl, time, random, sqlite3, argparse, urllib.request, urllib.parse, urllib.error

# Load environment configuration
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

# Warm-up ladder definitions
WARMUP_LADDER = {
    1: {'name': 'Stage 1: VIP Buyers (Reputation Primer)', 'segment': 'buyers', 'batch_size': 300, 'delay': 1.5, 'pause_every': 50, 'pause_duration': 15},
    2: {'name': 'Stage 2: Pilot Wave (Freshest Leads)', 'segment': 'leads', 'batch_size': 1000, 'delay': 2.0, 'pause_every': 100, 'pause_duration': 20},
    3: {'name': 'Stage 3: Controlled Scaling', 'segment': 'leads', 'batch_size': 2500, 'delay': 1.8, 'pause_every': 150, 'pause_duration': 20},
    4: {'name': 'Stage 4: Acceleration Wave', 'segment': 'leads', 'batch_size': 5000, 'delay': 1.5, 'pause_every': 200, 'pause_duration': 25},
    5: {'name': 'Stage 5: High Velocity Growth', 'segment': 'leads', 'batch_size': 15000, 'delay': 1.2, 'pause_every': 250, 'pause_duration': 30},
    6: {'name': 'Stage 6: Scale Broadcast', 'segment': 'leads', 'batch_size': 35000, 'delay': 1.0, 'pause_every': 300, 'pause_duration': 30},
    7: {'name': 'Stage 7: Full Sweep (Remaining Leads)', 'segment': 'leads', 'batch_size': None, 'delay': 0.8, 'pause_every': 400, 'pause_duration': 30},
}

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
    c.execute("SELECT COUNT(*) FROM customers WHERE status = 'error'")
    errors = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count > 0')
    buyers = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM customers WHERE orders_count > 0 AND status = 'pending'")
    buyers_pending = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count = 0')
    leads = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM customers WHERE orders_count = 0 AND status = 'pending'")
    leads_pending = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM customers WHERE hygiene_status = 'typo_fixed'")
    typos_fixed = c.fetchone()[0]
    conn.close()
    return {
        'total': total,
        'pending': pending,
        'dispatched': dispatched,
        'errors': errors,
        'buyers': buyers,
        'buyers_pending': buyers_pending,
        'leads': leads,
        'leads_pending': leads_pending,
        'typos_fixed': typos_fixed
    }

def get_customers_queue(segment='all', limit=None):
    if not os.path.exists(DB_PATH):
        return []
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Pull clean_email if available, otherwise raw email. Exclude bad hygiene.
    query = """
        SELECT id, COALESCE(clean_email, email) as final_email, first_name, last_name, phone, orders_count
        FROM customers
        WHERE status = 'pending' AND hygiene_status NOT IN ('disposable', 'role_trap', 'syntax_invalid')
    """
    if segment == 'buyers':
        query += " AND orders_count > 0"
    elif segment == 'leads':
        query += " AND orders_count = 0"

    # Order buyers by orders_count desc, leads by id desc so freshest leads go first
    if segment == 'buyers':
        query += " ORDER BY orders_count DESC, id DESC"
    else:
        query += " ORDER BY id DESC"

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
        WHERE email = ? OR clean_email = ?
    ''', (status, order_name, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), error_msg, email, email))
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
            "note": "SafePet 2-Year Anniversary Free Dog Seat Belt VIP Gift Voucher",
            "tags": "anniversary_gift,vip_promo_2026,free_seat_belt_voucher",
            "customer": {
                "first_name": (customer_data.get('first_name') or 'VIP Member').strip() or 'VIP Member',
                "last_name": (customer_data.get('last_name') or 'VIP').strip() or 'VIP',
                "email": customer_data['email']
            },
            "line_items": [
                {
                    "title": "SafePet Dog Car Seat Belt - VIP 2-Year Anniversary Gift Voucher ($29.99 Value)",
                    "price": "0.00",
                    "quantity": 1,
                    "requires_shipping": True
                }
            ],
            "note_attributes": [
                {
                    "name": "Offer",
                    "value": "2-Year Anniversary Celebration - Free Dog Car Seat Belt"
                },
                {
                    "name": "Redemption_URL",
                    "value": "https://www.safepetstrap.com/products/dog-seat-belt"
                }
            ]
        }
    }

    url = f"https://{domain}/admin/api/2024-01/orders.json"
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
    }

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    backoff = 2.0
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                return res.get('order')
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', backoff))
                print(f"    [Rate Limit 429] Backing off for {wait_sec + 1.0:.1f}s...")
                time.sleep(wait_sec + 1.0)
                backoff *= 1.5
                continue
            err_body = e.read().decode('utf-8')
            raise RuntimeError(f"HTTP {e.code}: {err_body}")
        except Exception as e:
            if attempt < 4:
                time.sleep(backoff)
                backoff *= 1.5
                continue
            raise e
    return None

def main():
    parser = argparse.ArgumentParser(description="SafePet 2-Year Anniversary Smart Dispatcher & Anti-Ban Delivery Engine")
    parser.add_argument('--store', choices=['src', 'tgt'], default='src',
                        help="Target store ('src' = r038b3-ux old store [default], 'tgt' = ezuam5-nq new store)")
    parser.add_argument('--segment', choices=['all', 'buyers', 'leads'], default='all',
                        help="Audience segment: 'buyers' (261 verified customers), 'leads' (106k leads), 'all' (107k)")
    parser.add_argument('--warmup-stage', type=int, choices=list(WARMUP_LADDER.keys()), default=None,
                        help="Select a preset warm-up stage (1 through 7) with optimized anti-ban pacing")
    parser.add_argument('--batch-size', type=int, default=None,
                        help="Number of customers to process in this run (e.g. 500, 1000)")
    parser.add_argument('--delay', type=float, default=None,
                        help="Delay in seconds between order creations (default: 1.5s)")
    parser.add_argument('--pause-every', type=int, default=100,
                        help="Pause every N orders to allow mail queue buffer to drain (default: 100)")
    parser.add_argument('--pause-duration', type=int, default=15,
                        help="Duration of pause in seconds (default: 15s)")
    parser.add_argument('--test-email', type=str, default=None,
                        help="Send a single test order notification to this email address")
    parser.add_argument('--dry-run', action='store_true',
                        help="Simulate execution and print queue stats without creating real orders")
    parser.add_argument('--live', action='store_true',
                        help="Execute real live order creations with transactional email notifications")
    parser.add_argument('--confirm', action='store_true',
                        help="Explicit safety confirmation flag required for --live execution")

    args = parser.parse_args()

    # Determine target credentials
    if args.store == 'src':
        target_domain = SRC_DOMAIN
        client_id = SRC_CLIENT_ID
        client_secret = SRC_CLIENT_SECRET
    else:
        target_domain = TGT_DOMAIN
        client_id = TGT_CLIENT_ID
        client_secret = TGT_CLIENT_SECRET

    if not client_id or not client_secret:
        print(f"❌ Error: Missing credentials for store '{args.store}' in .env.migration")
        sys.exit(1)

    # Warmup stage overrides
    if args.warmup_stage:
        stage_cfg = WARMUP_LADDER[args.warmup_stage]
        args.segment = stage_cfg['segment']
        if args.batch_size is None:
            args.batch_size = stage_cfg['batch_size']
        if args.delay is None:
            args.delay = stage_cfg['delay']
        args.pause_every = stage_cfg['pause_every']
        args.pause_duration = stage_cfg['pause_duration']

    if args.delay is None:
        args.delay = 1.5

    # 1. Status / Stats Mode
    if args.dry_run or (not args.test_email and not args.live):
        stats = get_db_stats()
        print("\n" + "="*70)
        print("📊 SAFEPET 107K SMART SENDING DASHBOARD & DATABASE METRICS")
        print("="*70)
        if stats:
            print(f"Store Target                  : {target_domain}")
            print(f"Total Unique Valid Customers  : {stats['total']:,}")
            print(f"  • Verified Buyers (Paid > $0): {stats['buyers']:,} ({stats['buyers_pending']:,} pending)")
            print(f"  • Leads / Abandoned Checkouts: {stats['leads']:,} ({stats['leads_pending']:,} pending)")
            print(f"  • Typos Auto-Fixed in DB     : {stats['typos_fixed']:,}")
            print(f"Progress Overview:")
            print(f"  • Pending in Queue           : {stats['pending']:,}")
            print(f"  • Successfully Dispatched    : {stats['dispatched']:,}")
            print(f"  • Errors Logged              : {stats['errors']:,}")
        else:
            print("Database not found. Run export script first.")

        print("\n--- 🛡️ RECOMMENDED PROGRESSIVE WARM-UP LADDER ---")
        for s_idx, s_info in WARMUP_LADDER.items():
            b_sz = f"{s_info['batch_size']:,}" if s_info['batch_size'] else "All Remaining"
            print(f"  Stage {s_idx}: {s_info['name']}")
            print(f"           Audience: {s_info['segment'].upper()} | Batch: {b_sz} | Pacing: {s_info['delay']}s | Pause: {s_info['pause_duration']}s every {s_info['pause_every']}")

        queue = get_customers_queue(segment=args.segment, limit=5)
        if queue:
            print(f"\nNext 5 in Queue [Segment: {args.segment.upper()}]:")
            for idx, c in enumerate(queue, 1):
                role = "BUYER" if c['orders_count'] > 0 else "LEAD"
                print(f"  [{idx}] [{role}] {c['first_name']} {c['last_name']} <{c['email']}>")

        print("\nCommands:")
        print("  1. Send Test Order Notification:")
        print("     python3 scripts/dispatch_anniversary_orders.py --test-email=YOUR_EMAIL@gmail.com")
        print("  2. Launch Warm-Up Stage 1 (261 Verified Buyers - Reputation Primer):")
        print("     python3 scripts/dispatch_anniversary_orders.py --warmup-stage=1 --live --confirm")
        print("  3. Launch Warm-Up Stage 2 (1,000 Freshest Leads):")
        print("     python3 scripts/dispatch_anniversary_orders.py --warmup-stage=2 --live --confirm")
        return

    # Authenticate
    token = get_token(target_domain, client_id, client_secret)

    # 2. Test Email Mode
    if args.test_email:
        test_email = args.test_email.strip().lower()
        print(f"\n🚀 Sending TEST Anniversary Gift Order to: {test_email} (via {target_domain})...")
        test_cust = {
            'email': test_email,
            'first_name': 'Test Dog Mom',
            'last_name': 'SafePet VIP',
            'phone': '+18005550199'
        }
        res = create_gift_order(target_domain, token, test_cust, send_receipt=True)
        if res:
            print(f"✅ Success! Created Order {res.get('name')} (ID: {res.get('id')}).")
            print(f"👉 Check the inbox of {test_email} to preview the live rendered email!")
        return

    # 3. Live Broadcast Mode
    if args.live:
        if not args.confirm:
            print("\n❌ SAFETY HALT: You must pass '--confirm' alongside '--live' to execute.")
            sys.exit(1)

        queue = get_customers_queue(segment=args.segment, limit=args.batch_size)
        if not queue:
            print("\n✅ Queue is empty! All customers in this segment have already been dispatched.")
            return

        print("\n" + "="*70)
        print(f"🚨 STARTING LIVE VIP ANNIVERSARY BROADCAST")
        if args.warmup_stage:
            print(f"🚀 Running: {WARMUP_LADDER[args.warmup_stage]['name']}")
        print(f"Queue Size      : {len(queue):,} customers")
        print(f"Audience Segment: {args.segment.upper()}")
        print(f"Base Pacing     : {args.delay}s (±0.35s jitter) | Pause: {args.pause_duration}s every {args.pause_every} orders")
        print(f"Target Store    : {target_domain}")
        print("="*70)

        success_count = 0
        error_count = 0
        start_time = time.time()

        for idx, c in enumerate(queue, 1):
            em = c['email']
            role = "BUYER" if c['orders_count'] > 0 else "LEAD"
            print(f"[{idx:,}/{len(queue):,}] [{role}] Creating gift order for {c['first_name']} <{em}>...")

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

            # Micro-pause buffer
            if idx % args.pause_every == 0 and idx < len(queue):
                print(f"  ⏳ [Queue Drainage Buffer] Pausing {args.pause_duration}s to allow Shopify mail relays to drain smoothly...")
                time.sleep(args.pause_duration)
            else:
                # Anti-fingerprint jitter: base delay ± 0.35s
                jitter = random.uniform(-0.35, 0.35)
                actual_delay = max(0.5, args.delay + jitter)
                time.sleep(actual_delay)

            if idx % 25 == 0:
                elapsed = time.time() - start_time
                rate = idx / elapsed if elapsed > 0 else 0
                remaining = (len(queue) - idx) / rate if rate > 0 else 0
                print(f"--- Progress: {idx:,}/{len(queue):,} ({idx/len(queue)*100:.1f}%) | Speed: {rate*60:.1f} orders/min | ETA: {remaining/60:.1f} mins ---")

        total_elapsed = time.time() - start_time
        print("\n" + "="*70)
        print(f"🎉 BATCH COMPLETE: {success_count:,} orders created | {error_count:,} errors | Elapsed: {total_elapsed/60:.1f} mins")
        print(f"Database checkpoint updated: {DB_PATH}")
        print("="*70)

if __name__ == '__main__':
    main()
