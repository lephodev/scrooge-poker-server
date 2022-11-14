import mongoose from 'mongoose';
const Schema = mongoose.Schema;


const roomHistorySchema = new Schema({
    roomId: { type: Schema.Types.ObjectId, required: [true, 'roomId are required'] },
    data: { type: Object },
})

const roomHistoryModel = mongoose.model('roomHistory', roomHistorySchema)

export default roomHistoryModel