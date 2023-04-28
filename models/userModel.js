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
    profile: {
      type: String,
      default:
        "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg",
    },
    username: {
      type: String,
      trim: true,
      index:true 
      // required: true,
    },
    phone: {
      type: String,
      // required: true,
      trim: true,
    },
    followers: {
      type: [String],
    },
    followersCount: { type: Number, default: 0 },
    following: {
      type: [String],
    },
    followingCount: { type: Number, default: 0 },
    email: {
      type: String,
      // required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index:true ,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email");
        }
      },
    },
    wallet: {
      type: Number,
      default: 0,
    },
    goldCoin: {
      type: Number,
      default: 0,
    },
    termsAccept: {
      type: Boolean,
      default: false,
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "Friends" }],
    password: {
      type: String,
      // required: true,
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
      index:true 
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isRegistrationComplete: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      default: false,
    },
    isBlock: {
      type: Boolean,
      default: false,
    },
    ticket: {
      type: Number,
      default: 0,
    },
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
