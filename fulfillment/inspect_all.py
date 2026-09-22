import sys
sys.path.insert(0, '/tmp/ae_sdk/python')
import iop
import json

client = iop.IopClient('https://api-sg.aliexpress.com/sync', '548244', 'se4TblGMW5cjc69u0M0Im2RN3eWzgILO')
session = '50000700130dQA0RobBySjtAJASvuTBhcgtCLUhwpD17c3871bcCgwCPU2AgQcVzA5cG'

products = {
    'Seat Belt': '3256811984485167',
    'Harness': '3256806663780528',
    'Sticker': '2255800752212310',
    'Dog Tag': '3256808705434116',
    'GPS Tracker': '3256805685101130'
}

catalog = {}

for name, pid in products.items():
    req = iop.IopRequest('aliexpress.ds.product.get', 'POST')
    req.add_api_param('product_id', pid)
    req.add_api_param('ship_to_country', 'US')
    res = client.execute(req, session)
    print('======================================================================')
    print(f'PRODUCT: {name} (ID: {pid})')
    
    if 'aliexpress_ds_product_get_response' in res.body:
        resp = res.body['aliexpress_ds_product_get_response']
        result = resp.get('result', {})
        base_info = result.get('ae_item_base_info_dto', {})
        subject = base_info.get('subject')
        print(f'  Title: {subject}')
        
        skus = result.get('ae_item_sku_info_dtos', {}).get('ae_item_sku_info_d_t_o', [])
        print(f'  Found {len(skus)} SKUs:')
        
        catalog[name] = {
            'product_id': pid,
            'title': subject,
            'skus': []
        }
        
        for s in skus:
            props = s.get('ae_sku_property_dtos', {}).get('ae_sku_property_d_t_o', [])
            prop_desc = ', '.join([f"{p.get('sku_property_name')}: {p.get('sku_property_value')}" for p in props])
            sku_entry = {
                'sku_id': str(s.get('sku_id')),
                'sku_attr': str(s.get('sku_attr')),
                'price': str(s.get('offer_sale_price')),
                'attr': prop_desc
            }
            catalog[name]['skus'].append(sku_entry)
            print(f"    SKU ID: {s.get('sku_id')} | Attr: {s.get('sku_attr')} | Price: ${s.get('offer_sale_price')} | {prop_desc}")
    else:
        print('  Response:', json.dumps(res.body, indent=2))

with open('fulfillment/catalog.json', 'w') as f:
    json.dump(catalog, f, indent=2)

print('\nSaved full catalog to fulfillment/catalog.json')
