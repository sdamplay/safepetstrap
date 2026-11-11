/**
 * Meta Ads Engine - Pre-Flight Schema & Media Validator
 * Uses ffprobe to audit aspect ratios, codecs, container, durations,
 * and validates copy character limits before any Meta API call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AuditLogger } from '../logger/audit_logger.js';

const logger = new AuditLogger('SchemaValidator');

export class SchemaValidator {
  constructor() {
    this.ffprobePath = this._findFfprobe();
  }

  _findFfprobe() {
    const candidates = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', 'ffprobe'];
    for (const c of candidates) {
      try {
        execFileSync(c, ['-version'], { stdio: 'ignore' });
        return c;
      } catch {
        // try next
      }
    }
    return 'ffprobe';
  }

  /**
   * Probe an image or video file using ffprobe
   */
  probeMedia(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stdout = execFileSync(
      this.ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { encoding: 'utf8' }
    );

    return JSON.parse(stdout);
  }

  /**
   * Validate an image asset against Meta Feed & Stories specs
   */
  validateImage(filePath) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {}
    };

    if (!fs.existsSync(filePath)) {
      results.valid = false;
      results.errors.push(`Image file not found: ${filePath}`);
      return results;
    }

    const stat = fs.statSync(filePath);
    results.metadata.fileSizeBytes = stat.size;
    results.metadata.fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);

    if (stat.size > 30 * 1024 * 1024) {
      results.valid = false;
      results.errors.push(`Image file size (${results.metadata.fileSizeMB} MB) exceeds Meta 30MB limit.`);
    }

    try {
      const probe = this.probeMedia(filePath);
      const vStream = probe.streams?.find((s) => s.codec_type === 'video');

      if (!vStream) {
        results.valid = false;
        results.errors.push('No video/image stream found in media file.');
        return results;
      }

      const width = vStream.width;
      const height = vStream.height;
      const ratio = width / height;

      results.metadata.width = width;
      results.metadata.height = height;
      results.metadata.aspectRatio = parseFloat(ratio.toFixed(3));

      // Rule: Reject raw widths < 600px
      if (width < 600) {
        results.valid = false;
        results.errors.push(`Image width (${width}px) is below Meta's minimum requirement of 600px.`);
      }

      // Enforce strict aspect ratios (1:1, 4:5, 9:16)
      const is1x1 = ratio >= 0.95 && ratio <= 1.05;
      const is4x5 = ratio >= 0.77 && ratio <= 0.83;
      const is9x16 = ratio >= 0.54 && ratio <= 0.60;

      if (is1x1) {
        results.metadata.placementSuitability = '1:1 Square (Feed, Marketplace)';
      } else if (is4x5) {
        results.metadata.placementSuitability = '4:5 Vertical (Instagram/FB Mobile Feed)';
      } else if (is9x16) {
        results.metadata.placementSuitability = '9:16 Vertical (Stories, Reels)';
      } else {
        results.warnings.push(
          `Image ratio (${ratio.toFixed(2)}) is non-standard. Meta recommends 1:1 (Square), 4:5 (Vertical Feed), or 9:16 (Stories/Reels). Visual cropping may occur.`
        );
        results.metadata.placementSuitability = `Custom (${width}x${height})`;
      }
    } catch (err) {
      results.valid = false;
      results.errors.push(`ffprobe analysis failed: ${err.message}`);
    }

    return results;
  }

  /**
   * Validate a video asset against Meta Video specs
   */
  validateVideo(filePath) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {}
    };

    if (!fs.existsSync(filePath)) {
      results.valid = false;
      results.errors.push(`Video file not found: ${filePath}`);
      return results;
    }

    const stat = fs.statSync(filePath);
    results.metadata.fileSizeBytes = stat.size;
    results.metadata.fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);

    if (stat.size > 4 * 1024 * 1024 * 1024) {
      results.valid = false;
      results.errors.push(`Video file size (${results.metadata.fileSizeMB} MB) exceeds Meta 4GB limit.`);
    }

    try {
      const probe = this.probeMedia(filePath);
      const vStream = probe.streams?.find((s) => s.codec_type === 'video');
      const aStream = probe.streams?.find((s) => s.codec_type === 'audio');
      const format = probe.format || {};

      if (!vStream) {
        results.valid = false;
        results.errors.push('No video stream found in file.');
        return results;
      }

      const codec = (vStream.codec_name || '').toLowerCase();
      const width = vStream.width;
      const height = vStream.height;
      const ratio = width / height;
      const duration = parseFloat(format.duration || vStream.duration || 0);

      results.metadata.codec = codec;
      results.metadata.width = width;
      results.metadata.height = height;
      results.metadata.aspectRatio = parseFloat(ratio.toFixed(3));
      results.metadata.durationSeconds = duration;
      results.metadata.hasAudio = Boolean(aStream);

      // Rule: Reject codecs outside H.264 / HEVC
      const allowedCodecs = ['h264', 'hevc', 'h265'];
      if (!allowedCodecs.includes(codec)) {
        results.valid = false;
        results.errors.push(`Video codec "${codec}" rejected. Meta requires H.264 or HEVC (H.265).`);
      }

      // Container check
      const ext = path.extname(filePath).toLowerCase();
      if (!['.mp4', '.mov'].includes(ext)) {
        results.warnings.push(`Container format "${ext}" non-ideal. MP4 (with AAC audio) is recommended for fastest processing.`);
      }

      // Duration limits
      if (duration < 1) {
        results.valid = false;
        results.errors.push('Video duration must be at least 1 second.');
      } else if (duration > 14460) {
        results.valid = false;
        results.errors.push(`Video duration (${duration}s) exceeds Meta Feed max of 241 minutes.`);
      }

      if (duration > 90) {
        results.warnings.push(`Video duration is ${duration.toFixed(1)}s. Meta Reels recommends ≤ 90s for placement eligibility.`);
      }

      if (!aStream) {
        results.warnings.push('Video has no audio stream. Over 80% of mobile users watch Reels/Stories with sound on.');
      }
    } catch (err) {
      results.valid = false;
      results.errors.push(`Video validation failed: ${err.message}`);
    }

    return results;
  }

  /**
   * Validate copy character limits and URL syntax
   */
  validateCopy({ primaryText = '', headline = '', description = '', destinationUrl = '' }) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        primaryTextLength: primaryText.length,
        headlineLength: headline.length,
        descriptionLength: description.length,
        destinationUrl
      }
    };

    // Primary Text: Recommended <= 125 (mobile see more cutoff), hard limit 50,000
    if (!primaryText || primaryText.trim().length === 0) {
      results.valid = false;
      results.errors.push('Primary text (message) cannot be empty.');
    } else if (primaryText.length > 50000) {
      results.valid = false;
      results.errors.push(`Primary text length (${primaryText.length}) exceeds Meta hard limit of 50,000 characters.`);
    } else if (primaryText.length > 125) {
      results.warnings.push(
        `Primary text is ${primaryText.length} characters (> 125 chars). Text will be truncated on mobile feed with "... See more". Put your hook and offer in the first 120 characters.`
      );
    }

    // Headline: Recommended <= 40 chars, hard limit 255
    if (!headline || headline.trim().length === 0) {
      results.valid = false;
      results.errors.push('Headline (name) cannot be empty.');
    } else if (headline.length > 255) {
      results.valid = false;
      results.errors.push(`Headline length (${headline.length}) exceeds Meta hard limit of 255 characters.`);
    } else if (headline.length > 40) {
      results.warnings.push(
        `Headline is ${headline.length} characters (> 40 chars). Mobile feeds will truncate headlines longer than ~40 characters.`
      );
    }

    // Description: Recommended <= 30 chars, hard limit 255
    if (description && description.length > 255) {
      results.valid = false;
      results.errors.push(`Description length (${description.length}) exceeds Meta limit of 255 characters.`);
    } else if (description && description.length > 30) {
      results.warnings.push(
        `Description is ${description.length} characters (> 30 chars). Descriptions are truncated on most mobile feeds.`
      );
    }

    // Destination URL: Valid HTTPS scheme
    try {
      const u = new URL(destinationUrl);
      if (u.protocol !== 'https:') {
        results.valid = false;
        results.errors.push(`Destination URL must use HTTPS protocol. Received: ${destinationUrl}`);
      }
    } catch {
      results.valid = false;
      results.errors.push(`Invalid destination URL syntax: ${destinationUrl}`);
    }

    return results;
  }

  /**
   * Complete ad package pre-flight check
   */
  validateAdPackage({ mediaPath, mediaType = 'image', copy = {} }) {
    logger.info(`Starting pre-flight audit for [${path.basename(mediaPath)}]...`);
    const mediaRes = mediaType === 'video' ? this.validateVideo(mediaPath) : this.validateImage(mediaPath);
    const copyRes = this.validateCopy(copy);

    const combined = {
      valid: mediaRes.valid && copyRes.valid,
      errors: [...mediaRes.errors, ...copyRes.errors],
      warnings: [...mediaRes.warnings, ...copyRes.warnings],
      mediaMetadata: mediaRes.metadata,
      copyMetadata: copyRes.metadata
    };

    if (combined.valid) {
      logger.validate(`Pre-flight passed for ${path.basename(mediaPath)}`, true);
      if (combined.warnings.length > 0) {
        combined.warnings.forEach((w) => logger.warn(`  Notice: ${w}`));
      }
    } else {
      logger.validate(`Pre-flight failed for ${path.basename(mediaPath)}`, false, combined.errors);
    }

    return combined;
  }
}
