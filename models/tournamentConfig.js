import mongoose from 'mongoose';
const Schema = mongoose.Schema;


const tournemanetConfSchema = new Schema({
    chips: { type: Number, required: [true, 'Chips are required'] },
    timer: { type: String, required: [true, 'Timer is required'] },
    emergencyTimer : { type: Number, required : true}
})

const tournamentConfModel = mongoose.model('tournamentConfig', tournemanetConfSchema)

export default tournamentConfModel