require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const { ensureSubjects } = require("./utils/initSubjects");

const PORT = process.env.PORT || 5000;

// Connect to Database and start server
const startServer = async () => {
  try {
    await connectDB();
    await ensureSubjects();
    const server = app.listen(PORT, () => {
      console.log(`=============================================`);
      console.log(`🚀 خادم نظام إدارة الجداول المدرسية يعمل الآن`);
      console.log(`📡 المنفذ (Port): ${PORT}`);
      console.log(`🌍 بيئة العمل: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 الرابط: http://localhost:${PORT}`);
      console.log(`=============================================`);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err) => {
      console.error("💥 UNHANDLED REJECTION! Shutting down gracefully...", err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("💥 UNCAUGHT EXCEPTION! Shutting down immediately...", err);
      process.exit(1);
    });
  } catch (err) {
    console.error("❌ فشل بدء تشغيل الخادم:", err);
    process.exit(1);
  }
};

startServer();
