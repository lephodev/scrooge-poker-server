import mongoose, { mongo } from "mongoose";
import User from "../landing-server/models/user.model.js";

const getUserById = async (userId) => {
    const userData = await User.findOne({_id: mongoose.Types.ObjectId(userId)});
    return userData;
}

const userService = {
    getUserById
}

export default userService;