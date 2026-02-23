/**
 * Policy model — ABAC policy documents (13 policies).
 *
 * TODO: Member 4 — implement fields, seed via src/seed/02_policies.ts
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Policies (13 defined: own_resource, active_only, etc.)
 *      MASTER_PROMPT.md → OCP — add new policy by registering ConditionHandler in PermissionEngine
 */

import { Schema, model, Document } from 'mongoose';
import type { IPolicy } from '@/types';

const policySchema = new Schema<IPolicy & Document>(
  {
    // name:        { type: String, required: true, unique: true },  // e.g. 'own_resource'
    // condition:   { type: String, required: true },                // PolicyCondition enum value
    // description: { type: String },
    // isSystem:    { type: Boolean, default: true },
  },
  { timestamps: true },
);

// policySchema.index({ name: 1 }, { unique: true });
// policySchema.index({ condition: 1 });

export const Policy = model<IPolicy & Document>('Policy', policySchema);
