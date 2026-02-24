/**
 * Role model — one document per role slug (10 roles).
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Roles (10 defined)
 */

import { Schema, model } from 'mongoose';
import type { IRole } from '@/types';

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    roleLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 4,
    },
    isSystem: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

roleSchema.index({ name: 1 }, { unique: true });
roleSchema.index({ isActive: 1 });
roleSchema.index({ roleLevel: 1 });

export const Role = model<IRole>('Role', roleSchema);
