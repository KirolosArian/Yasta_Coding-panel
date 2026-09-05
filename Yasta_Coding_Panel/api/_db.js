/**
 * Yasta_Coding Panel - Database Connection Management
 * Serverless Connection Caching with Mongoose Global Reuse
 */
const mongoose = require('mongoose');

const DEFAULT_DB_NAME = 'Yasta_Coding_DB';

/**
 * Global is used here to maintain a cached connection across hot-reloads
 * in development and serverless invocations in Vercel.
 */
let cached = global._yasta_mongoose;

if (!cached) {
  cached = global._yasta_mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoUri = process.env.YASTA_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/Yasta_Coding_DB';
    
    const opts = {
      bufferCommands: false,
      dbName: DEFAULT_DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
      return m;
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = {
  connectToDatabase,
  DEFAULT_DB_NAME
};
