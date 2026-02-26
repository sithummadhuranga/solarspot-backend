/**
 * Notification model — in-app notification documents.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → Notification
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  recipient:    Types.ObjectId;
  type:         string;
  title:        string;
  body:         string;
  targetModel?: string;
  targetId?:    Types.ObjectId;
  isRead:       boolean;
  createdAt:    Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    targetModel: {
      type: String,
      trim: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ targetModel: 1, targetId: 1 });

export const Notification = model<INotification>('Notification', notificationSchema);
