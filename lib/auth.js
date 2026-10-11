const crypto = require('crypto');
const db = require('../db');

// Load the logged-in user (if any) and expose it to templates.
function loadUser(req, res, next) {
  res.locals.user = null;
  const id = req.session && req.session.userId;
  if (id) {
    const u = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.department_id, d.code AS dept_code
         FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
      )
      .get(id);
    if (u) {
      req.user = u;
      res.locals.user = u;
    } else {
      req.session = null; // user was deleted
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireMod(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Moderators only.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Admins only.' });
  }
  next();
}

const isMod = (u) => !!u && (u.role === 'moderator' || u.role === 'admin');

// --- CSRF (synchronizer token kept in the signed session cookie) ---
function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function checkCsrf(req) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const real = req.session && req.session.csrf;
  if (!sent || !real) return false;
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(real));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Global guard for normal (urlencoded) POSTs. Multipart uploads are checked in the upload route
// after multer has parsed the body.
function csrfGuard(req, res, next) {
  if (req.method !== 'POST') return next();
  const type = req.headers['content-type'] || '';
  if (type.startsWith('multipart/form-data')) return next();
  if (!checkCsrf(req)) {
    return res.status(403).render('error', {
      title: 'Session expired',
      message: 'Your form expired. Please go back, refresh the page and try again.',
    });
  }
  next();
}

module.exports = { loadUser, requireLogin, requireMod, requireAdmin, isMod, csrfToken, csrfGuard, checkCsrf };
