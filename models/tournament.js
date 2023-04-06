import mongoose from "mongoose";
const Schema = mongoose.Schema;

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    tournamentFee: { type: String, required: true },
    levels: { type: Object, required: true },
    startDate: { type: String, required: true, default: new Date() },
    startTime: { type: String, required: true },
    active: { type: Boolean, default: false },
    isFinished: { type: Boolean, default: false },
    havePlayers: { type: Number, default: 0 },
    rooms: [{ type: Schema.Types.ObjectId, ref: "rooms", default: [] }],
    destroyedRooms: [
      { type: Schema.Types.ObjectId, ref: "rooms", default: [] },
    ],
    tournamentDate: { type: Date, required: true, default: new Date() },
    incBlindTime: { type: Number, required: true },
    winTotalPlayer: { type: Number, required: true },
    winPlayer: { type: Object },
    buyIn: { type: Number, required: true },
    isStart: { type: Boolean, default: false },
    eleminatedPlayers: [],
    totalJoinPlayer: { type: Number, default: 0 },
    prizeType:{ type: String, required: true },
    tournamentType:{ type: String, required: true },
    prizeDistribution:{ type: String, required: true },
    prizePool: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const tournamentModel = mongoose.model("tournament", tournamentSchema);

export default tournamentModel;
