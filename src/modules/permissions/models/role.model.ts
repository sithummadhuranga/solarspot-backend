import mongoose, { Document, Schema } from 'mongoose';

export interface IRole extends Document {
  _id: mongoose.Types.ObjectId;
  name: string; // slug: 'admin', 'moderator', 'user', etc.
  displayName: string; // human-readable: 'Administrator', 'Moderator'
  description: string;
  roleLevel: number; // 0 (guest) to 4 (admin)
  isSystem: boolean; // true for guest/user/moderator/admin (cannot be deleted)
  component: string; // 'auth', 'stations', 'reviews', 'weather', 'permissions'
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [2, 'Role name must be at least 2 characters'],
      maxlength: [50, 'Role name must be at most 50 characters'],
      index: true,
    },

    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [100, 'Display name must be at most 100 characters'],
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },

    roleLevel: {
      type: Number,
      required: [true, 'Role level is required'],
      min: [0, 'Role level must be at least 0'],
      max: [4, 'Role level must be at most 4'],
      validate: {
        validator: Number.isInteger,
        message: 'Role level must be an integer',
      },
      index: true,
    },

    isSystem: {
      type: Boolean,
      required: true,
      default: false,
    },

    component: {
      type: String,
      required: [true, 'Component is required'],
      enum: {
        values: ['auth', 'stations', 'reviews', 'weather', 'permissions'],
        message: '{VALUE} is not a valid component',
      },
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

// Compound index for active system roles
roleSchema.index({ isActive: 1, roleLevel: 1 });
roleSchema.index({ isSystem: 1, isActive: 1 });

// Prevent deletion of system roles
roleSchema.pre('deleteOne', { document: true, query: false }, function () {
  if (this.isSystem) {
    throw new Error('Cannot delete system role');
  }
});

const Role = mongoose.model<IRole>('Role', roleSchema);
export default Role;
