try {
  process.loadEnvFile(); // reads .env if present (Node 20.12+)
} catch {}

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');

const isProd = process.env.NODE_ENV === 'production';
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24)) {
  console.error('SESSION_SECRET must be set to a long random string in production.');
  process.exit(1);
}

require('./db'); // creates tables + seeds on first run, promotes ADMIN_EMAILS
const { loadUser, csrfToken, csrfGuard, isMod } = require('./lib/auth');
const { TYPES, EXAMS } = require('./lib/constants');
const { icon, logo } = require('./lib/icons');
const SITE = require('./lib/site');

const app = express();
if (isProd) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// The page uses Google Fonts (Sora) for headings; everything else is served from this site.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      },
    },
  })
);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1d' : 0 }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(
  cookieSession({
    name: 'studyhub',
    keys: [process.env.SESSION_SECRET || 'dev-only-insecure-secret'],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
  })
);
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.path = req.path;
  next();
});
app.use(loadUser);
app.use(csrfToken);
app.use(csrfGuard);

// Helpers available in every template
app.locals.SITE = SITE;
app.locals.icon = icon;
app.locals.logo = logo;
app.locals.TYPE_LABELS = TYPES;
app.locals.EXAM_LABELS = EXAMS;
app.locals.isMod = isMod;
// Stable colour per department/course code: hue-0 ... hue-7 (see style.css)
app.locals.hueClass = (s) => {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'hue-' + (h % 8);
};
app.locals.plural = (n, word) => (Number(n) === 1 ? word : word + 's');
app.locals.fmtSize = (n) => {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
};
app.locals.fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
app.use(require('./routes/auth'));
app.use(require('./routes/browse'));
app.use(require('./routes/materials'));
app.use(require('./routes/pages'));
app.use('/mod', require('./routes/mod'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Unexpected server error.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`DIU StudyHub running at http://localhost:${port}`));
