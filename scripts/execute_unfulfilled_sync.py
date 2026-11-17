#!/usr/bin/env python3
"""
Sync unfulfilled orders from r038b3-ux.myshopify.com to ezuam5-nq.myshopify.com
with exact variant linking, product pictures, zero customer notifications,
and unfulfilled paid status.
"""
import os, sys, json, ssl, time, urllib.request, urllib.parse, urllib.error

env_file = ".env.migration"
if os.path.exists(env_file):
    with open(env_file, "r") as f:
        for line in f:
            if line.strip() and not line.startswith("#") and "=" in line:
                k, v = line.strip().split("=", 1)
                os.environ[k.strip()] = v.strip()

SRC_DOMAIN = os.environ.get("SHOPIFY_SRC_DOMAIN", "r038b3-ux.myshopify.com")
SRC_CLIENT_ID = os.environ.get("SHOPIFY_SRC_CLIENT_ID")
SRC_CLIENT_SECRET = os.environ.get("SHOPIFY_SRC_CLIENT_SECRET")

TGT_DOMAIN = os.environ.get("SHOPIFY_TGT_DOMAIN", "ezuam5-nq.myshopify.com")
TGT_CLIENT_ID = os.environ.get("SHOPIFY_TGT_CLIENT_ID")
TGT_CLIENT_SECRET = os.environ.get("SHOPIFY_TGT_CLIENT_SECRET")
ctx = ssl._create_unverified_context()

