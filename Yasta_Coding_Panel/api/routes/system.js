/**
 * Yasta_Coding Panel - System Settings & Telemetry Routes
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { connectToDatabase } = require('../_db');
const Setting = require('../../models/Setting');
const Key = require('../../models/Key');
const User = require('../../models/User');
const Log = require('../../models/Log');
const { authenticateToken, requireAdmin, createAuditLog } = require('../_middleware');

/**
 * GET /api/system/stats
 * Aggregated telemetry
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const isAdmin = req.user.role === 'admin';
    const keyFilter = isAdmin ? {} : { generatedBy: req.user.username };

    // Today's midnight timestamp for daily validation calculation
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalKeys,
      activeKeys,
      bannedKeys,
      expiredKeys,
      totalResellers,
      totalValidations,
      todayValidations,
      recentLogs
    ] = await Promise.all([
      Key.countDocuments(keyFilter),
      Key.countDocuments({ ...keyFilter, status: 'active' }),
      Key.countDocuments({ ...keyFilter, status: 'banned' }),
      Key.countDocuments({ ...keyFilter, status: 'expired' }),
      isAdmin ? User.countDocuments({ role: 'reseller' }) : 0,
      Log.countDocuments({ action: 'client_validation' }),
      Log.countDocuments({ action: 'client_validation', timestamp: { $gte: startOfToday } }),
      Log.find(isAdmin ? {} : { performedBy: req.user.username })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);

    const statsPayload = {
      totalKeys,
      activeKeys,
      bannedKeys,
      expiredKeys,
      totalResellers,
      totalValidations,
      todayValidations,
      totalLogs: recentLogs.length,
      userCredits: req.user.credits || 0,
      recentLogs
    };

    return res.json({
      success: true,
      ...statsPayload,
      stats: statsPayload
    });
  } catch (err) {
    console.error('[Yasta_Coding Stats Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to retrieve system statistics.'
    });
  }
});

/**
 * GET /api/system/settings
 * Fetch global system configuration
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const settings = await Setting.getSettings();

    const defaultLinks = {
      modUrl: settings.defaultModUrl || '',
      origUrl: settings.defaultOrigUrl || '',
      originalFoldersZipUrl: settings.defaultOriginalFoldersZipUrl || '',
      customFoldersZipUrl: settings.defaultCustomFoldersZipUrl || ''
    };

    const responseData = {
      appName: settings.appName,
      appVersion: settings.appVersion,
      minClientVersion: settings.appVersion,
      maintenanceMode: settings.maintenanceMode,
      customNotice: settings.customNotice,
      announcement: settings.customNotice,
      discordWebhookUrl: req.user.role === 'admin' ? settings.discordWebhookUrl : '',
      defaultModUrl: settings.defaultModUrl,
      defaultOrigUrl: settings.defaultOrigUrl,
      defaultOriginalFoldersZipUrl: settings.defaultOriginalFoldersZipUrl,
      defaultCustomFoldersZipUrl: settings.defaultCustomFoldersZipUrl,
      defaultLinks
    };

    if (req.user.role === 'admin') {
      responseData.jwtSecretConfigured = !!settings.jwtSecret;
      responseData.hmacSecretConfigured = !!settings.hmacSecret;
    }

    return res.json({
      success: true,
      ...responseData,
      settings: responseData
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to retrieve system settings.'
    });
  }
});

/**
 * POST /api/system/settings
 * Update global system configuration (Admin only)
 */
router.post('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const settings = await Setting.getSettings();

    const {
      appName,
      appVersion,
      minClientVersion,
      maintenanceMode,
      discordWebhookUrl,
      customNotice,
      announcement,
      jwtSecret,
      hmacSecret,
      defaultLinks = {},
      defaultModUrl,
      defaultOrigUrl,
      defaultOriginalFoldersZipUrl,
      defaultCustomFoldersZipUrl
    } = req.body;

    if (appName !== undefined) settings.appName = appName;
    const versionVal = appVersion !== undefined ? appVersion : minClientVersion;
    if (versionVal !== undefined) settings.appVersion = versionVal;
    if (maintenanceMode !== undefined) settings.maintenanceMode = Boolean(maintenanceMode);
    if (discordWebhookUrl !== undefined) settings.discordWebhookUrl = discordWebhookUrl;
    const noticeVal = customNotice !== undefined ? customNotice : announcement;
    if (noticeVal !== undefined) settings.customNotice = noticeVal;
    if (jwtSecret) settings.jwtSecret = jwtSecret;
    if (hmacSecret) settings.hmacSecret = hmacSecret;

    // Handle links from defaultLinks object or top-level fields
    const mod = defaultLinks.modUrl !== undefined ? defaultLinks.modUrl : defaultModUrl;
    if (mod !== undefined) settings.defaultModUrl = mod;

    const orig = defaultLinks.origUrl !== undefined ? defaultLinks.origUrl : defaultOrigUrl;
    if (orig !== undefined) settings.defaultOrigUrl = orig;

    const origZip = defaultLinks.originalFoldersZipUrl !== undefined ? defaultLinks.originalFoldersZipUrl : defaultOriginalFoldersZipUrl;
    if (origZip !== undefined) settings.defaultOriginalFoldersZipUrl = origZip;

    const customZip = defaultLinks.customFoldersZipUrl !== undefined ? defaultLinks.customFoldersZipUrl : defaultCustomFoldersZipUrl;
    if (customZip !== undefined) settings.defaultCustomFoldersZipUrl = customZip;

    await settings.save();

    await createAuditLog({
      action: 'update_settings',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.json({
      success: true,
      message: 'Settings updated successfully.',
      settings
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update system settings.'
    });
  }
});

/**
 * Helper to dispatch Discord webhook HTTP POST
 */
function sendDiscordWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(webhookUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const data = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'Yasta_Coding-Panel-Webhook/1.0'
        },
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            resolve({ success: false, statusCode: res.statusCode, body });
          }
        });
      });

      req.on('error', (e) => reject(e));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Webhook request timed out.'));
      });

      req.write(data);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * POST /api/system/test-webhook
 * Send a test ping to Discord (Admin only)
 */
router.post('/test-webhook', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const settings = await Setting.getSettings();
    const webhookUrl = req.body.webhookUrl || req.body.discordWebhookUrl || settings.discordWebhookUrl;

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'No valid Discord webhook URL configured.'
      });
    }

    const payload = {
      username: 'Yasta_Coding Security Bot',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/2092/2092663.png',
      embeds: [
        {
          title: '🛰️ Yasta_Coding Panel - Webhook Integration Test',
          description: 'Connection established successfully from Yasta_Coding Serverless Backend.',
          color: 0x00f3ff,
          fields: [
            { name: 'Status', value: '🟢 Operational', inline: true },
            { name: 'Sender', value: req.user.username, inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: false }
          ],
          footer: {
            text: 'Yasta_Coding Panel • Serverless Licensing System'
          }
        }
      ]
    };

    const webhookResult = await sendDiscordWebhook(webhookUrl, payload);

    await createAuditLog({
      action: 'test_webhook',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      details: { webhookResult }
    });

    return res.json({
      success: webhookResult.success,
      message: webhookResult.success ? 'Test webhook sent successfully!' : 'Webhook rejected by Discord.',
      statusCode: webhookResult.statusCode
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'WebhookError',
      message: err.message || 'Failed to dispatch Discord webhook.'
    });
  }
});

module.exports = router;
