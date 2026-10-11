const fs = require('fs');
const path = require('path');
// Node's built-in SQLite (Node 22.13+). No native compile step, so it installs cleanly on Windows.
const { DatabaseSync } = require('node:sqlite');
const seed = require('./data/seed');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'studyhub.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (department_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  student_id TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','moderator','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  exam TEXT,
  term TEXT,
  description TEXT,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id, status);
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status, created_at);
CREATE INDEX IF NOT EXISTS idx_materials_hash ON materials(sha256);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (material_id, reporter_id)
);
`);

// Seed starter departments/courses only on first run.
if (db.prepare('SELECT COUNT(*) AS n FROM departments').get().n === 0) {
  const insDept = db.prepare('INSERT INTO departments (code, name) VALUES (?, ?)');
  const insCourse = db.prepare(
    'INSERT OR IGNORE INTO courses (department_id, code, title) VALUES (?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const [code, name] of seed.departments) insDept.run(code, name);
    for (const [dcode, ccode, title] of seed.courses) {
      const d = db.prepare('SELECT id FROM departments WHERE code = ?').get(dcode);
      if (d) insCourse.run(d.id, ccode, title);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Promote any account whose email is listed in ADMIN_EMAILS.
for (const email of require('./lib/config').adminEmails()) {
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'").run(email);
}

module.exports = db;
