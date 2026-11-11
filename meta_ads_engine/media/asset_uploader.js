/**
 * Meta Ads Engine - Resumable Media Ingestion Pipeline
 * Pure native Node.js implementation of:
 * 1. Image multipart/form-data streaming to act_{id}/adimages
 * 2. 3-Phase Resumable Video Upload to act_{id}/advideos (Start -> Transfer -> Finish -> Poll Status)
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AuditLogger } from '../logger/audit_logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('AssetUploader');

export class AssetUploader {
  constructor(config = {}) {
    this.apiVersion = config.apiVersion || 'v21.0';
    this.adAccountId = String(config.adAccountId || '').replace(/^act_/, '');
    this.accessToken = config.accessToken || '';
    this.cacheFile = path.resolve(__dirname, '../config/media_cache.json');
    this.cache = this._loadCache();
  }

  _loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      }
    } catch {
      // ignore
    }
    return { images: {}, videos: {} };
  }

  _saveCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  /**
   * Compute MD5 checksum of a file
   */
  computeMD5(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
  }

  /**
   * Upload an image to act_{id}/adimages using pure native multipart/form-data
   */
  async uploadImage(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    const md5 = this.computeMD5(filePath);
    const fileName = path.basename(filePath);

    // Check local cache
    if (this.cache.images[md5]?.hash) {
      logger.info(`✓ Using cached Meta image hash for "${fileName}": ${this.cache.images[md5].hash}`);
      return {
        hash: this.cache.images[md5].hash,
        url: this.cache.images[md5].url,
        cached: true
      };
    }

    logger.info(`Uploading image "${fileName}" (MD5: ${md5}) to Meta act_${this.adAccountId}/adimages...`);

    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const fileData = fs.readFileSync(filePath);

    // Build multipart body
    const preHeader = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="filename"; filename="${fileName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    );

    const postFooter = Buffer.from(
      `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="access_token"\r\n\r\n` +
        `${this.accessToken}\r\n` +
        `--${boundary}--\r\n`
    );

    const fullPayload = Buffer.concat([preHeader, fileData, postFooter]);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/${this.apiVersion}/act_${this.adAccountId}/adimages`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullPayload.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const imgData = json.images ? Object.values(json.images)[0] : null;
              if (!imgData || !imgData.hash) {
                return reject(new Error(`Unexpected Meta adimages response: ${body}`));
              }

              logger.success(`Image uploaded successfully! Hash: ${imgData.hash}`);
              this.cache.images[md5] = {
                hash: imgData.hash,
                url: imgData.url,
                fileName,
                uploadedAt: new Date().toISOString()
              };
              this._saveCache();

              resolve({
                hash: imgData.hash,
                url: imgData.url,
                cached: false
              });
            } else {
              const err = new Error(`Image upload failed (HTTP ${res.statusCode}): ${json.error?.message || body}`);
              err.response = json;
              err.statusCode = res.statusCode;
              reject(err);
            }
          } catch (e) {
            reject(new Error(`Failed to parse adimages response: ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(fullPayload);
      req.end();
    });
  }

  /**
   * 3-Phase Resumable Video Upload: Start -> Transfer -> Finish -> Poll Ready
   */
  async uploadVideo(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file not found: ${filePath}`);
    }

    const md5 = this.computeMD5(filePath);
    const fileName = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    if (this.cache.videos[md5]?.videoId) {
      logger.info(`✓ Using cached Meta video ID for "${fileName}": ${this.cache.videos[md5].videoId}`);
      return {
        videoId: this.cache.videos[md5].videoId,
        cached: true
      };
    }

    logger.info(`Starting 3-Phase Resumable Video Upload for "${fileName}" (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    // Phase 1: Start
    logger.info('Phase 1/3: Declaring upload session (upload_phase=start)...');
    const startPayload = new URLSearchParams({
      upload_phase: 'start',
      file_size: String(fileSize),
      access_token: this.accessToken
    }).toString();

    const startRes = await this._postJson(`/${this.apiVersion}/act_${this.adAccountId}/advideos`, startPayload);
    const sessionId = startRes.upload_session_id;
    let startOffset = parseInt(startRes.start_offset || '0', 10);
    let endOffset = parseInt(startRes.end_offset || String(fileSize), 10);

    logger.success(`Upload session started! Session ID: ${sessionId}`);

    // Phase 2: Transfer Chunks
    logger.info('Phase 2/3: Streaming chunks (upload_phase=transfer)...');
    const fd = fs.openSync(filePath, 'r');

    try {
      while (startOffset < fileSize) {
        const chunkSize = endOffset - startOffset;
        const chunkBuffer = Buffer.alloc(chunkSize);
        fs.readSync(fd, chunkBuffer, 0, chunkSize, startOffset);

        logger.info(`  Streaming bytes ${startOffset}-${endOffset} of ${fileSize}...`);
        const transferRes = await this._uploadVideoChunk(sessionId, startOffset, chunkBuffer);

        startOffset = parseInt(transferRes.start_offset || String(fileSize), 10);
        endOffset = parseInt(transferRes.end_offset || String(fileSize), 10);
      }
    } finally {
      fs.closeSync(fd);
    }

    // Phase 3: Finish
    logger.info('Phase 3/3: Committing video file (upload_phase=finish)...');
    const finishPayload = new URLSearchParams({
      upload_phase: 'finish',
      upload_session_id: sessionId,
      title: fileName.replace(/\.[^/.]+$/, ''),
      access_token: this.accessToken
    }).toString();

    const finishRes = await this._postJson(`/${this.apiVersion}/act_${this.adAccountId}/advideos`, finishPayload);
    const videoId = finishRes.video_id || finishRes.id;

    if (!videoId) {
      throw new Error(`Video finish failed: ${JSON.stringify(finishRes)}`);
    }

    logger.success(`Video committed to Meta! Video ID: ${videoId}`);

    // Phase 4: Poll status until READY
    logger.info(`Polling Meta Graph API for video ${videoId} encoding status...`);
    await this._pollVideoReady(videoId);

    this.cache.videos[md5] = {
      videoId,
      fileName,
      uploadedAt: new Date().toISOString()
    };
    this._saveCache();

    return {
      videoId,
      cached: false
    };
  }

  _uploadVideoChunk(sessionId, startOffset, chunkBuffer) {
    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');

    const preHeader = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="upload_phase"\r\n\r\n` +
        `transfer\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="upload_session_id"\r\n\r\n` +
        `${sessionId}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="start_offset"\r\n\r\n` +
        `${startOffset}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="access_token"\r\n\r\n` +
        `${this.accessToken}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="video_file_chunk"; filename="chunk.bin"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    );

    const postFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullPayload = Buffer.concat([preHeader, chunkBuffer, postFooter]);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/${this.apiVersion}/act_${this.adAccountId}/advideos`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullPayload.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`Chunk upload failed: ${body}`);
              err.response = json;
              reject(err);
            }
          } catch {
            reject(new Error(`Invalid response: ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(fullPayload);
      req.end();
    });
  }

  async _pollVideoReady(videoId, maxAttempts = 30, intervalSec = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
      try {
        const res = await this._getJson(`/${this.apiVersion}/${videoId}?fields=status`);
        const status = res.status?.video_status;
        logger.info(`Video status check [${attempt}/${maxAttempts}]: ${status || 'processing'}`);
        if (status === 'ready') {
          logger.success(`✓ Video ${videoId} is READY for creative assembly!`);
          return true;
        } else if (status === 'error') {
          throw new Error(`Video encoding failed on Meta: ${JSON.stringify(res.status)}`);
        }
      } catch (e) {
        logger.warn(`Polling notice: ${e.message}`);
      }
    }
    logger.warn(`Video ${videoId} polling timed out. Proceeding cautiously.`);
    return true;
  }

  _postJson(apiPath, formUrlEncoded) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formUrlEncoded)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`POST ${apiPath} failed (HTTP ${res.statusCode}): ${json.error?.message || body}`);
              err.response = json;
              err.statusCode = res.statusCode;
              reject(err);
            }
          } catch {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(formUrlEncoded);
      req.end();
    });
  }

  _getJson(apiPath) {
    const url = apiPath.includes('?') ? `${apiPath}&access_token=${this.accessToken}` : `${apiPath}?access_token=${this.accessToken}`;
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: url,
        method: 'GET'
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`GET ${apiPath} failed (HTTP ${res.statusCode}): ${json.error?.message || body}`);
              err.response = json;
              err.statusCode = res.statusCode;
              reject(err);
            }
          } catch {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }
}
