#!/usr/bin/env python3
"""
Anti-AI Creative Engine for Meta Ads
=====================================
Transforms AI-generated or low-res images into high-converting, high-resolution DTC ad creatives
that bypass Meta's automated AI detection filters (C2PA, SynthID, IPTC, and CV heuristics).

Features:
1. Strips all AI metadata, provenance tags, and C2PA manifests.
2. Injects authentic Apple iPhone camera EXIF metadata (iPhone 13/14/15 Pro, iOS, aperture, ISO, shutter).
3. Injects subtle CMOS sensor noise to disrupt diffusion latent frequency patterns.
4. Upscales to 1080x1080 (Square 1:1) and 1080x1350 (Meta 4:5 Mobile Feed) with crisp Lanczos sharpening.
"""

import sys
import os
import glob
import random
import datetime
import argparse
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

def generate_iphone_exif():
    """Generates authentic Apple iPhone camera EXIF tags."""
    days_ago = random.randint(2, 60)
    now = datetime.datetime.now()
    dt = now - datetime.timedelta(days=days_ago, hours=random.randint(1, 14), minutes=random.randint(1, 59))
    timestamp_str = dt.strftime("%Y:%m:%d %H:%M:%S")

    im = Image.new('RGB', (1, 1))
    exif = im.getexif()

    # Main IFD (0th IFD)
    model = random.choice(['iPhone 13 Pro', 'iPhone 14', 'iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro'])
    exif[0x010F] = 'Apple'                # Make
    exif[0x0110] = model                  # Model
    exif[0x0131] = '17.5.1'               # Software (iOS version)
    exif[0x0132] = timestamp_str          # ModifyDate

    # Exif Sub-IFD (0x8769)
    sub_ifd = exif.get_ifd(0x8769)
    sub_ifd[0x9003] = timestamp_str       # DateTimeOriginal
    sub_ifd[0x9004] = timestamp_str       # DateTimeDigitized
    sub_ifd[0x829A] = (1, random.choice([60, 120, 125, 250, 400, 500])) # ExposureTime (e.g. 1/125s)
    sub_ifd[0x829D] = (random.choice([15, 16, 18, 28]), 10)              # FNumber (f/1.5, f/1.6, f/1.8, f/2.8)
    sub_ifd[0x8827] = random.choice([40, 50, 64, 100, 125, 200, 400])    # ISO
    sub_ifd[0x920A] = (random.choice([57, 68, 90]), 10)                  # FocalLength
    sub_ifd[0xA434] = f'{model} back camera lens'                        # LensModel

    return exif

def add_anti_ai_sensor_grain(img, noise_strength=0.012):
    """
    Applies organic CMOS sensor noise to break the spatial frequency patterns
    used by Meta's neural network classifiers to detect diffusion models.
    """
    arr = np.array(img, dtype=np.float32)
    # Generate Gaussian sensor noise matching digital camera sensor read noise
    noise = np.random.normal(0, noise_strength * 255.0, arr.shape)
    noisy_arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(noisy_arr)

def process_image(input_path, output_dir, target_w=1080, target_h=1080, create_4x5=True):
    filename = os.path.basename(input_path)
    base_name, _ = os.path.splitext(filename)
    
    # 1. Open and convert to RGB (strips initial color profile / unneeded metadata)
    raw_img = Image.open(input_path).convert('RGB')
    
    # 2. Upscale / Resize using high-fidelity Lanczos resampling
    upscaled = raw_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # 3. Apply professional micro-clarity & unsharp mask (enhances edges without haloing)
    sharpened = upscaled.filter(ImageFilter.UnsharpMask(radius=1.4, percent=120, threshold=2))
    
    # 4. Enhance contrast and vibrance for DTC scroll-stopping power
    contrast_tuned = ImageEnhance.Contrast(sharpened).enhance(1.07)
    vibrant_img = ImageEnhance.Color(contrast_tuned).enhance(1.04)
    
    # 5. Apply Anti-AI Sensor Grain
    clean_img = add_anti_ai_sensor_grain(vibrant_img, noise_strength=0.012)
    
    # 6. Generate authentic Apple iPhone EXIF
    iphone_exif = generate_iphone_exif()
    
    # 7. Save 1:1 Square Creative
    out_1x1_path = os.path.join(output_dir, f"{base_name}_1080x1080_anti_ai.jpg")
    clean_img.save(out_1x1_path, "JPEG", quality=92, exif=iphone_exif, subsampling=0)
    print(f"[OK] Saved 1:1 Square: {out_1x1_path}")
    
    # 8. Optionally generate 4:5 Mobile Feed Creative (1080x1350)
    if create_4x5:
        h_4x5 = 1350
        w_4x5 = 1080
        # Dark premium letterbox / frame for maximum mobile screen real estate
        canvas_4x5 = Image.new('RGB', (w_4x5, h_4x5), color=(12, 12, 14))
        y_offset = (h_4x5 - target_h) // 2
        canvas_4x5.paste(clean_img, (0, y_offset))
        
        exif_4x5 = generate_iphone_exif()
        out_4x5_path = os.path.join(output_dir, f"{base_name}_4x5_feed_anti_ai.jpg")
        canvas_4x5.save(out_4x5_path, "JPEG", quality=92, exif=exif_4x5, subsampling=0)
        print(f"[OK] Saved 4:5 Feed:   {out_4x5_path}")

def main():
    parser = argparse.ArgumentParser(description="Clean AI metadata and enhance ad creatives for Meta Ads.")
    parser.add_argument("input", help="Path to image file or directory of images")
    parser.add_argument("--out", "-o", default="output_creatives", help="Output directory")
    parser.add_argument("--no-4x5", action="store_true", help="Do not generate 4:5 mobile feed aspect ratio")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    
    if os.path.isdir(args.input):
        files = glob.glob(os.path.join(args.input, "*.*"))
        valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        targets = [f for f in files if os.path.splitext(f)[1].lower() in valid_exts]
    else:
        targets = [args.input]

    if not targets:
        print("No valid image files found.")
        sys.exit(1)

    print(f"Processing {len(targets)} images to {args.out}...")
    for t in targets:
        process_image(t, args.out, create_4x5=not args.no_4x5)
    print("Done! All images are sanitized, high quality, and ready for Meta Ads.")

if __name__ == "__main__":
    main()
