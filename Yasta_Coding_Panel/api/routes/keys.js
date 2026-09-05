/**
 * Yasta_Coding Panel - Keys Management Routes
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectToDatabase } = require('../_db');
const Key = require('../../models/Key');
const User = require('../../models/User');
const { authenticateToken, createAuditLog } = require('../_middleware');

/**
 * Helper to generate random license key string
 * Format: PREFIX-XXXX-XXXX-XXXX
 */
function generateKeyString(prefix = 'YASTA-') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = (len = 4) => {
    let res = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
      res += chars[bytes[i] % chars.length];
    }
    return res;
  };
  let cleanPrefix = (prefix || 'YASTA-').trim();
  if (!cleanPrefix.endsWith('-')) {
    cleanPrefix += '-';
  }
  return `${cleanPrefix}${segment(4)}-${segment(4)}-${segment(4)}`;
}

/**
 * Format key document to harmonize with both frontend UI and API contracts
 */
function formatKeyOutput(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  const duration = obj.durationDays || 30;
  obj.duration = duration;
  obj.durationDays = duration;
  obj.links = {
    modUrl: obj.modUrl || '',
    origUrl: obj.origUrl || '',
    originalFoldersZipUrl: obj.originalFoldersZipUrl || '',
    customFoldersZipUrl: obj.customFoldersZipUrl || ''
  };
  return obj;
}

/**
 * Helper to find a key by ID or by key string
 */
async function findKeyByIdOrKey(identifier) {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (mongoose.isValidObjectId(trimmed)) {
    const doc = await Key.findById(trimmed);
    if (doc) return doc;
  }
  return Key.findOne({ key: trimmed });
}

/**
 * GET /api/keys
 * Paginated key listing with filters, role-scoped.
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};

    // Role scoping: resellers can only see keys they created
    if (req.user.role !== 'admin') {
      query.generatedBy = req.user.username;
    } else if (req.query.reseller) {
      query.generatedBy = req.query.reseller;
    }

    // Filter by status
    if (req.query.status && ['active', 'paused', 'banned', 'expired'].includes(req.query.status)) {
      query.status = req.query.status;
    }

    // Search filter (key, note, or hwid)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { key: searchRegex },
        { note: searchRegex },
        { hwid: searchRegex }
      ];
    }

    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };

    const [rawKeys, total] = await Promise.all([
      Key.find(query).sort(sort).skip(skip).limit(limit),
      Key.countDocuments(query)
    ]);

    const keys = rawKeys.map(formatKeyOutput);

    return res.json({
      success: true,
      keys,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error('[Yasta_Coding Keys Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to retrieve keys.'
    });
  }
});

/**
 * Handler for generating keys (shared by POST / and POST /generate)
 */
