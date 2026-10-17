/**
 * backend/api/index.js
 * Vercel Serverless Function entry point.
 * Wraps the Express app and ensures DB is connected before each request.
 */
require("dotenv").config();
const app = require("../src/app");
const connectDB = require("../src/config/db");
const { ensureSystemInit } = require("../src/utils/initSystem");

// Trace hint for Vercel NFT (Node File Trace) to bundle pdfjs-dist assets
try {
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
} catch (_) {}

let initialized = false;

module.exports = async (req, res) => {
  // Connect to DB on first cold start (cached on warm invocations)
  if (!initialized) {
    await connectDB();
    await ensureSystemInit();
    initialized = true;
  }

  // Hand off to Express
  return app(req, res);
};
