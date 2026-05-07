const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  openLibraryId: { type: String, unique: true, sparse: true },
  title:         { type: String, required: true },
  author:        { type: String, default: 'Unknown' },
  coverUrl:      { type: String, default: '' },
  description:   { type: String, default: '' },
  publishYear:   { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);