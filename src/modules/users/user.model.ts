import mongoose, {
  Document,
  Model,
  Schema,
} from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IUserPreferences {
  defaultRadius?: number;
  connectorTypes?: string[];
  emailNotifications?: boolean;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'user' | 'moderator' | 'admin';
  isEmailVerified: boolean;
  emailVerifyToken: string | null;
  emailVerifyExpires: Date | null;
  refreshToken: string | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  preferences: IUserPreferences;
  bio: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const RFC5322 =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

const URL_REGEX = /^https?:\/\/.+/;

const userSchema = new Schema<IUser, IUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v: string) => RFC5322.test(v),
        message: 'Invalid email address',
      },
      sparse: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },

    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name must be at most 50 characters'],
      trim: true,
    },

    avatarUrl: {
      type: String,
      default: null,
      validate: {
        validator: (v: string | null) => v === null || URL_REGEX.test(v),
        message: 'Avatar URL must be a valid HTTP/HTTPS URL',
      },
    },

    role: {
      type: String,
      required: true,
      default: 'user',
      enum: {
        values: ['user', 'moderator', 'admin'],
        message: '{VALUE} is not a valid role',
      },
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },

    emailVerifyToken: {
      type: String,
      default: null,
      select: false,
    },

    emailVerifyExpires: {
      type: Date,
      default: null,
    },

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
    },

    preferences: {
      type: Object,
      default: {},
    },

    bio: {
      type: String,
      default: null,
      maxlength: [300, 'Bio must be at most 300 characters'],
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Note: email unique index is declared inline (unique: true, sparse: true)
// Note: role and isActive indexes are declared inline (index: true)
// Compound index for soft-delete + role admin queries
userSchema.index({ isActive: 1, role: 1 });

// ─── Pre-save hook — hash password ────────────────────────────────────────────

userSchema.pre('save', async function () {
  // `this` is the document being saved
  // Mongoose 6+ supports async pre-save without calling next()
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(12);
  (this as unknown as IUser).password = await bcrypt.hash(
    (this as unknown as IUser).password,
    salt
  );
});

// ─── Instance methods ─────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string);
};

// ─── Static methods ───────────────────────────────────────────────────────────

userSchema.statics.findByEmail = function (email: string): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+password');
};

// ─── Export ───────────────────────────────────────────────────────────────────

const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;
