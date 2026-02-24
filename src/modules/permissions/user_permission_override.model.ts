/**
 * UserPermissionOverride model — per-user permission grants/revocations.
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → User Permission Override
 */

import { Schema, model } from 'mongoose';
import type { IUserPermissionOverride } from '@/types';

const userPermissionOverrideSchema = new Schema<IUserPermissionOverride>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    permission: {
      type: Schema.Types.ObjectId,
      ref: 'Permission',
      required: true,
    },
    effect: {
      type: String,
      enum: ['grant', 'deny'],
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

userPermissionOverrideSchema.index({ user: 1 });
userPermissionOverrideSchema.index({ user: 1, permission: 1 }, { unique: true });
userPermissionOverrideSchema.index({ expiresAt: 1 }, { sparse: true });

export const UserPermissionOverride = model<IUserPermissionOverride>(
  'UserPermissionOverride',
  userPermissionOverrideSchema,
);
