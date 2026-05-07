require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const session    = require('express-session');
const methodOverride = require('method-override');
const path       = require('path');

const app = express();

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId || null;
  next();
});

// Routes
app.use('/',        require('./routes/users'));
app.use('/books',   require('./routes/books'));
app.use('/feed',    require('./routes/feed'));
app.use('/search',  require('./routes/search'));
app.use('/friends', require('./routes/friends'));

app.listen(process.env.PORT || 3000, () =>
  console.log('BookLoop running on port', process.env.PORT || 3000));