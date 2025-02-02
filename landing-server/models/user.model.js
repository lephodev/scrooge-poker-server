import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcryptjs";
import toJSON from "./plugins/toJSON.plugin.js";
import paginate from "./plugins/paginate.plugin.js";
import { roles } from "../config/roles.js";

const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email");
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error(
            "Password must contain at least one letter and one number"
          );
        }
      },
      private: true, // used by the toJSON plugin
    },
    role: {
      type: String,
      enum: roles,
      default: "user",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    wallet: {
      type: Number,
      default: 0,
    },

    ipAddress: {
      type: String,
    },
    goldCoin: {
      type: Number,
      default: 0,
    },
    ticket: {
      type: Number,
      default: 0,
    },
    tournaments: { type: Array, default: [] },
    termsAccept: {
      type: Boolean,
      default: false,
    },
    profile: { type: String },
    dailyTokenSpendingLimit: {
      type: Number,
      default: 0,
    },
    weeklyTokenSpendingLimit: {
      type: Number,
      default: 0,
    },
    monthlyTokenSpendingLimit: {
      type: Number,
      default: 0,
    },
    dailyGoldCoinSpendingLimit: {
      type: Number,
      default: 0,
    },
    weeklyGoldCoinSpendingLimit: {
      type: Number,
      default: 0,
    },
    monthlyGoldCoinSpendingLimit: {
      type: Number,
      default: 0,
    },
    nonWithdrawableAmt: { type: Number, default: 0 },
    dailySpinBonus:  { type: Number, default: 0 },
    monthlyClaimBonus:  { type: Number, default: 0 },
    redeemableAmount:  { type: Number, default: 0 },
    lastBetFrom:   { type: Object, default: {} },
  },

  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

/**
 * @typedef User
 */
const User = mongoose.model("User", userSchema);

export default User;
