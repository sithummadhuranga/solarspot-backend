/**
 * User / Auth Mongoose model.
 *
 * Requirements from PROJECT_OVERVIEW.md:
 *   - Indexes: email (unique), role, isActive
 *              emailVerifyToken (sparse), passwordResetToken (sparse), refreshToken (sparse)
 *   - Fields:  password, tokens → select: false
 *   - Hook:    bcrypt pre-save (rounds: 12)
 *   - Method:  toJSON() removes password, tokens, __v
 *   - Soft-delete: isActive + deletedAt + deletedBy
 *
 * ACID notes:
 *   - refreshToken rotation: findOneAndUpdate matching on OLD token value (Isolation rule)
 *   - Write concern: default majority (never override)
 */

import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '@/types';

const BCRYPT_ROUNDS = 12;

const userSchema = new Schema<IUser>(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
      minlength: 6,
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    emailVerifyToken: {
      type: String,
      select: false,
    },
    emailVerifyExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ emailVerifyToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ refreshToken: 1 }, { sparse: true });

// ─── Bcrypt pre-save hook ───────────────────────────────────────────────────
// Mongoose 9 async pre-hooks do not receive `next` — simply throw on error.
userSchema.pre('save', async function () {
  // Only hash if password is modified or new
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
});

// ─── Password comparison method ─────────────────────────────────────────────
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── toJSON override — never expose sensitive fields ────────────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.emailVerifyToken;
  delete obj.emailVerifyExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.__v;
  return obj;
};

export const User = model<IUser>('User', userSchema);
