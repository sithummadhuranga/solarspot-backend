/**
 * UserPermissionOverride model — per-user permission grants/revocations.
 *
 * TODO: Member 4 — implement fields.
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → User Permission Override
 */

import { Schema, model, Document } from 'mongoose';
import type { IUserPermissionOverride } from '@/types';

const userPermissionOverrideSchema = new Schema<IUserPermissionOverride & Document>(
  {
    // user:       { type: Schema.Types.ObjectId, ref: 'User',       required: true },
    // permission: { type: Schema.Types.ObjectId, ref: 'Permission', required: true },
    // granted:    { type: Boolean, required: true },  // true=force-grant, false=force-revoke
    // grantedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    // reason:     { type: String },
    // expiresAt:  { type: Date },  // optional expiry
  },
  { timestamps: true },
);

// userPermissionOverrideSchema.index({ user: 1, permission: 1 }, { unique: true });
// userPermissionOverrideSchema.index({ user: 1 });
// userPermissionOverrideSchema.index({ expiresAt: 1 }, { sparse: true });

export const UserPermissionOverride = model<IUserPermissionOverride & Document>(
  'UserPermissionOverride',
  userPermissionOverrideSchema,
);
