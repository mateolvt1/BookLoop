const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  book:    { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
  content: { type: String, required: true },
  type:    { type: String, enum: ['review', 'update', 'finished'], default: 'update' },
  likes:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);