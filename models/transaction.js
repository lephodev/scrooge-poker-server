//imports
import mongoose from "mongoose";

const Schema = mongoose.Schema;

//creating mongo database schema
const transactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "users" },
  roomId: { type: Schema.Types.ObjectId, ref: "room", default: null },
  amount: { type: Number },
  prevWallet: { type: Number },
  prevToken: { type: Number },
  updatedWallet: { type: Number },
  updatedToken: { type: Number },
  transactionDetails: {},
  tournamentId: { type: String },
  transactionType: {
    type: String,
    enum: ["poker", "blackjack", "slot", "poker tournament"],
  },
  prevTicket: { type: Number },
  updatedTicket: { type: Number },
});

const transactionModel = mongoose.model("transactions", transactionSchema);

export default transactionModel;
