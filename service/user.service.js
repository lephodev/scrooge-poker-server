import mongoose, { mongo } from "mongoose";
import User from "../landing-server/models/user.model.js";

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

const getUserById = async (userId) => {
  const userData = await User.findOne({ _id: convertMongoId(userId) });
  return userData;
};

const updateUserWallet = async (userId, query) => {
  try {
    await User.updateOne(
      { _id: convertMongoId(userId) },
      query
    );
    return true;
  } catch (error) {
    throw new Error(false);
  }
};

const userService = {
  getUserById,
  updateUserWallet,
};

export default userService;
