const express = require('express');
const db = require('../db');
const { requireMod } = require('../lib/auth');
const { removeStored } = require('../lib/upload');
const { TYPES } = require('../lib/constants');

const router = express.Router();
router.use(requireMod);

router.get('/', (req, res) => {
  const pending = db
    .prepare(
      `SELECT m.id, m.title, m.type, m.size, m.original_name, m.description, m.created_at,
              u.name AS uploader, c.code AS course_code, c.title AS course_title, d.code AS dept_code
       FROM materials m
       JOIN users u ON u.id = m.uploader_id
       JOIN courses c ON c.id = m.course_id
       JOIN departments d ON d.id = c.department_id
       WHERE m.status = 'pending' ORDER BY m.created_at ASC, m.id ASC`
    )
    .all();

  const reports = db
    .prepare(
      `SELECT r.id, r.reason, r.created_at, m.id AS material_id, m.title, c.code AS course_code,
              ru.name AS reporter
       FROM reports r
       JOIN materials m ON m.id = r.material_id
       JOIN courses c ON c.id = m.course_id
       JOIN users ru ON ru.id = r.reporter_id
       WHERE r.resolved = 0 ORDER BY r.created_at ASC`
    )
    .all();

  res.render('mod', { title: 'Moderation', pending, reports, TYPES });
});

router.post('/m/:id/approve', (req, res) => {
  db.prepare(
    `UPDATE materials SET status = 'approved', reject_reason = NULL, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(req.user.id, req.params.id);
  res.redirect('/mod');
});

router.post('/m/:id/reject', (req, res) => {
  const reason = (req.body.reason || '').trim().slice(0, 200) || 'Not suitable for StudyHub.';
  db.prepare(
    `UPDATE materials SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(reason, req.user.id, req.params.id);
  res.redirect('/mod');
});

// Remove a material for good (used for reported files).
router.post('/m/:id/remove', (req, res) => {
  const m = db.prepare('SELECT id, stored_name FROM materials WHERE id = ?').get(req.params.id);
  if (m) {
    db.prepare('DELETE FROM materials WHERE id = ?').run(m.id);
    removeStored(m.stored_name);
  }
  res.redirect('/mod');
});

router.post('/reports/:id/dismiss', (req, res) => {
  db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/mod');
});

module.exports = router;
