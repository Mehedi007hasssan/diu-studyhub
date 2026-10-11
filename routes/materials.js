const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireLogin, isMod, checkCsrf } = require('../lib/auth');
const { upload, inspectFile, removeStored, pathFor, isInline, MAX_MB, FILE_TYPES } = require('../lib/upload');
const { TYPES, EXAMS } = require('../lib/constants');

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('error', { title: 'Slow down', message: 'Upload limit reached. Please try again later.' }),
});

function notFound(res, message = 'Not found.') {
  return res.status(404).render('error', { title: 'Not found', message });
}

function getMaterial(id) {
  return db
    .prepare(
      `SELECT m.*, u.name AS uploader_name, c.code AS course_code, c.title AS course_title,
              d.code AS dept_code, d.name AS dept_name
       FROM materials m
       JOIN users u ON u.id = m.uploader_id
       JOIN courses c ON c.id = m.course_id
       JOIN departments d ON d.id = c.department_id
       WHERE m.id = ?`
    )
    .get(id);
}

// Approved files are public to everyone; pending/rejected only to the uploader and moderators.
function canSee(m, user) {
  if (!m) return false;
  if (m.status === 'approved') return true;
  return !!user && (user.id === m.uploader_id || isMod(user));
}

// ---------- Upload ----------
function uploadFormData(extra = {}) {
  const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name').all();
  const courses = db
    .prepare('SELECT id, department_id, code, title FROM courses ORDER BY code')
    .all();
  return { title: 'Upload material', departments, courses, TYPES, EXAMS, MAX_MB, errors: [], form: {}, ...extra };
}

router.get('/upload', requireLogin, (req, res) => {
  const form = {};
  const cid = parseInt(req.query.course, 10);
  if (cid) {
    const c = db.prepare('SELECT id, department_id FROM courses WHERE id = ?').get(cid);
    if (c) {
      form.course_id = c.id;
      form.department_id = c.department_id;
    }
  }
  if (!form.department_id && req.user.department_id) form.department_id = req.user.department_id;
  res.render('upload', uploadFormData({ form }));
});

router.post(
  '/upload',
  requireLogin,
  uploadLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        req.uploadError =
          err.code === 'LIMIT_FILE_SIZE' ? `That file is too large (max ${MAX_MB} MB).` : err.message;
      }
      next();
    });
  },
  async (req, res) => {
    const file = req.file;
    const cleanup = () => file && fs.unlink(file.path, () => {});
    const fail = (errors, form) => {
      cleanup();
      return res.status(400).render('upload', uploadFormData({ errors, form }));
    };

    if (!checkCsrf(req)) {
      cleanup();
      return res.status(403).render('error', {
        title: 'Session expired',
        message: 'Your form expired. Please go back, refresh and try again.',
      });
    }

    const b = req.body || {};
    const form = {
      department_id: parseInt(b.department_id, 10) || null,
      course_id: parseInt(b.course_id, 10) || null,
      new_course_code: (b.new_course_code || '').trim(),
      new_course_title: (b.new_course_title || '').trim(),
      title: (b.title || '').trim(),
      type: b.type,
      exam: b.exam || '',
      term: (b.term || '').trim(),
      description: (b.description || '').trim(),
    };
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);

    if (form.title.length < 3 || form.title.length > 120) errors.push('Title must be 3-120 characters.');
    if (!TYPES[form.type]) errors.push('Please choose what kind of material this is.');
    if (form.exam && !EXAMS[form.exam]) form.exam = '';
    if (form.term.length > 30) errors.push('Semester/term is too long (max 30 characters).');
    if (form.description.length > 500) errors.push('Description is too long (max 500 characters).');
    if (!file && !req.uploadError) errors.push('Please choose a file to upload.');

    // Resolve the course: an existing one, or a newly suggested one.
    let course = null;
    if (form.course_id) {
      course = db.prepare('SELECT id FROM courses WHERE id = ?').get(form.course_id);
      if (!course) errors.push('That course does not exist.');
    } else if (form.new_course_code || form.new_course_title) {
      const code = form.new_course_code.toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9-]{2,12}$/.test(code)) errors.push('Course code must be 2-12 letters/numbers, e.g. CSE131.');
      if (form.new_course_title.length < 3 || form.new_course_title.length > 100)
        errors.push('Course title must be 3-100 characters.');
      if (!form.department_id || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(form.department_id))
        errors.push('Choose the department for the new course.');
      if (!errors.length) {
        form.new_course_code = code;
        course =
          db.prepare('SELECT id FROM courses WHERE department_id = ? AND code = ?').get(form.department_id, code) ||
          null;
      }
    } else {
      errors.push('Choose a course, or add a new one.');
    }

    if (errors.length) return fail(errors, form);

    const info = await inspectFile(file);
    if (!info.ok) {
      return fail(['The file content does not match its extension, so it was rejected.'], form);
    }

    if (!course) {
      const r = db
        .prepare('INSERT INTO courses (department_id, code, title, created_by) VALUES (?, ?, ?, ?)')
        .run(form.department_id, form.new_course_code, form.new_course_title, req.user.id);
      course = { id: Number(r.lastInsertRowid) };
    }

    const dup = db
      .prepare(`SELECT id FROM materials WHERE sha256 = ? AND course_id = ? AND status != 'rejected'`)
      .get(info.sha256, course.id);
    if (dup) {
      cleanup();
      return res.status(409).render('error', {
        title: 'Already uploaded',
        message: 'This exact file is already in this course.',
        link: { href: '/m/' + dup.id, text: 'View the existing file' },
      });
    }

    const mod = isMod(req.user);
    const result = db
      .prepare(
        `INSERT INTO materials (course_id, uploader_id, title, type, exam, term, description,
           stored_name, original_name, mime, size, sha256, status, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${mod ? "datetime('now')" : 'NULL'})`
      )
      .run(
        course.id,
        req.user.id,
        form.title,
        form.type,
        form.type === 'question' ? form.exam || null : null,
        form.term || null,
        form.description || null,
        file.filename,
        file.originalname.slice(0, 200),
        info.mime,
        file.size,
        info.sha256,
        mod ? 'approved' : 'pending',
        mod ? req.user.id : null
      );

    res.redirect(mod ? '/m/' + Number(result.lastInsertRowid) + '?new=1' : '/my?uploaded=1');
  }
);

