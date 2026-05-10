require('dotenv').config();
const express        = require('express');
const mongoose       = require('mongoose');
const session        = require('express-session');
const methodOverride = require('method-override');
const path           = require('path');

const app = express();

// ── MongoDB ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅  MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ── Middleware ────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Increase JSON limit to handle base64 image uploads (~3-4MB)
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

app.use(methodOverride('_method'));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'bookloop-secret',
  resave:            false,
  saveUninitialized: false,
}));

// ── Global locals ─────────────────────────────────────────────
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.userId || null;
  res.locals.sessionUser = null;
  if (req.session.userId) {
    try {
      const User = require('./models/User');
      res.locals.sessionUser = await User.findById(req.session.userId)
        .populate('currentlyReading', 'title author coverUrl')
        .populate('favoriteBooks',    'title author coverUrl')
        .populate('readNext',         'title author coverUrl')
        .select('username bio avatar banner friends favoriteBooks currentlyReading readNext');
    } catch (e) { /* session expired or user deleted */ }
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/',        require('./routes/users'));
app.use('/home',    require('./routes/home'));
app.use('/books',   require('./routes/books'));
app.use('/feed',    require('./routes/feed'));
app.use('/search',  require('./routes/search'));
app.use('/friends', require('./routes/friends'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;">404 — Page not found. <a href="/">Go home</a></h2>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📖  BookLoop running on http://localhost:${PORT}`);
  if (!process.env.NYT_API_KEY) {
    console.warn('⚠️   NYT_API_KEY not set — bestseller lists will show an error until added to .env');
  }
});
