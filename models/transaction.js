//imports
import mongoose from 'mongoose';

const Schema = mongoose.Schema;

//creating mongo database schema
const transactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'users' },
  roomId: { type: Schema.Types.ObjectId, ref: 'room', default: null },
  amount: { type: Number },
  prevWallet: { type: Number },
  updatedWallet: { type: Number },
  transactionDetails: {},
  tournamentId: { type: String },
  transactionType: { type: String, enum: ['poker', 'blackjack', 'slot'] },
});

const transactionModel = mongoose.model('transactions', transactionSchema);

export default transactionModel;
