/**
 * Meta Ads MCP Client
 * Implements the Model Context Protocol (MCP) JSON-RPC 2.0 client
 * for https://mcp.facebook.com/ads with resilient native fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { AuditLogger } from '../logger/audit_logger.js';
import { AssetUploader } from '../media/asset_uploader.js';
import { PayloadBuilder } from '../deployer/payload_builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new AuditLogger('MetaAdsMCPClient');

export class MetaAdsMCPClient {
  constructor(config = {}) {
    this.serverUrl = 'https://mcp.facebook.com/ads';
    this.config = config;
    this.accessToken = config.accessToken || '';
    this.adAccountId = String(config.adAccountId || '').replace(/^act_/, '');
    this.pageId = String(config.pageId || '');
    this.pixelId = String(config.pixelId || '');

    this.uploader = new AssetUploader(config);
    this.payloadBuilder = new PayloadBuilder(config);
    this.toolSchemas = this._loadToolSchemas();
    this.remoteConnected = false;
  }

  _loadToolSchemas() {
    try {
      const p = path.resolve(__dirname, 'tool_schemas.json');
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return { tools: [] };
    }
  }

  /**
   * Send JSON-RPC 2.0 request to https://mcp.facebook.com/ads
   */
  async _rpc(method, params = {}) {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        this.serverUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': 'SafePet-MCP-Client/1.0'
          }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (res.statusCode >= 200 && res.statusCode < 300 && !json.error) {
                resolve(json.result);
              } else {
                const err = new Error(json.error?.message || json.detail || body);
                err.statusCode = res.statusCode;
                err.rpcResponse = json;
                reject(err);
              }
            } catch {
              reject(new Error(`Non-JSON RPC Response (HTTP ${res.statusCode}): ${body}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Introspect available tools on official Meta Ads MCP server
   */
  async listTools() {
    logger.info(`Connecting to Meta Ads MCP Server: ${this.serverUrl}...`);
    try {
      // 1. Initialize
      await this._rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'SafePetStrapAdDeployer', version: '1.0.0' }
      });

      // 2. Query tools/list
      const res = await this._rpc('tools/list', {});
      this.remoteConnected = true;
      logger.success(`✓ Connected to remote Meta Ads MCP! Discovered ${res?.tools?.length || 0} remote tools.`);
      return res.tools || [];
    } catch (err) {
      logger.warn(`Remote Meta Ads MCP endpoint returned HTTP ${err.statusCode || 'N/A'}: ${err.message}`);
      logger.info('Using local verified MCP tool schema suite (6 core tools active).');
      return this.toolSchemas.tools;
    }
  }

  /**
   * Unified Tool Execution: routes to remote MCP or native engine adapter
   */
  async callTool(toolName, args = {}) {
    logger.info(`[MCP Tool Call] -> "${toolName}"...`, { args });

    // Validate parameters
    const schema = this.toolSchemas.tools.find((t) => t.name === toolName);
    if (!schema) {
      throw new Error(`Unknown Meta Ads MCP tool: "${toolName}"`);
    }

    if (this.remoteConnected) {
      try {
        const res = await this._rpc('tools/call', { name: toolName, arguments: args });
        return res;
      } catch (err) {
        logger.warn(`Remote MCP call to "${toolName}" failed. Falling back to native adapter: ${err.message}`);
      }
    }

    // High-performance Native Adapter
    switch (toolName) {
      case 'upload_ad_image': {
        const res = await this.uploader.uploadImage(args.file_path);
        return { image_hash: res.hash, url: res.url };
      }

      case 'upload_ad_video': {
        const res = await this.uploader.uploadVideo(args.file_path);
        return { video_id: res.videoId, status: 'ready' };
      }

      case 'create_campaign': {
        // Enforce PAUSED constraint
        const res = await this.payloadBuilder.createCampaign({
          name: args.name,
          dailyBudgetCents: args.daily_budget || 1500,
          objective: args.objective || 'OUTCOME_SALES'
        });
        return { id: res.id, name: res.name, status: 'PAUSED' };
      }

      case 'create_ad_set': {
        // Enforce PAUSED constraint
        const res = await this.payloadBuilder.createAdSet({
          campaignId: args.campaign_id,
          name: args.name,
          targeting: args.targeting || null,
          genders: args.genders || null,
          interests: args.interests || null,
          ageMin: args.age_min || 21,
          ageMax: args.age_max || 65,
          countries: args.countries || ['US'],
          advantageAudience: args.advantage_audience ?? null
        });
        return { id: res.id, name: res.name, status: 'PAUSED' };
      }

      case 'create_ad_creative': {
        const res = await this.payloadBuilder.createCreative({
          name: args.name,
          imageHash: args.image_hash,
          videoId: args.video_id,
          primaryText: args.primary_text,
          headline: args.headline,
          description: args.description,
          linkUrl: args.link_url,
          callToAction: args.call_to_action || 'GET_OFFER',
          urlTags: args.url_tags || ''
        });
        return { id: res.id, name: res.name };
      }

      case 'create_ad': {
        // Enforce PAUSED constraint
        const res = await this.payloadBuilder.createAd({
          adsetId: args.adset_id,
          creativeId: args.creative_id,
          name: args.name
        });
        return { id: res.id, name: res.name, status: 'PAUSED' };
      }

      default:
        throw new Error(`Tool "${toolName}" is not yet implemented in adapter.`);
    }
  }
}
