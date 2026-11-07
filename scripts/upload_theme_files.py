#!/usr/bin/env python3
import os
import sys
import json
import time
import urllib.request
import urllib.error

TOKEN = os.environ.get('SHOPIFY_TARGET_TOKEN', '')
DOMAIN = os.environ.get('SHOPIFY_TARGET_DOMAIN', 'ezuam5-nq.myshopify.com')

FILES_TO_UPLOAD = [
    {
        'filename': 'FullView1_1400x_807134e6-d633-43b8-b435-1d1e7c61984c.jpg',
        'filepath': '/Users/imacm1/Downloads/FullView1_1400x.jpg',
        'mimetype': 'image/jpeg',
        'alt': 'Dr Rachel Customer Review'
    },
    {
        'filename': 'Hot-Car-Adjustable-Dog-Seat-Belt-Upgraded-Auto-Seatbelt-Harness-Leads-Buffer-Elastic-Reflective-Safety-Rope.webp',
        'filepath': '/Users/imacm1/Downloads/Hot-Car-Adjustable-Dog-Seat-Belt-Upgraded-Auto-Seatbelt-Harness-Leads-Buffer-Elastic-Reflective-Safety-Rope.webp',
        'mimetype': 'image/webp',
        'alt': 'Chris K9 Customer Review'
    },
    {
        'filename': 'New_SafePet_copy.png',
        'filepath': '/Users/imacm1/Downloads/SafePet_1260x@2x copy 2.png',
        'mimetype': 'image/png',
        'alt': 'SafePet Favicon'
    },
    {
        'filename': 'SafePet_1260x_2x_copy_2.png',
        'filepath': '/Users/imacm1/Downloads/SafePet_1260x@2x copy 2.png',
        'mimetype': 'image/png',
        'alt': 'SafePet Logo'
    },
    {
        'filename': 'Screenshot_2026-08-03_at_8.26.32_PM.png',
        'filepath': '/Users/imacm1/Downloads/Screenshot 2026-08-23 at 12.01.11 PM.png',
        'mimetype': 'image/png',
        'alt': 'Sarah W Customer Review'
    },
    {
        'filename': 'Woman_and_dog_in_car_202608041118_1.jpg',
        'filepath': '/Users/imacm1/Downloads/Woman_and_dog_in_car_202608041118 (1).jpeg',
        'mimetype': 'image/jpeg',
        'alt': 'Dog in Car Happy Review'
    },
    {
        'filename': 'amanda-cooper-review.jpg',
        'filepath': '/Users/imacm1/Downloads/amanda-cooper-review.jpeg',
        'mimetype': 'image/jpeg',
        'alt': 'Amanda Cooper Car Accident Proof Review'
    },
    {
        'filename': 'clipboard-image-1785799440.png',
        'filepath': '/Users/imacm1/Downloads/clipboard-image-1785799440.png',
        'mimetype': 'image/png',
        'alt': 'Product Feature Diagram'
    },
    {
        'filename': 'clipboard-image-1787483153.png',
        'filepath': '/Users/imacm1/Downloads/clipboard-image-1787483153.png',
        'mimetype': 'image/png',
        'alt': 'Amanda B Avatar'
    },
    {
        'filename': 'clipboard-image-3-pcs__1_.jpg_202608081843_1.jpg',
        'filepath': '/Users/imacm1/Downloads/clipboard-image-3-pcs_(1).jpg_202608081843 (1).jpeg',
        'mimetype': 'image/jpeg',
        'alt': 'SafePet Strap 3-Pack Bundle Offer'
    },
    {
        'filename': 'giphy_2.webp',
        'filepath': '/Users/imacm1/Downloads/giphy_2.webp',
        'mimetype': 'image/webp',
        'alt': 'SafePet Crash Buffer Demonstration'
    },
    {
        'filename': 'harness-size-chart_db83cd8e-d7f3-4b61-99b7-52096babc334.jpg',
        'filepath': '/Users/imacm1/SafePet/assets/harness-size-chart.jpg',
        'mimetype': 'image/jpeg',
        'alt': 'SafePet Harness Size Chart'
    },
    {
        'filename': 'image.png_202608041117_1.jpg',
        'filepath': '/Users/imacm1/Downloads/image.png_202608041117 (1).jpeg',
        'mimetype': 'image/jpeg',
        'alt': 'Emily R Customer Review'
    },
    {
        'filename': 'pf-78ed0e0c_1.webp',
        'filepath': '/Users/imacm1/Downloads/pf-78ed0e0c.webp',
        'mimetype': 'image/webp',
        'alt': 'Military Grade Webbing Detail'
    },
    {
        'filename': 'tamsin-min_1.jpg',
        'filepath': '/Users/imacm1/Downloads/tamsin-min (1).jpg',
        'mimetype': 'image/jpeg',
        'alt': 'Tamsin Verified Buyer Avatar'
    }
]

