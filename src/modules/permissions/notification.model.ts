/**
 * Notification model — in-app notification documents.
 *
 * TODO: Member 4 — implement fields, wire to EmailService for email notifications.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → Notification
 */

import { Schema, model, Document } from 'mongoose';

export interface INotification extends Document {
  recipient:  unknown;  // ObjectId → ref: 'User'
  type:       string;   // e.g. 'station_approved', 'permission_changed', 'quota_alert'
  title:      string;
  body:       string;
  isRead:     boolean;
  meta?:      Record<string, unknown>;
  createdAt:  Date;
}

const notificationSchema = new Schema<INotification>(
  {
    // recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // type:      { type: String, required: true },
    // title:     { type: String, required: true },
    // body:      { type: String, required: true },
    // isRead:    { type: Boolean, default: false },
    // meta:      { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// notificationSchema.index({ recipient: 1, isRead: 1 });
// notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);
