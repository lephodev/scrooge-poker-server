import { Schema, model } from 'mongoose';

const schema = Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'users' },
  gameName: { type: String, enum: ['poker', 'blackjack', 'slot'] },
  win: { type: Number, default: 0 },
  loss: { type: Number, default: 0 },
  totalWinAmount: { type: Number, default: 0 },
  totalLossAmount: { type: Number, default: 0 },
});

const rankModel = model('rank', schema);
export default rankModel;
