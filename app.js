try {
  process.loadEnvFile(); // reads .env if present (Node 20.12+)
} catch {}

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');

const { loadUser, csrfToken, csrfGuard, isMod } = require('./lib/auth');
const { TYPES, EXAMS } = require('./lib/constants');
const { icon, logo } = require('./lib/icons');
const SITE = require('./lib/site');

const isProd = process.env.NODE_ENV === 'production';
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24)) {
  console.warn('WARNING: SESSION_SECRET should be set to a long random string in production.');
}

const app = express();

// Trust reverse proxy (essential for Vercel and production deployments behind SSL)
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
// Using process.cwd() ensures views resolve reliably across Vercel serverless function bundles
app.set('views', path.join(process.cwd(), 'views'));

// Security headers with CSP tailored for Google Fonts, CSS, inline icons, and S3/Cloudinary media
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'https:', 'blob:'],
        'media-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'https:'],
      },
    },
  })
);

app.use(express.static(path.join(process.cwd(), 'public'), { maxAge: isProd ? '1d' : 0 }));
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

// Global template helpers
app.locals.SITE = SITE;
app.locals.icon = icon;
app.locals.logo = logo;
app.locals.TYPE_LABELS = TYPES;
app.locals.EXAM_LABELS = EXAMS;
app.locals.isMod = isMod;

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
  let d;
  if (s instanceof Date) {
    d = s;
  } else if (typeof s === 'string') {
    if (s.endsWith('Z') || s.includes('T')) {
      d = new Date(s);
    } else {
      d = new Date(s.replace(' ', 'T') + 'Z');
    }
  } else {
    d = new Date(s);
  }
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Route mounts
app.use(require('./routes/auth'));
app.use(require('./routes/browse'));
app.use(require('./routes/materials'));
app.use(require('./routes/pages'));
app.use('/mod', require('./routes/mod'));
app.use('/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' });
});

// 500 error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Unexpected server error.' });
});

module.exports = app;