// ---------- My uploads ----------
router.get('/my', requireLogin, (req, res) => {
  const items = db
    .prepare(
      `SELECT m.id, m.title, m.type, m.status, m.reject_reason, m.downloads, m.created_at,
              c.code AS course_code, c.id AS course_id
       FROM materials m JOIN courses c ON c.id = m.course_id
       WHERE m.uploader_id = ? ORDER BY m.created_at DESC, m.id DESC`
    )
    .all(req.user.id);
  res.render('my', { title: 'My uploads', items, TYPES, justUploaded: req.query.uploaded === '1' });
});

// ---------- View / download ----------
router.get('/m/:id', (req, res) => {
  const m = getMaterial(req.params.id);
  if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');

  const reported =
    req.user && db.prepare('SELECT 1 FROM reports WHERE material_id = ? AND reporter_id = ?').get(m.id, req.user.id);
  const openReports = isMod(req.user)
    ? db.prepare('SELECT COUNT(*) AS n FROM reports WHERE material_id = ? AND resolved = 0').get(m.id).n
    : 0;

  res.render('material', {
    title: m.title,
    m,
    TYPES,
    EXAMS,
    inline: isInline(m.mime),
    canDelete: !!req.user && (req.user.id === m.uploader_id || isMod(req.user)),
    isOwner: !!req.user && req.user.id === m.uploader_id,
    reported: !!reported,
    justReported: req.query.reported === '1',
    justUploaded: req.query.new === '1',
    openReports,
  });
});

router.get('/m/:id/download', (req, res) => {
  const m = getMaterial(req.params.id);
  if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');
  const file = pathFor(m.stored_name);
  if (!fs.existsSync(file)) return notFound(res, 'The file is missing from the server.');
  if (m.status === 'approved') db.prepare('UPDATE materials SET downloads = downloads + 1 WHERE id = ?').run(m.id);
  res.download(file, m.original_name);
});

router.get('/m/:id/view', (req, res) => {
  const m = getMaterial(req.params.id);
  if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');
  if (!isInline(m.mime)) return res.redirect('/m/' + m.id + '/download');
  const file = pathFor(m.stored_name);
  if (!fs.existsSync(file)) return notFound(res, 'The file is missing from the server.');
  res.setHeader('Content-Type', m.mime);
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(file);
});

// ---------- Report / delete ----------
router.post('/m/:id/report', requireLogin, (req, res) => {
  const m = getMaterial(req.params.id);
  if (!m || m.status !== 'approved') return notFound(res);
  const reason = (req.body.reason || '').trim().slice(0, 300);
  if (reason.length < 5) {
    return res.status(400).render('error', {
      title: 'Report not sent',
      message: 'Please describe the problem (at least 5 characters).',
      link: { href: '/m/' + m.id, text: 'Go back' },
    });
  }
  if (m.uploader_id !== req.user.id) {
    db.prepare('INSERT OR IGNORE INTO reports (material_id, reporter_id, reason) VALUES (?, ?, ?)').run(
      m.id,
      req.user.id,
      reason
    );
  }
  res.redirect('/m/' + m.id + '?reported=1');
});

router.post('/m/:id/delete', requireLogin, (req, res) => {
  const m = getMaterial(req.params.id);
  if (!m) return notFound(res);
  if (m.uploader_id !== req.user.id && !isMod(req.user)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'You cannot delete this.' });
  }
  db.prepare('DELETE FROM materials WHERE id = ?').run(m.id);
  removeStored(m.stored_name);
  res.redirect(m.uploader_id === req.user.id ? '/my' : '/c/' + m.course_id);
});

module.exports = router;