def upload_single_file(item):
    filename = item['filename']
    filepath = item['filepath']
    mimetype = item['mimetype']
    alt = item['alt']
    
    print(f"Uploading {filename} (from {filepath})...")
    
    # 1. stagedUploadsCreate
    query = '''
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
    '''
    variables = {
        'input': [{
            'filename': filename,
            'mimeType': mimetype,
            'httpMethod': 'POST',
            'resource': 'IMAGE'
        }]
    }
    
    req = urllib.request.Request(
        f'https://{DOMAIN}/admin/api/2024-01/graphql.json',
        data=json.dumps({'query': query, 'variables': variables}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        targets = res.get('data', {}).get('stagedUploadsCreate', {}).get('stagedTargets', [])
        if not targets:
            print(f"❌ Failed stagedUploadsCreate for {filename}: {res}")
            return False
        target = targets[0]

    url = target['url']
    resource_url = target['resourceUrl']
    params = target['parameters']

    # 2. Upload file to GCS
    boundary = '----WebKitFormBoundary' + hex(int(time.time() * 1000))[2:]
    body = bytearray()
    for p in params:
        body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{p["name"]}"\r\n\r\n{p["value"]}\r\n'.encode('utf-8'))

    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mimetype}\r\n\r\n'.encode('utf-8'))
    with open(filepath, 'rb') as f:
        body.extend(f.read())
    body.extend(f'\r\n--{boundary}--\r\n'.encode('utf-8'))

    upload_req = urllib.request.Request(url, data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    try:
        with urllib.request.urlopen(upload_req) as resp:
            if resp.status not in (200, 201):
                print(f"❌ GCS upload failed for {filename}: Status {resp.status}")
                return False
    except Exception as e:
        print(f"❌ GCS upload error for {filename}: {e}")
        return False

    # 3. fileCreate mutation
    fc_query = '''
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
        }
        userErrors { field message }
      }
    }
    '''
    fc_vars = {'files': [{'originalSource': resource_url, 'contentType': 'IMAGE', 'alt': alt}]}
    fc_req = urllib.request.Request(
        f'https://{DOMAIN}/admin/api/2024-01/graphql.json',
        data=json.dumps({'query': fc_query, 'variables': fc_vars}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN}
    )
    with urllib.request.urlopen(fc_req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        created = res.get('data', {}).get('fileCreate', {}).get('files', [])
        errs = res.get('data', {}).get('fileCreate', {}).get('userErrors', [])
        if errs:
            print(f"❌ fileCreate errors for {filename}: {errs}")
            return False
        if created:
            print(f"✅ Created {filename}: ID {created[0]['id']} | Status: {created[0]['fileStatus']}")
            return True
    return False

def main():
    print(f"Starting upload of {len(FILES_TO_UPLOAD)} theme/product page images to {DOMAIN}...")
    success = 0
    for item in FILES_TO_UPLOAD:
        if upload_single_file(item):
            success += 1
        time.sleep(0.5)
    print(f"\nUpload complete: {success}/{len(FILES_TO_UPLOAD)} successfully uploaded!")

if __name__ == '__main__':
    main()
