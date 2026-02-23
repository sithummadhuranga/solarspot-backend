/**
 * Role model — one document per role slug (10 roles).
 *
 * TODO: Member 4 — implement fields, seed via src/seed/03_roles.ts
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Roles (10 defined)
 */

import { Schema, model, Document } from 'mongoose';
import type { IRole } from '@/types';

const roleSchema = new Schema<IRole & Document>(
  {
    // slug:        { type: String, required: true, unique: true },  // e.g. 'super_admin'
    // name:        { type: String, required: true },
    // description: { type: String },
    // isSystem:    { type: Boolean, default: true },
    // priority:    { type: Number, default: 0 },  // higher = more privileged
  },
  { timestamps: true },
);

// roleSchema.index({ slug: 1 }, { unique: true });

export const Role = model<IRole & Document>('Role', roleSchema);
