/**
 * Yasta_Coding Panel - Client Validation & License Activation Endpoint
 * High-performance, low-latency endpoint with HMAC token generation and link attachments.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { connectToDatabase } = require('../_db');
const Key = require('../../models/Key');
const Setting = require('../../models/Setting');
const Log = require('../../models/Log');
const { getClientIp } = require('../_middleware');

/**
 * POST /api/validate
 * High performance client authentication endpoint
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  try {
    await connectToDatabase();
    const clientIp = getClientIp(req);
    const { key, hwid, clientVersion } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'missing_key',
        message: 'License key is required.'
      });
    }

    if (!hwid || typeof hwid !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'missing_hwid',
        message: 'Hardware Identifier (HWID) is required.'
      });
    }

    const trimmedKey = key.trim();
    const cleanHwid = hwid.trim();

    if (!trimmedKey) {
      return res.status(400).json({
        success: false,
        error: 'missing_key',
        message: 'License key cannot be empty.'
      });
    }

    if (!cleanHwid) {
      return res.status(400).json({
        success: false,
        error: 'missing_hwid',
        message: 'Hardware Identifier (HWID) cannot be empty.'
      });
    }

    // 1. Fetch system settings (cached singleton)
    const setting = await Setting.getSettings();

    // 2. Check maintenance mode
    if (setting.maintenanceMode) {
      return res.status(503).json({
        success: false,
        error: 'maintenance_mode',
        message: setting.customNotice || 'The system is currently undergoing scheduled maintenance. Please try again later.'
      });
    }

    // 3. Find key in database
    const keyDoc = await Key.findOne({ key: trimmedKey });
    if (!keyDoc) {
      return res.status(404).json({
        success: false,
        error: 'invalid_key',
        message: 'The provided license key was not found or is invalid.'
      });
    }

    // 4. Check if key is banned or explicitly paused
    if (keyDoc.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'key_banned',
        message: 'This license key has been permanently suspended.'
      });
    }

    if (keyDoc.status === 'paused') {
      return res.status(403).json({
        success: false,
        error: 'key_paused',
        message: 'This license key has been temporarily paused.'
      });
    }

    // 5. Activation for virgin key (expiresAt is null)
    const now = Date.now();
    if (!keyDoc.expiresAt) {
      const durationMs = (keyDoc.durationDays || 30) * 86400000;
      keyDoc.expiresAt = new Date(now + durationMs);
      keyDoc.status = 'active';
    }

    // 6. Expiry check
    if (now > new Date(keyDoc.expiresAt).getTime()) {
      keyDoc.status = 'expired';
      await keyDoc.save();
      return res.status(403).json({
        success: false,
        error: 'key_expired',
        message: 'This license key has expired.'
      });
    }

    // 7. HWID & Device Limit Enforcement
    let currentHwidList = Array.isArray(keyDoc.hwid) ? [...keyDoc.hwid] : (keyDoc.hwid ? [keyDoc.hwid] : []);
    const maxDevices = Math.max(1, keyDoc.maxDevices || 1);

    if (currentHwidList.includes(cleanHwid)) {
      // Recognized device - allow
    } else if (currentHwidList.length < maxDevices) {
      // Add new device within limit
      currentHwidList.push(cleanHwid);
      keyDoc.hwid = currentHwidList;
    } else {
      // Device limit exceeded
      return res.status(403).json({
        success: false,
        error: 'hwid_mismatch',
        message: `Device limit exceeded (${currentHwidList.length}/${maxDevices}). Please reset your HWID in the portal.`
      });
    }

    // 8. Generate HMAC-SHA256 Token
    const hmacSecret = setting.hmacSecret || process.env.HMAC_SECRET || 'yasta_hmac_secret_default_2026';
    const expiresTimestamp = keyDoc.expiresAt.getTime();
    const tokenData = `${keyDoc.key}:${cleanHwid}:${expiresTimestamp}`;
    const token = crypto.createHmac('sha256', hmacSecret).update(tokenData).digest('hex');

    // 9. Calculate Remaining Days
    const remainingDays = Math.max(0, Math.ceil((expiresTimestamp - now) / 86400000));

    // 10. Resolve Link Attachments (falling back to system defaults)
    const links = {
      modUrl: keyDoc.modUrl || setting.defaultModUrl || '',
      origUrl: keyDoc.origUrl || setting.defaultOrigUrl || '',
      originalFoldersZipUrl: keyDoc.originalFoldersZipUrl || setting.defaultOriginalFoldersZipUrl || '',
      customFoldersZipUrl: keyDoc.customFoldersZipUrl || setting.defaultCustomFoldersZipUrl || ''
    };

    // 11. Update telemetry and audit logs
    keyDoc.lastUsedIP = clientIp;
    keyDoc.lastUsedAt = new Date();
    await keyDoc.save();

    // Async log creation to not block client response
    Log.create({
      action: 'client_validation',
      performedBy: keyDoc.key,
      ipAddress: clientIp,
      targetId: keyDoc.key,
      details: {
        hwid: cleanHwid,
        clientVersion: clientVersion || '1.0.0',
        remainingDays,
        durationMs: Date.now() - startTime
      },
      timestamp: new Date()
    }).catch(err => console.error('[Yasta_Coding Validation Log Error]:', err.message));

    // 12. Return client payload
    return res.json({
      success: true,
      status: 'active',
      token,
      expiresAt: keyDoc.expiresAt.toISOString(),
      remainingDays,
      links
    });
  } catch (err) {
    console.error('[Yasta_Coding Validation Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Client validation processing failed.'
    });
  }
});

module.exports = router;
