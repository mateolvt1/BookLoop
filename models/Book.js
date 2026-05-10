const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
}, { _id: false });

const bookSchema = new mongoose.Schema({
  openLibraryId: { type: String, sparse: true },
  googleBooksId: { type: String, sparse: true },
  title:         { type: String, required: true },
  author:        { type: String, default: 'Unknown' },
  coverUrl:      { type: String, default: '' },
  description:   { type: String, default: '' },
  publishYear:   { type: Number },
  categories:    [String],
  pageCount:     { type: Number },

  // Global community ratings
  ratings:     [ratingSchema],
  avgRating:   { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

// Recalculate avgRating + ratingCount before every save
bookSchema.pre('save', function(next) {
  if (this.ratings && this.ratings.length > 0) {
    this.ratingCount = this.ratings.length;
    const sum        = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    this.avgRating   = Math.round((sum / this.ratingCount) * 10) / 10;
  } else {
    this.ratingCount = 0;
    this.avgRating   = 0;
  }
  next();
});

module.exports = mongoose.model('Book', bookSchema);
