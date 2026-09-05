const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const path = require("path");
const { error } = require("./utils/apiResponse");

const app = express();

// 1) Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// 2) CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        process.env.NODE_ENV === "development"
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed for this origin"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

// 3) Body parser & cookies
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(
  cookieParser(
    process.env.COOKIE_SECRET || "school_cookie_secret_change_in_prod",
  ),
);

// 4) Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// 5) Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// 6) Static uploads folder
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// 7) Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "School Schedule Management API is healthy & running 🚀",
    timestamp: new Date().toISOString(),
  });
});

// 8) Mount Application Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/roles", require("./routes/roles.routes"));
app.use("/api/permissions", require("./routes/permissions.routes"));
app.use("/api/subjects", require("./routes/subjects.routes"));
app.use("/api/weeks", require("./routes/weeks.routes"));
app.use("/api/schedules", require("./routes/schedules.routes"));
app.use("/api/school-settings", require("./routes/schoolSettings.routes"));
app.use("/api/audit-logs", require("./routes/auditLogs.routes"));
app.use("/api/notifications", require("./routes/notifications.routes"));

// 9) 404 Route Handler
app.all("*", (req, res) => {
  return error(
    res,
    `المسار المطلوب غير موجود على الخادم: ${req.originalUrl}`,
    404,
  );
});

// 10) Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("💥 Server Error:", err);

  const statusCode = err.statusCode || 500;
  let message = err.message || "حدث خطأ داخلي في الخادم";

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return error(res, "خطأ في التحقق من البيانات المدخلة", 422, errors);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `القيمة المدخلة في الحقل (${field}) مستخدمة بالفعل ومسجلة مسبقاً.`;
    return error(res, message, 400);
  }

  if (err.name === "CastError") {
    message = `المعرف المطلوب غير صالح: ${err.value}`;
    return error(res, message, 400);
  }

  if (err.name === "JsonWebTokenError") {
    message = "جلسة غير صالحة، يرجى تسجيل الدخول مجدداً.";
    return error(res, message, 401);
  }

  if (err.name === "TokenExpiredError") {
    message = "انتهت صلاحية جلسة تسجيل الدخول، يرجى تسجيل الدخول مجدداً.";
    return error(res, message, 401);
  }

  return error(
    res,
    message,
    statusCode,
    process.env.NODE_ENV === "development" ? err.stack : undefined,
  );
});

module.exports = app;
