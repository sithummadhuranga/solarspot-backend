/**
 * AuditLog model — tracks all permission evaluation events.
 * TTL: 90 days (7_776_000 seconds).
 *
 * TODO: Member 4 — implement fields; do not remove TTL index.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → AuditLog
 *      MASTER_PROMPT.md → ACID — write audit log in same transaction as the action
 */

import { Schema, model, Document } from 'mongoose';
import type { IAuditLog } from '@/types';

const auditLogSchema = new Schema<IAuditLog & Document>(
  {
    // actor:      { type: Schema.Types.ObjectId, ref: 'User' },
    // action:     { type: String, required: true },          // e.g. 'stations.create'
    // resource:   { type: String },                          // e.g. 'stations'
    // resourceId: { type: Schema.Types.ObjectId },
    // result:     { type: String, enum: ['granted','denied'], required: true },
    // reason:     { type: String },
    // meta:       { type: Schema.Types.Mixed },              // extra context (IP, UA, etc.)
  },
  { timestamps: true },
);

// ── TTL index — documents auto-expire after 90 days ──────────────────────────
// auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });
// auditLogSchema.index({ actor: 1 });
// auditLogSchema.index({ action: 1 });
// auditLogSchema.index({ result: 1 });

export const AuditLog = model<IAuditLog & Document>('AuditLog', auditLogSchema);
