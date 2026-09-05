/**
 * Yasta_Coding Panel - Log Model
 * Collection: yasta_logs
 */
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    performedBy: {
      type: String,
      default: 'system',
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    targetId: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: 'yasta_logs',
    timestamps: true,
  }
);

module.exports = mongoose.models.Log || mongoose.model('Log', LogSchema);
