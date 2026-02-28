/**
 * RolePermission model — many-to-many role ↔ permission mapping with optional policies.
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Role-Permission Matrix
 */

import { Schema, model } from 'mongoose';
import type { IRolePermission } from '@/types';

// Ensure referenced models are registered on the active mongoose connection.
// Without this import, `.populate('policies')` can throw MissingSchemaError: 'Policy'.
import './policy.model';

const rolePermissionSchema = new Schema<IRolePermission>(
  {
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    permission: {
      type: Schema.Types.ObjectId,
      ref: 'Permission',
      required: true,
    },
    policies: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Policy',
      },
    ],
  },
  { timestamps: true },
);

rolePermissionSchema.index({ role: 1, permission: 1 }, { unique: true });
rolePermissionSchema.index({ role: 1 });

export const RolePermission = model<IRolePermission>('RolePermission', rolePermissionSchema);