async function handleGenerateKeys(req, res) {
  try {
    await connectToDatabase();
    const {
      count = 1,
      prefix = 'YASTA-',
      duration,
      durationDays,
      maxDevices = 1,
      note = '',
      links = {},
      modUrl = '',
      origUrl = '',
      originalFoldersZipUrl = '',
      customFoldersZipUrl = ''
    } = req.body;

    const keyCount = Math.min(100, Math.max(1, parseInt(count) || 1));
    const rawDuration = parseInt(durationDays !== undefined ? durationDays : duration);
    // Handle -1 as lifetime (36500 days = 100 years), otherwise clamp to min 1 day or default 30
    const validDuration = rawDuration === -1 ? 36500 : Math.max(1, rawDuration || 30);
    const validMaxDevices = Math.max(1, parseInt(maxDevices) || 1);

    // Reseller credit check and deduction
    if (req.user.role !== 'admin') {
      const resellerUser = await User.findById(req.user.userId);
      if (!resellerUser || resellerUser.credits < keyCount) {
        return res.status(400).json({
          success: false,
          error: 'InsufficientCredits',
          message: `Insufficient credits. Required: ${keyCount}, Available: ${resellerUser ? resellerUser.credits : 0}`
        });
      }

      // Atomically decrement reseller credits
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { credits: -keyCount }
      });
    }

    const keysToInsert = [];
    for (let i = 0; i < keyCount; i++) {
      let uniqueKey = generateKeyString(prefix);
      let exists = await Key.findOne({ key: uniqueKey });
      while (exists) {
        uniqueKey = generateKeyString(prefix);
        exists = await Key.findOne({ key: uniqueKey });
      }

      keysToInsert.push({
        key: uniqueKey,
        durationDays: validDuration,
        maxDevices: validMaxDevices,
        status: 'active',
        generatedBy: req.user.username,
        note: note || '',
        modUrl: links.modUrl || modUrl || '',
        origUrl: links.origUrl || origUrl || '',
        originalFoldersZipUrl: links.originalFoldersZipUrl || originalFoldersZipUrl || '',
        customFoldersZipUrl: links.customFoldersZipUrl || customFoldersZipUrl || '',
        hwid: [],
        createdAt: new Date()
      });
    }

    const insertedDocs = await Key.insertMany(keysToInsert);
    const formattedKeys = insertedDocs.map(formatKeyOutput);

    await createAuditLog({
      action: 'generate_keys',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      details: {
        count: keyCount,
        durationDays: validDuration,
        maxDevices: validMaxDevices,
        keys: insertedDocs.map(k => k.key)
      }
    });

    return res.status(201).json({
      success: true,
      count: formattedKeys.length,
      keys: formattedKeys,
      key: formattedKeys[0]
    });
  } catch (err) {
    console.error('[Yasta_Coding Key Generation Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to generate keys.'
    });
  }
}

// Support both /api/keys and /api/keys/generate
router.post('/', authenticateToken, handleGenerateKeys);
router.post('/generate', authenticateToken, handleGenerateKeys);

/**
 * POST /api/keys/reset-hwid
 * Body: { id } or { key }
 */
router.post('/reset-hwid', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const { id, key } = req.body;
    if (!id && !key) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Key ID or Key code is required.'
      });
    }

    const keyDoc = await findKeyByIdOrKey(id || key);
    if (!keyDoc) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'License key not found.'
      });
    }

    if (req.user.role !== 'admin' && keyDoc.generatedBy !== req.user.username) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to reset this key.'
      });
    }

    const previousHwid = keyDoc.hwid;
    keyDoc.hwid = [];
    await keyDoc.save();

    await createAuditLog({
      action: 'reset_hwid',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: keyDoc.key,
      details: { previousHwid }
    });

    return res.json({
      success: true,
      message: 'Hardware ID successfully reset.',
      key: formatKeyOutput(keyDoc)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to reset HWID.'
    });
  }
});

/**
 * POST & PUT /api/keys/:id/reset-hwid
 */
async function handleResetHwidParam(req, res) {
  try {
    await connectToDatabase();
    const keyDoc = await findKeyByIdOrKey(req.params.id);

    if (!keyDoc) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'License key not found.'
      });
    }

    if (req.user.role !== 'admin' && keyDoc.generatedBy !== req.user.username) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to reset this key.'
      });
    }

    const previousHwid = keyDoc.hwid;
    keyDoc.hwid = [];
    await keyDoc.save();

    await createAuditLog({
      action: 'reset_hwid',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: keyDoc.key,
      details: { previousHwid }
    });

    return res.json({
      success: true,
      message: 'Hardware ID successfully reset.',
      key: formatKeyOutput(keyDoc)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to reset HWID.'
    });
  }
}

router.post('/:id/reset-hwid', authenticateToken, handleResetHwidParam);
router.put('/:id/reset-hwid', authenticateToken, handleResetHwidParam);

/**
 * PUT & PATCH /api/keys/:id
 * Update status, note, maxDevices, durationDays, and link attachments
 */
