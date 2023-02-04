import mongoose from "mongoose";
const Schema = mongoose.Schema;

const tournamentSchema = new Schema({
  name: { type: String, required: true },
  levels: { type: Object, required: true },
  startDate: { type: String, required: true },
  active: { type: Boolean, required: true, default: false },
  isFinished: { type: Boolean, default: false },
  havePlayers: { type: Number, default: 0 },
  rooms: [{ type: Schema.Types.ObjectId, ref: "rooms", default: [] }],
  destroyedRooms: [{ type: Schema.Types.ObjectId, ref: "rooms", default: [] }],
});

const tournamentModel = mongoose.model("tournament", tournamentSchema);

export default tournamentModel;
