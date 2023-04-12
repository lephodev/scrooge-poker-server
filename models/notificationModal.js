import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User',index:true  },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User',index:true  },
    message: { type: String },
    isRead: { type: Boolean, default: false },
    url: { type: String },
  },
  { timestamps: true }
);
const Notification = mongoose.model('Notification', NotificationSchema);

export default Notification;
