import mongoose, { Document, Schema } from 'mongoose';

export interface IRolePermission extends Document {
  _id: mongoose.Types.ObjectId;
  role: mongoose.Types.ObjectId; // ref: Role
  permission: mongoose.Types.ObjectId; // ref: Permission
  policies: mongoose.Types.ObjectId[]; // ref: Policy[] — policies attached to this role+permission combo
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermission>(
  {
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
      index: true,
    },

    permission: {
      type: Schema.Types.ObjectId,
      ref: 'Permission',
      required: [true, 'Permission is required'],
      index: true,
    },

    policies: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Policy' }],
      default: [],
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: one role+permission combo
rolePermissionSchema.index({ role: 1, permission: 1 }, { unique: true });

// Compound index for active role permissions
rolePermissionSchema.index({ role: 1, isActive: 1 });
rolePermissionSchema.index({ permission: 1, isActive: 1 });

const RolePermission = mongoose.model<IRolePermission>(
  'RolePermission',
  rolePermissionSchema
);
export default RolePermission;