def get_token(domain, cid, secret):
    req = urllib.request.Request(
        f"https://{domain}/admin/oauth/access_token",
        data=json.dumps({"client_id": cid, "client_secret": secret, "grant_type": "client_credentials"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, context=ctx) as r:
        return json.loads(r.read())["access_token"]

src_tok = get_token(SRC_DOMAIN, SRC_CLIENT_ID, SRC_CLIENT_SECRET)
tgt_tok = get_token(TGT_DOMAIN, TGT_CLIENT_ID, TGT_CLIENT_SECRET)

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

order_names = ["#SPS941262", "#SPS941263", "#SPS941264", "#SPS941265"]

def build_order_payload(src_order):
    order_name = src_order.get("name")
    line_items_payload = []
    
    for item in src_order.get("line_items", []):
        t = item.get("title")
        vt = item.get("variant_title")
        qty = item.get("quantity", 1)
        raw_price = item.get("price", "0.00")
        
        # Calculate effective price taking discount into account
        total_discount = float(item.get("total_discount") or 0.0)
        if total_discount > 0 and qty > 0:
            effective_price = max(0.0, float(raw_price) - (total_discount / qty))
            price = f"{effective_price:.2f}"
        else:
            price = raw_price
        
        li_entry = {
            "quantity": qty,
            "price": price,
            "requires_shipping": item.get("requires_shipping", True),
            "taxable": item.get("taxable", False)
        }
        
        key = (t, vt)
        if key in VARIANT_MAP:
            li_entry["variant_id"] = VARIANT_MAP[key]
        elif t == "Tip":
            li_entry["title"] = "Tip"
            li_entry["requires_shipping"] = False
        else:
            li_entry["title"] = t
            li_entry["variant_title"] = vt
            li_entry["sku"] = item.get("sku", "")
            
        if item.get("properties"):
            li_entry["properties"] = item["properties"]
            
        line_items_payload.append(li_entry)
        
    payload = {
        "order": {
            "name": order_name,
            "email": src_order.get("email"),
            "phone": src_order.get("phone"),
            "created_at": src_order.get("created_at"),
            "processed_at": src_order.get("processed_at"),
            "financial_status": src_order.get("financial_status", "paid"),
            "currency": src_order.get("currency", "USD"),
            "current_total_price": src_order.get("total_price"),
            "total_price": src_order.get("total_price"),
            "subtotal_price": src_order.get("subtotal_price"),
            "total_tax": src_order.get("total_tax"),
            "send_receipt": False,
            "send_fulfillment_receipt": False,
            "suppress_notifications": True,
            "inventory_behaviour": "bypass",
            "line_items": line_items_payload,
            "shipping_lines": [
                {
                    "title": sl.get("title", "Standard Shipping"),
                    "price": sl.get("price", "9.95"),
                    "code": sl.get("code")
                }
                for sl in src_order.get("shipping_lines", [])
            ]
        }
    }
    
    if src_order.get("tags") and str(src_order["tags"]).strip():
        payload["order"]["tags"] = str(src_order["tags"]).strip()
    if src_order.get("note"):
        payload["order"]["note"] = src_order["note"]
    if src_order.get("note_attributes"):
        payload["order"]["note_attributes"] = src_order["note_attributes"]

    if src_order.get("customer"):
        cust = src_order["customer"]
        ship = src_order.get("shipping_address") or {}
        payload["order"]["customer"] = {
            "first_name": cust.get("first_name") or ship.get("first_name", ""),
            "last_name": cust.get("last_name") or ship.get("last_name", ""),
            "email": cust.get("email") or src_order.get("email"),
            "phone": cust.get("phone") or ship.get("phone") or src_order.get("phone")
        }

    if src_order.get("financial_status") == "paid":
        payload["order"]["transactions"] = [
            {
                "kind": "sale",
                "status": "success",
                "amount": src_order.get("total_price"),
                "gateway": "shopify_payments"
            }
        ]

    if src_order.get("shipping_address"):
        payload["order"]["shipping_address"] = src_order["shipping_address"]
    if src_order.get("billing_address"):
        payload["order"]["billing_address"] = src_order["billing_address"]

    return payload

def post_order_to_target(payload):
    url = f"https://{TGT_DOMAIN}/admin/api/2024-01/orders.json"
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": tgt_tok
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8")).get("order")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = float(e.headers.get("Retry-After", 2.0))
                time.sleep(wait_sec)
                continue
            err_body = e.read().decode("utf-8")
            print(f"  ❌ Error creating {payload['order']['name']} [{e.code}]: {err_body}")
            raise
    return None

def fetch_existing_target_orders():
    url = f"https://{TGT_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250&fields=id,name,total_price,fulfillment_status,financial_status,customer,email"
    req = urllib.request.Request(url, headers={"X-Shopify-Access-Token": tgt_tok})
    with urllib.request.urlopen(req, context=ctx) as r:
        return {o.get("name"): o for o in json.loads(r.read()).get("orders", [])}

existing_target = fetch_existing_target_orders()
results = []
print(f"Checking sync status for 4 unfulfilled orders on {TGT_DOMAIN}...\n")

for name in order_names:
    if name in existing_target:
        o = existing_target[name]
        print(f"ℹ️ {name} already exists on target (ID: {o['id']}) | Total: ${o.get('total_price')} | {o.get('fulfillment_status') or 'unfulfilled'}")
        results.append({
            "name": name,
            "tgt_id": o["id"],
            "customer": f"{o.get('customer', {}).get('first_name')} {o.get('customer', {}).get('last_name')}",
            "email": o.get("email"),
            "total": o.get("total_price"),
            "fulfillment_status": o.get("fulfillment_status") or "unfulfilled",
            "financial_status": o.get("financial_status")
        })
        continue

    url = f"https://{SRC_DOMAIN}/admin/api/2024-01/orders.json?name={urllib.parse.quote(name)}&status=any"
    req = urllib.request.Request(url, headers={"X-Shopify-Access-Token": src_tok})
    with urllib.request.urlopen(req, context=ctx) as r:
        orders = json.loads(r.read()).get("orders", [])
        matched = [o for o in orders if o.get("name") == name]
        if not matched:
            print(f"⚠️ Could not find source order {name}!")
            continue
        src_order = matched[0]
        payload = build_order_payload(src_order)
        print(f"Syncing {name} ({src_order.get('email')}, ${src_order.get('total_price')})...")
        created_order = post_order_to_target(payload)
        if created_order:
            print(f"  ✅ Created on target: ID={created_order['id']} | Total=${created_order.get('total_price')} | Status={created_order.get('fulfillment_status') or 'unfulfilled'}")
            results.append({
                "name": name,
                "src_id": src_order.get("id"),
                "tgt_id": created_order.get("id"),
                "customer": f"{created_order.get('customer', {}).get('first_name')} {created_order.get('customer', {}).get('last_name')}",
                "email": created_order.get("email"),
                "total": created_order.get("total_price"),
                "fulfillment_status": created_order.get("fulfillment_status") or "unfulfilled",
                "financial_status": created_order.get("financial_status")
            })
        time.sleep(0.5)

print("\n=======================================================")
print(f"SYNC SUMMARY: {len(results)}/{len(order_names)} orders verified on target store!")
print("=======================================================")
for r in results:
    print(f"  • {r['name']}: Target ID {r['tgt_id']} | {r['customer']} | Total ${r['total']} | {r['fulfillment_status'].upper()} | {r['financial_status'].upper()}")

out_file = "compliance-docs/synced_unfulfilled_orders.json"
os.makedirs(os.path.dirname(out_file), exist_ok=True)
with open(out_file, "w") as f:
    json.dump(results, f, indent=2)
print(f"\nManifest saved to {out_file}")
