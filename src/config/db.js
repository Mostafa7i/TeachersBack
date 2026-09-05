const mongoose = require("mongoose");

/**
 * Cached Mongoose connection for Serverless environments (Vercel).
 * In serverless, each function invocation may be a cold start.
 * Caching in `global` prevents creating a new connection every time.
 */
let cached = global._mongooseCache;

if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
  // Already connected — reuse
  if (cached.conn) {
    return cached.conn;
  }

  // Connection in progress — wait for it
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Don't buffer — fail fast if not connected
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose
      .connect(
        process.env.MONGODB_URI || "mongodb://localhost:27017/school_schedule",
        opts
      )
      .then((conn) => {
        console.log(`✅ MongoDB متصل بنجاح: ${conn.connection.host}`);
        return conn;
      })
      .catch((err) => {
        cached.promise = null; // Reset so next call retries
        console.error(`❌ خطأ في الاتصال بـ MongoDB: ${err.message}`);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;

