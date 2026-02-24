/**
 * AuditLog model — tracks all state changes.
 * TTL: 90 days (7_776_000 seconds).
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → AuditLog
 *      MASTER_PROMPT.md → ACID — write audit log in same transaction as the action
 */

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

// TTL index — documents auto-expire after 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
