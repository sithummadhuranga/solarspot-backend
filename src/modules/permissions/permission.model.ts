/**
 * Permission model — one document per permission action string.
 *
 * TODO: Member 4 — implement fields, seed via src/seed/01_permissions.ts
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Permissions (35 defined)
 *      MASTER_PROMPT.md → SOLID OCP — never modify existing permission docs, only add
 */

import { Schema, model, Document } from 'mongoose';
import type { IPermission } from '@/types';

const permissionSchema = new Schema<IPermission & Document>(
  {
    // action:      { type: String, required: true, unique: true },  // e.g. 'stations.create'
    // resource:    { type: String, required: true },                 // e.g. 'stations'
    // description: { type: String },
    // isSystem:    { type: Boolean, default: true },                 // system-managed, not user-editable
  },
  { timestamps: true },
);

// permissionSchema.index({ action: 1 }, { unique: true });
// permissionSchema.index({ resource: 1 });

export const Permission = model<IPermission & Document>('Permission', permissionSchema);
