const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/school_schedule');
    console.log(`✅ MongoDB متصل بنجاح: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ خطأ في الاتصال بقاعدة البيانات MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
