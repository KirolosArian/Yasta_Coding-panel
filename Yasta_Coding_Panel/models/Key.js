/**
 * Yasta_Coding Panel - Key Model
 * Collection: yasta_keys
 */
const mongoose = require('mongoose');

const KeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    durationDays: {
      type: Number,
      default: 30,
      min: 1,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    hwid: {
      type: [String],
      default: [],
    },
    maxDevices: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'banned', 'expired'],
      default: 'active',
      index: true,
    },
    generatedBy: {
      type: String,
      default: 'admin',
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastUsedIP: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      default: '',
    },
    // Link Attachments
    modUrl: {
      type: String,
      default: '',
    },
    origUrl: {
      type: String,
      default: '',
    },
    originalFoldersZipUrl: {
      type: String,
      default: '',
    },
    customFoldersZipUrl: {
      type: String,
      default: '',
    },
  },
  {
    collection: 'yasta_keys',
    timestamps: true,
  }
);

// Helper method to check if key is expired
KeySchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > new Date(this.expiresAt);
};

// Helper method to check if device is allowed or can be registered
KeySchema.methods.canAccessDevice = function (clientHwid) {
  if (!clientHwid) return { allowed: false, reason: 'missing_hwid' };
  
  const hwidList = Array.isArray(this.hwid) ? this.hwid : (this.hwid ? [this.hwid] : []);
  
  // If already registered
  if (hwidList.includes(clientHwid)) {
    return { allowed: true, newlyAdded: false };
  }

  // If there's capacity to add new device
  if (hwidList.length < this.maxDevices) {
    return { allowed: true, newlyAdded: true };
  }

  // Device limit reached and unknown HWID
  return { allowed: false, reason: 'hwid_mismatch' };
};

module.exports = mongoose.models.Key || mongoose.model('Key', KeySchema);
