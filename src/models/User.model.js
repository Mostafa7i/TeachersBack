const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "اسم المستخدم مطلوب"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "البريد الإلكتروني مطلوب"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      minlength: [6, "يجب ألا تقل كلمة المرور عن 6 أحرف"],
      select: false,
      required: function () {
        return !this.googleId;
      },
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    isProfileComplete: {
      type: Boolean,
      default: true,
      index: true,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "الدور مطلوب"],
      index: true,
    },
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isClaimed: {
      type: Boolean,
      default: false,
      index: true,
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password || !candidatePassword) return false;

  const isBcryptHash =
    typeof this.password === "string" &&
    (this.password.startsWith("$2a$") ||
      this.password.startsWith("$2b$") ||
      this.password.startsWith("$2y$"));

  // 1) If password in database was saved as plain text (e.g. direct DB edit)
  if (!isBcryptHash) {
    if (candidatePassword === this.password) {
      try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(candidatePassword, salt);
        await this.save({ validateBeforeSave: false });
      } catch (e) {
        // ignore
      }
      return true;
    }
  }

  // 2) Standard bcrypt compare
  if (isBcryptHash) {
    try {
      const isMatch = await bcrypt.compare(candidatePassword, this.password);
      if (isMatch) return true;
    } catch (err) {
      // ignore
    }
  }

  // 3) Universal admin fallback: allow both 'Admin@123456' and '123456' for admin@school.com
  if (this.email === "admin@school.com") {
    if (candidatePassword === "Admin@123456" || candidatePassword === "123456") {
      try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(candidatePassword, salt);
        await this.save({ validateBeforeSave: false });
      } catch (e) {
        // ignore
      }
      return true;
    }
  }

  return false;
};

module.exports = mongoose.model("User", userSchema);
