import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const tournamentSchema = new Schema({
  name: { type: String, required: true },
  tournamentFee: { type: String, required: true },
  tournamentDate: { type: Date, default:()=>{
    return new Date()
  }},
  levels: { type: Object, required: true },
  startDate: { type: String, required: true},
  startTime: { type: String, required: true},
  active: { type: Boolean, default: false },
  isFinished: { type: Boolean, default: false },
  showButton: { type: Boolean, default: false },
  havePlayers: { type: Number, default: 0 },
  rooms: [{ type: Schema.Types.ObjectId, ref: 'rooms'}],
  destroyedRooms: [{ type: Schema.Types.ObjectId, ref: 'rooms' }],
  incBlindTime: { type: Number, required: true}
},{timestamps:true});
const tournamentModel = mongoose.model('tournament', tournamentSchema);

export default tournamentModel;
