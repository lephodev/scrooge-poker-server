import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User',index:true  },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User',index:true  },
    message: { type: String, trim: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Message = mongoose.model('Message', MessageSchema);

export default Message;
