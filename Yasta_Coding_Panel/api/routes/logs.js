/**
 * Yasta_Coding Panel - Audit Logs Routes
 */
const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('../_db');
const Log = require('../../models/Log');
const { authenticateToken } = require('../_middleware');

/**
 * GET /api/logs
 * Retrieve audit logs (Admin sees all, Reseller sees their actions)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.user.role !== 'admin') {
      query.performedBy = req.user.username;
    } else if (req.query.user) {
      query.performedBy = req.query.user;
    }

    if (req.query.action) {
      query.action = req.query.action;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { action: searchRegex },
        { performedBy: searchRegex },
        { targetId: searchRegex },
        { ipAddress: searchRegex }
      ];
    }

    const [logs, total] = await Promise.all([
      Log.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Log.countDocuments(query)
    ]);

    return res.json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error('[Yasta_Coding Logs Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to retrieve logs.'
    });
  }
});

module.exports = router;
