const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();
router.use(requireAdmin);

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

// One-time message shown after a redirect (kept in the signed session cookie).
const flash = (req, msg, ok = true) => {
  req.session.flash = { msg, ok };
};

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 80);

  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM materials WHERE status = 'approved') AS approved,
         (SELECT COUNT(*) FROM materials WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM reports WHERE resolved = 0) AS reports,
         (SELECT COUNT(*) FROM courses) AS courses,
         (SELECT COALESCE(SUM(downloads), 0) FROM materials) AS downloads`
    )
    .get();

  let sql = `SELECT u.id, u.name, u.email, u.student_id, u.role, u.created_at, d.code AS dept
             FROM users u LEFT JOIN departments d ON d.id = u.department_id`;
  const params = [];
  if (q) {
    const like = '%' + escapeLike(q) + '%';
    sql += ` WHERE u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.student_id LIKE ? ESCAPE '\\'`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY u.created_at DESC, u.id DESC LIMIT 100';
  const users = db.prepare(sql).all(...params);

  const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name').all();

  const f = req.session.flash || null;
  req.session.flash = null;

  res.render('admin', {
    title: 'Admin',
    stats,
    users,
    q,
    departments,
    msg: f ? f.msg : null,
    msgOk: f ? f.ok : true,
  });
});

router.post('/users/:id/role', (req, res) => {
  const role = req.body.role;
  if (!['student', 'moderator', 'admin'].includes(role)) {
    flash(req, 'Choose a valid role.', false);
  } else if (Number(req.params.id) === req.user.id) {
    flash(req, 'You cannot change your own role.', false);
  } else {
    const r = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    if (r.changes) flash(req, 'Role updated.');
    else flash(req, 'That person was not found.', false);
  }
  res.redirect('/admin');
});

router.post('/departments', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const name = (req.body.name || '').trim();
  if (!/^[A-Z0-9-]{2,10}$/.test(code) || name.length < 3 || name.length > 80) {
    flash(req, 'Department code must be 2-10 letters or numbers, and the name 3-80 characters.', false);
    return res.redirect('/admin');
  }
  try {
    db.prepare('INSERT INTO departments (code, name) VALUES (?, ?)').run(code, name);
    flash(req, `Department ${code} added.`);
  } catch {
    flash(req, `A department with code ${code} already exists.`, false);
  }
  res.redirect('/admin');
});

router.post('/courses', (req, res) => {
  const deptId = parseInt(req.body.department_id, 10);
  const code = (req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const title = (req.body.title || '').trim();
  if (!deptId || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(deptId)) {
    flash(req, 'Choose a department.', false);
  } else if (!/^[A-Z0-9-]{2,12}$/.test(code) || title.length < 3 || title.length > 100) {
    flash(req, 'Course code must be 2-12 letters or numbers, and the title 3-100 characters.', false);
  } else {
    try {
      db.prepare('INSERT INTO courses (department_id, code, title, created_by) VALUES (?, ?, ?, ?)').run(
        deptId,
        code,
        title,
        req.user.id
      );
      flash(req, `Course ${code} added.`);
    } catch {
      flash(req, `${code} already exists in that department.`, false);
    }
  }
  res.redirect('/admin');
});

module.exports = router;
