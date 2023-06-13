//imports
import mongoose from "mongoose";

const Schema = mongoose.Schema;

//creating mongo database schema
const transactionSchema = new Schema(
  {
    userId: { type: Object },
    roomId: { type: Schema.Types.ObjectId, ref: "room", default: null },
    amount: { type: Number },
    prevWallet: { type: Number },
    updatedWallet: { type: Number },
    transactionDetails: {},
    tournamentId: { type: String },
    transactionType: {
      type: String,
      enum: [
        "poker",
        "blackjack",
        "slot",
        "poker tournament",
        "referal",
        "updated by admin",
      ],
    },
    prevTicket: { type: Number },
    updatedTicket: { type: Number },
    prevGoldCoin: { type: Number, default: 0 },
    updatedGoldCoin: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const transactionModel = mongoose.model("transactions", transactionSchema);

export default transactionModel;
