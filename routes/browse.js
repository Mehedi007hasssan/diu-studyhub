const express = require('express');
const db = require('../db');
const { TYPES } = require('../lib/constants');

const router = express.Router();

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

router.get('/', (req, res) => {
  const departments = db
    .prepare(
      `SELECT d.id, d.code, d.name,
         (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.id) AS courses,
         (SELECT COUNT(*) FROM materials m JOIN courses c ON c.id = m.course_id
            WHERE c.department_id = d.id AND m.status = 'approved') AS materials
       FROM departments d ORDER BY d.name`
    )
    .all();

  const recent = db
    .prepare(
      `SELECT m.id, m.title, m.type, m.created_at, c.code AS course_code, c.id AS course_id, d.code AS dept_code
       FROM materials m JOIN courses c ON c.id = m.course_id JOIN departments d ON d.id = c.department_id
       WHERE m.status = 'approved' ORDER BY m.created_at DESC, m.id DESC LIMIT 8`
    )
    .all();

  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM materials WHERE status = 'approved') AS materials,
         (SELECT COUNT(*) FROM courses) AS courses,
         (SELECT COUNT(*) FROM users) AS students,
         (SELECT COALESCE(SUM(downloads), 0) FROM materials) AS downloads`
    )
    .get();

  res.render('home', { title: 'DIU StudyHub', departments, recent, stats, TYPES });
});

router.get('/d/:code', (req, res) => {
  const dept = db
    .prepare('SELECT id, code, name FROM departments WHERE code = ? COLLATE NOCASE')
    .get(req.params.code);
  if (!dept) return res.status(404).render('error', { title: 'Not found', message: 'Department not found.' });

  const q = (req.query.q || '').trim().slice(0, 60);
  let sql = `SELECT c.id, c.code, c.title,
               (SELECT COUNT(*) FROM materials m WHERE m.course_id = c.id AND m.status = 'approved') AS materials
             FROM courses c WHERE c.department_id = ?`;
  const params = [dept.id];
  if (q) {
    sql += ` AND (c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\')`;
    params.push('%' + escapeLike(q) + '%', '%' + escapeLike(q) + '%');
  }
  sql += ' ORDER BY c.code';
  const courses = db.prepare(sql).all(...params);

  res.render('department', { title: dept.name, dept, courses, q });
});

router.get('/c/:id', (req, res) => {
  const course = db
    .prepare(
      `SELECT c.id, c.code, c.title, d.code AS dept_code, d.name AS dept_name
       FROM courses c JOIN departments d ON d.id = c.department_id WHERE c.id = ?`
    )
    .get(req.params.id);
  if (!course) return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });

  const type = TYPES[req.query.type] ? req.query.type : '';
  const sort = req.query.sort === 'popular' ? 'popular' : 'new';

  let sql = `SELECT m.id, m.title, m.type, m.exam, m.term, m.size, m.downloads, m.created_at, u.name AS uploader
             FROM materials m JOIN users u ON u.id = m.uploader_id
             WHERE m.course_id = ? AND m.status = 'approved'`;
  const params = [course.id];
  if (type) {
    sql += ' AND m.type = ?';
    params.push(type);
  }
  sql += sort === 'popular' ? ' ORDER BY m.downloads DESC, m.id DESC' : ' ORDER BY m.created_at DESC, m.id DESC';
  const materials = db.prepare(sql).all(...params);

  const counts = Object.fromEntries(
    db
      .prepare(
        `SELECT type, COUNT(*) AS n FROM materials WHERE course_id = ? AND status = 'approved' GROUP BY type`
      )
      .all(course.id)
      .map((r) => [r.type, r.n])
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  res.render('course', {
    title: course.code + ' - ' + course.title,
    course,
    materials,
    TYPES,
    type,
    sort,
    counts,
    total,
  });
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 100);
  const deptId = parseInt(req.query.dept, 10) || null;
  const type = TYPES[req.query.type] ? req.query.type : '';
  const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name').all();

  let materials = [];
  let courses = [];
  const searched = q.length > 0 || deptId || type;

  if (searched) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    let sql = `SELECT m.id, m.title, m.type, m.exam, m.term, m.downloads, m.created_at,
                 c.id AS course_id, c.code AS course_code, c.title AS course_title, d.code AS dept_code
               FROM materials m JOIN courses c ON c.id = m.course_id JOIN departments d ON d.id = c.department_id
               WHERE m.status = 'approved'`;
    const params = [];
    for (const t of terms) {
      const like = '%' + escapeLike(t) + '%';
      sql += ` AND (m.title LIKE ? ESCAPE '\\' OR m.description LIKE ? ESCAPE '\\' OR m.term LIKE ? ESCAPE '\\'
                 OR m.original_name LIKE ? ESCAPE '\\' OR c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\')`;
      params.push(like, like, like, like, like, like);
    }
    if (deptId) {
      sql += ' AND d.id = ?';
      params.push(deptId);
    }
    if (type) {
      sql += ' AND m.type = ?';
      params.push(type);
    }
    sql += ' ORDER BY m.downloads DESC, m.created_at DESC LIMIT 60';
    materials = db.prepare(sql).all(...params);

    if (terms.length) {
      let csql = `SELECT c.id, c.code, c.title, d.code AS dept_code
                  FROM courses c JOIN departments d ON d.id = c.department_id WHERE 1 = 1`;
      const cparams = [];
      for (const t of terms) {
        const like = '%' + escapeLike(t) + '%';
        csql += ` AND (c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\')`;
        cparams.push(like, like);
      }
      if (deptId) {
        csql += ' AND d.id = ?';
        cparams.push(deptId);
      }
      csql += ' ORDER BY c.code LIMIT 12';
      courses = db.prepare(csql).all(...cparams);
    }
  }

  res.render('search', { title: q ? 'Search: ' + q : 'Search', q, deptId, type, departments, materials, courses, TYPES, searched });
});

module.exports = router;
