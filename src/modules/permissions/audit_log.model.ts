

import { Schema, model } from 'mongoose';
import type { IAuditLog } from '@/types';

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
    },
    before: {
      type: Schema.Types.Mixed,
    },
    after: {
      type: Schema.Types.Mixed,
    },
    ip: {
      type: String,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
