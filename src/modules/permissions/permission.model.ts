

import { Schema, model } from 'mongoose';
import type { IPermission } from '@/types';

const permissionSchema = new Schema<IPermission>(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    component: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

permissionSchema.index({ resource: 1 });
permissionSchema.index({ component: 1 });

export const Permission = model<IPermission>('Permission', permissionSchema);
