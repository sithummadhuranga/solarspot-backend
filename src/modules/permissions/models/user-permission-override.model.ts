import mongoose, { Document, Schema } from 'mongoose';

export type OverrideEffect = 'grant' | 'deny';

export interface IUserPermissionOverride extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId; // ref: User
  permission: mongoose.Types.ObjectId; // ref: Permission
  effect: OverrideEffect; // 'grant' or 'deny'
  reason: string; // audit trail: why was this override applied?
  grantedBy: mongoose.Types.ObjectId; // ref: User (admin who created override)
  expiresAt: Date | null; // null = permanent
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userPermissionOverrideSchema = new Schema<IUserPermissionOverride>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },

    permission: {
      type: Schema.Types.ObjectId,
      ref: 'Permission',
      required: [true, 'Permission is required'],
      index: true,
    },

    effect: {
      type: String,
      required: [true, 'Effect is required'],
      enum: {
        values: ['grant', 'deny'],
        message: '{VALUE} is not a valid override effect',
      },
    },

    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      minlength: [10, 'Reason must be at least 10 characters'],
      maxlength: [500, 'Reason must be at most 500 characters'],
    },

    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'GrantedBy is required'],
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
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

// Compound index for user permission overrides
userPermissionOverrideSchema.index({ user: 1, permission: 1 });
userPermissionOverrideSchema.index({ user: 1, isActive: 1 });
userPermissionOverrideSchema.index({ expiresAt: 1, isActive: 1 });

// Virtual: check if override is expired
userPermissionOverrideSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return this.expiresAt < new Date();
});

const UserPermissionOverride = mongoose.model<IUserPermissionOverride>(
  'UserPermissionOverride',
  userPermissionOverrideSchema
);
export default UserPermissionOverride;
