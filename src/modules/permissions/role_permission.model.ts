/**
 * RolePermission model — many-to-many role ↔ permission mapping with optional policies.
 *
 * TODO: Member 4 — implement fields, seed via src/seed/04_role_permissions.ts
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Role-Permission Matrix
 */

import { Schema, model, Document } from 'mongoose';
import type { IRolePermission } from '@/types';

const rolePermissionSchema = new Schema<IRolePermission & Document>(
  {
    // role:       { type: Schema.Types.ObjectId, ref: 'Role',       required: true },
    // permission: { type: Schema.Types.ObjectId, ref: 'Permission', required: true },
    // policies:   [{ type: Schema.Types.ObjectId, ref: 'Policy' }],
    // granted:    { type: Boolean, default: true },
  },
  { timestamps: true },
);

// rolePermissionSchema.index({ role: 1, permission: 1 }, { unique: true });
// rolePermissionSchema.index({ role: 1 });

export const RolePermission = model<IRolePermission & Document>('RolePermission', rolePermissionSchema);
