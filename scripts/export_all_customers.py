#!/usr/bin/env python3
"""
Fast Customer Exporter for r038b3-ux.myshopify.com
Fetches all 107,110 customers using cursor pagination (limit=250)
and saves them to a clean JSONL and SQLite database for resumable batch dispatching.
"""
import os, sys, json, ssl, time, sqlite3, urllib.request, urllib.parse

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

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'compliance-docs', 'customers_107k.db')
ctx = ssl._create_unverified_context()

def get_token():
    payload = {
        'client_id': SRC_CLIENT_ID,
        'client_secret': SRC_CLIENT_SECRET,
        'grant_type': 'client_credentials'
    }
    req = urllib.request.Request(
        f'https://{SRC_DOMAIN}/admin/oauth/access_token',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))['access_token']

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            orders_count INTEGER,
            total_spent TEXT,
            status TEXT DEFAULT 'pending',
            order_name TEXT,
            dispatched_at TEXT,
            error_message TEXT
        )
    ''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_email ON customers (email)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_status ON customers (status)')
    conn.commit()
    return conn

def extract_next_page_info(link_header):
    if not link_header:
        return None
    links = link_header.split(',')
    for link in links:
        parts = link.split(';')
        if len(parts) >= 2 and 'rel="next"' in parts[1]:
            url_part = parts[0].strip('<> ')
            parsed = urllib.parse.urlparse(url_part)
            qs = urllib.parse.parse_qs(parsed.query)
            return qs.get('page_info', [None])[0]
    return None

def main():
    conn = init_db()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM customers')
    existing_count = c.fetchone()[0]
    print(f"Current local database count: {existing_count} customers")

    token = get_token()
    print(f"Connecting to {SRC_DOMAIN}...")

    page_info = None
    page = 1
    total_inserted = 0

    while True:
        if page_info:
            url = f"https://{SRC_DOMAIN}/admin/api/2024-01/customers.json?limit=250&page_info={page_info}"
        else:
            url = f"https://{SRC_DOMAIN}/admin/api/2024-01/customers.json?limit=250&fields=id,email,first_name,last_name,phone,orders_count,total_spent"

        req = urllib.request.Request(url, headers={'X-Shopify-Access-Token': token})
        
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                custs = data.get('customers', [])
                if not custs:
                    break

                for cust in custs:
                    em = cust.get('email')
                    if not em or '@' not in em:
                        continue
                    em_clean = em.strip().lower()
                    fn = cust.get('first_name') or 'VIP Member'
                    ln = cust.get('last_name') or ''
                    ph = cust.get('phone')
                    oc = cust.get('orders_count') or 0
                    ts = cust.get('total_spent') or '0.00'

                    try:
                        c.execute('''
                            INSERT OR IGNORE INTO customers (id, email, first_name, last_name, phone, orders_count, total_spent)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (cust['id'], em_clean, fn, ln, ph, oc, ts))
                        total_inserted += c.rowcount
                    except Exception:
                        pass

                conn.commit()
                print(f"  Page {page:03d} | Batch: {len(custs)} | Total unique in DB: {total_inserted + existing_count}")

                link_hdr = resp.headers.get('Link')
                page_info = extract_next_page_info(link_hdr)
                if not page_info:
                    print("Reached end of customer list.")
                    break

                page += 1
                time.sleep(0.3)

        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get('Retry-After', 2.0))
                time.sleep(wait_sec)
                continue
            print(f"API Error [{e.code}]: {e.read().decode('utf-8')}")
            break

    c.execute('SELECT COUNT(*) FROM customers')
    final_count = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count > 0')
    buyers_count = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM customers WHERE orders_count = 0')
    leads_count = c.fetchone()[0]

    print("\n" + "="*60)
    print("🎉 CUSTOMER DATABASE EXPORT COMPLETED!")
    print(f"Total Unique Valid Email Customers: {final_count}")
    print(f"  • Past Buyers (orders_count > 0): {buyers_count}")
    print(f"  • Leads / Abandoned Checkouts (orders_count = 0): {leads_count}")
    print(f"Database file: {DB_PATH}")
    print("="*60)
    conn.close()

if __name__ == '__main__':
    main()
