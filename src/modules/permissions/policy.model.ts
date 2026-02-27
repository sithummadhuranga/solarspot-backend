/**
 * Policy model — ABAC policy documents (13 policies).
 *
 * Ref: PROJECT_OVERVIEW.md → RBAC → Policies (13 defined)
 *      MASTER_PROMPT.md → OCP — add new policy by registering ConditionHandler in PermissionEngine
 */

import { Schema, model } from 'mongoose';
import type { IPolicy } from '@/types';

const policySchema = new Schema<IPolicy>(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    condition: {
      type: String,
      required: true,
    },
    effect: {
      type: String,
      enum: ['allow', 'deny'],
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
    },
    isSystem: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

policySchema.index({ slug: 1 }, { unique: true });
policySchema.index({ condition: 1 });

export const Policy = model<IPolicy>('Policy', policySchema);