async function handleUpdateKey(req, res) {
  try {
    await connectToDatabase();
    const keyDoc = await findKeyByIdOrKey(req.params.id);

    if (!keyDoc) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'License key not found.'
      });
    }

    if (req.user.role !== 'admin' && keyDoc.generatedBy !== req.user.username) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to modify this key.'
      });
    }

    const {
      status,
      note,
      links,
      modUrl,
      origUrl,
      originalFoldersZipUrl,
      customFoldersZipUrl,
      maxDevices,
      duration,
      durationDays
    } = req.body;

    if (status && ['active', 'paused', 'banned', 'expired'].includes(status)) {
      keyDoc.status = status;
    }
    if (note !== undefined) keyDoc.note = note;

    // Handle link attachments from either links object or top-level fields
    if (links && typeof links === 'object') {
      if (links.modUrl !== undefined) keyDoc.modUrl = links.modUrl;
      if (links.origUrl !== undefined) keyDoc.origUrl = links.origUrl;
      if (links.originalFoldersZipUrl !== undefined) keyDoc.originalFoldersZipUrl = links.originalFoldersZipUrl;
      if (links.customFoldersZipUrl !== undefined) keyDoc.customFoldersZipUrl = links.customFoldersZipUrl;
    }
    if (modUrl !== undefined) keyDoc.modUrl = modUrl;
    if (origUrl !== undefined) keyDoc.origUrl = origUrl;
    if (originalFoldersZipUrl !== undefined) keyDoc.originalFoldersZipUrl = originalFoldersZipUrl;
    if (customFoldersZipUrl !== undefined) keyDoc.customFoldersZipUrl = customFoldersZipUrl;

    if (maxDevices !== undefined && Number(maxDevices) >= 1) {
      keyDoc.maxDevices = Number(maxDevices);
    }

    const newDuration = durationDays !== undefined ? durationDays : duration;
    if (newDuration !== undefined) {
      const parsedDur = parseInt(newDuration);
      if (parsedDur === -1) {
        keyDoc.durationDays = 36500;
        if (keyDoc.expiresAt && keyDoc.createdAt) {
          keyDoc.expiresAt = new Date(keyDoc.createdAt.getTime() + 36500 * 86400000);
        }
      } else if (parsedDur >= 1) {
        keyDoc.durationDays = parsedDur;
        if (keyDoc.expiresAt && keyDoc.createdAt) {
          keyDoc.expiresAt = new Date(keyDoc.createdAt.getTime() + parsedDur * 86400000);
        }
      }
    }

    await keyDoc.save();

    await createAuditLog({
      action: 'update_key',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: keyDoc.key,
      details: { updatedFields: req.body }
    });

    return res.json({
      success: true,
      message: 'Key updated successfully.',
      key: formatKeyOutput(keyDoc)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update key.'
    });
  }
}

router.put('/:id', authenticateToken, handleUpdateKey);
router.patch('/:id', authenticateToken, handleUpdateKey);

/**
 * DELETE /api/keys/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const keyDoc = await findKeyByIdOrKey(req.params.id);

    if (!keyDoc) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'License key not found.'
      });
    }

    if (req.user.role !== 'admin' && keyDoc.generatedBy !== req.user.username) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this key.'
      });
    }

    await Key.findByIdAndDelete(keyDoc._id);

    await createAuditLog({
      action: 'delete_key',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: keyDoc.key
    });

    return res.json({
      success: true,
      message: 'License key deleted successfully.'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to delete key.'
    });
  }
});

/**
 * POST /api/keys/bulk-delete
 * Body: { ids: [ ... ] }
 */
router.post('/bulk-delete', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'An array of key IDs or keys is required.'
      });
    }

    // Support both MongoDB ObjectIds and key strings
    const validObjectIds = ids.filter(id => mongoose.isValidObjectId(id));
    const keyStrings = ids.filter(id => typeof id === 'string');

    const orConditions = [];
    if (validObjectIds.length > 0) orConditions.push({ _id: { $in: validObjectIds } });
    if (keyStrings.length > 0) orConditions.push({ key: { $in: keyStrings } });

    const query = { $or: orConditions };
    if (req.user.role !== 'admin') {
      query.generatedBy = req.user.username;
    }

    const result = await Key.deleteMany(query);

    await createAuditLog({
      action: 'bulk_delete_keys',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      details: { deletedCount: result.deletedCount, requestedCount: ids.length }
    });

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} keys.`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to delete keys in bulk.'
    });
  }
});

module.exports = router;
