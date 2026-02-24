import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'station_approved'
  | 'station_rejected'
  | 'review_flagged'
  | 'review_moderated'
  | 'permission_changed'
  | 'quota_alert'
  | 'system_announcement';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId; // ref: User
  type: NotificationType;
  title: string;
  message: string;
  targetModel: string | null; // 'Station', 'Review', 'User', etc.
  targetId: mongoose.Types.ObjectId | null;
  isRead: boolean;
  readAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
      index: true,
    },

    type: {
      type: String,
      required: [true, 'Type is required'],
      enum: {
        values: [
          'station_approved',
          'station_rejected',
          'review_flagged',
          'review_moderated',
          'permission_changed',
          'quota_alert',
          'system_announcement',
        ],
        message: '{VALUE} is not a valid notification type',
      },
      index: true,
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },

    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message must be at most 1000 characters'],
    },

    targetModel: {
      type: String,
      default: null,
      trim: true,
      maxlength: [50, 'Target model must be at most 50 characters'],
    },

    targetId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    isRead: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for notification queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ targetModel: 1, targetId: 1 });

// Auto-set readAt when isRead becomes true  
notificationSchema.pre('save', function () {
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }
});

const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
