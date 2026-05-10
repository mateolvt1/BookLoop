const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio:      { type: String, default: '' },

  // Profile images stored as base64 data URIs
  // For production: swap these for Cloudinary URL strings
  avatar:   { type: String, default: '' },  // data:image/... or Cloudinary URL
  banner:   { type: String, default: '' },  // data:image/... or Cloudinary URL

  currentlyReading: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  favoriteBooks:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  readNext:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  friends:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('User', userSchema);
