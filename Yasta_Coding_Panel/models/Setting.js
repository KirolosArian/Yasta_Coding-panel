/**
 * Yasta_Coding Panel - Setting Model
 * Collection: yasta_settings
 */
const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema(
  {
    appName: {
      type: String,
      default: 'Yasta_Coding Panel',
    },
    appVersion: {
      type: String,
      default: '1.0.0',
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    discordWebhookUrl: {
      type: String,
      default: '',
    },
    customNotice: {
      type: String,
      default: '',
    },
    jwtSecret: {
      type: String,
      default: '',
    },
    hmacSecret: {
      type: String,
      default: '',
    },
    defaultModUrl: {
      type: String,
      default: '',
    },
    defaultOrigUrl: {
      type: String,
      default: '',
    },
    defaultOriginalFoldersZipUrl: {
      type: String,
      default: '',
    },
    defaultCustomFoldersZipUrl: {
      type: String,
      default: '',
    },
  },
  {
    collection: 'yasta_settings',
    timestamps: true,
  }
);

// Static helper to get or initialize singleton settings
SettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      appName: 'Yasta_Coding Panel',
      appVersion: '1.0.0',
      maintenanceMode: false,
      discordWebhookUrl: '',
      customNotice: '',
      jwtSecret: process.env.JWT_SECRET || 'yasta_jwt_secret_default_2026',
      hmacSecret: process.env.HMAC_SECRET || 'yasta_hmac_secret_default_2026',
      defaultModUrl: '',
      defaultOrigUrl: '',
      defaultOriginalFoldersZipUrl: '',
      defaultCustomFoldersZipUrl: '',
    });
  }
  return settings;
};

module.exports = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);
