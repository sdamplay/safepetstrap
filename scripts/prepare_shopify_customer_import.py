#!/usr/bin/env python3
"""
SafePet Strap - Shopify Customer Import & Deliverability Batcher
================================================================
Cleans, normalizes, and splits cold/dormant customer lists (ClickFunnels/Google Sheets)
into Shopify-compliant import CSVs with automated IP/domain warming batch tiers.

Features:
- Validates and normalizes email addresses (lowercased, trimmed, regex verified).
- Formats names into clean Title Case (e.g. 'JOHN' -> 'John').
- Injects mandatory Shopify marketing subscription columns ('yes' and 'subscribed').
- Automatically splits huge lists into progressive warming batches (e.g. 500 -> 1,000 -> 2,500 -> 5,000 -> 10,000)
  to protect domain reputation, prevent spam traps, and comply with Gmail/Yahoo deliverability rules.
- Tags each contact by cohort, segment type (purchaser vs abandoned), and batch ID.
"""

import csv
import re
import os
import sys
import argparse

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')
DISPOSABLE_OR_JUNK_DOMAINS = {
    'mailinator.com', 'tempmail.com', 'guerrillamail.com', 'throwawaymail.com',
    'example.com', 'test.com', 'fake.com', 'none.com', 'noemail.com'
}

DEFAULT_WARMING_SCHEDULE = [500, 1000, 2500, 5000, 10000]

def clean_name(raw_name):
    if not raw_name or not isinstance(raw_name, str):
        return ''
    clean = raw_name.strip()
    # Strip odd characters/emojis
    clean = re.sub(r'[^\w\s-]', '', clean)
    return clean.capitalize()

def is_valid_email(email):
    if not email or not isinstance(email, str):
        return False
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return False
    domain = email.split('@')[-1]
    if domain in DISPOSABLE_OR_JUNK_DOMAINS:
        return False
    if '..' in domain or domain.startswith('.') or domain.endswith('.'):
        return False
    return True

def process_customer_csv(input_csv_path, output_dir, segment_type='buyer', base_tag='sb-reengagement'):
    if not os.path.exists(input_csv_path):
        print(f"❌ Error: Input file '{input_csv_path}' not found.")
        return False

    os.makedirs(output_dir, exist_ok=True)

    valid_records = []
    seen_emails = set()
    skipped_count = 0

    print(f"🔍 Reading and analyzing: {input_csv_path}")

    with open(input_csv_path, mode='r', encoding='utf-8', errors='replace') as infile:
        reader = csv.DictReader(infile)
        # Normalize header keys to lowercase for flexible column mapping
        field_map = {k.strip().lower(): k for k in reader.fieldnames or []}

        email_key = field_map.get('email') or field_map.get('email address') or field_map.get('customer email')
        first_name_key = field_map.get('first name') or field_map.get('firstname') or field_map.get('first_name')
        last_name_key = field_map.get('last name') or field_map.get('lastname') or field_map.get('last_name')
        full_name_key = field_map.get('full name') or field_map.get('fullname') or field_map.get('name')

        if not email_key:
            print(f"❌ Could not locate an 'Email' column in headers: {reader.fieldnames}")
            return False

        for row in reader:
            raw_email = (row.get(email_key) or '').strip().lower()
            if not is_valid_email(raw_email):
                skipped_count += 1
                continue

            if raw_email in seen_emails:
                skipped_count += 1
                continue

            seen_emails.add(raw_email)

            first_name = clean_name(row.get(first_name_key, '')) if first_name_key else ''
            last_name = clean_name(row.get(last_name_key, '')) if last_name_key else ''

            if not first_name and full_name_key and row.get(full_name_key):
                parts = row.get(full_name_key, '').strip().split()
                if len(parts) >= 1:
                    first_name = clean_name(parts[0])
                if len(parts) >= 2:
                    last_name = clean_name(' '.join(parts[1:]))

            valid_records.append({
                'First Name': first_name,
                'Last Name': last_name,
                'Email': raw_email,
                'Accepts Email Marketing': 'yes',
                'Email Marketing Status': 'subscribed',
                'Tags': f"{base_tag}, {segment_type}"
            })

    total_valid = len(valid_records)
    print(f"✅ Filtered & Deduplicated: {total_valid:,} valid contacts ({skipped_count:,} duplicates/invalids skipped).")

    # Split into Warming Batches
    batch_idx = 1
    cursor = 0
    schedule_idx = 0

    shopify_headers = [
        'First Name',
        'Last Name',
        'Email',
        'Accepts Email Marketing',
        'Email Marketing Status',
        'Tags'
    ]

    while cursor < total_valid:
        if schedule_idx < len(DEFAULT_WARMING_SCHEDULE):
            batch_size = DEFAULT_WARMING_SCHEDULE[schedule_idx]
            schedule_idx += 1
        else:
            batch_size = DEFAULT_WARMING_SCHEDULE[-1]

        batch_records = valid_records[cursor:cursor + batch_size]
        cursor += batch_size

        batch_tag = f"batch-{batch_idx:02d}"
        output_filename = os.path.join(output_dir, f"shopify_customers_{segment_type}_{batch_tag}_{len(batch_records)}.csv")

        with open(output_filename, mode='w', encoding='utf-8', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=shopify_headers)
            writer.writeheader()
            for r in batch_records:
                record_copy = dict(r)
                record_copy['Tags'] = f"{r['Tags']}, {batch_tag}"
                writer.writerow(record_copy)

        print(f"📦 Generated Batch {batch_idx:02d}: {output_filename} ({len(batch_records):,} records)")
        batch_idx += 1

    print(f"🎉 Complete! All {total_valid:,} contacts formatted and ready for throttled Shopify import in '{output_dir}'.")
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Clean and batch customer CSVs for Shopify Email & deliverability protection.")
    parser.add_argument('--input', '-i', required=True, help="Path to input CSV file")
    parser.add_argument('--output-dir', '-o', default="./shopify_import_batches", help="Directory to save batched CSV files")
    parser.add_argument('--segment', '-s', default="buyer", choices=['buyer', 'abandoned', 'general'], help="Segment classification")
    parser.add_argument('--tag', '-t', default="sb-reengagement-2026", help="Base tag to apply to imported customers")

    args = parser.parse_args()
    process_customer_csv(args.input, args.output_dir, segment_type=args.segment, base_tag=args.tag)
