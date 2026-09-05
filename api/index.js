/**
 * backend/api/index.js
 * Vercel Serverless Function entry point.
 * Wraps the Express app and ensures DB is connected before each request.
 */
require("dotenv").config();
const app = require("../src/app");
const connectDB = require("../src/config/db");
const { ensureSubjects } = require("../src/utils/initSubjects");

let initialized = false;

module.exports = async (req, res) => {
  // Connect to DB on first cold start (cached on warm invocations)
  if (!initialized) {
    await connectDB();
    await ensureSubjects();
    initialized = true;
  }

  // Hand off to Express
  return app(req, res);
};
