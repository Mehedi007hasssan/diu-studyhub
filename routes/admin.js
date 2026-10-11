const express = require('express');
const prisma = require('../db');
const { requireAdmin } = require('../lib/auth');
const { containsText } = require('../lib/prisma-helpers');

const router = express.Router();
router.use(requireAdmin);

const flash = (req, msg, ok = true) => {
  req.session.flash = { msg, ok };
};

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 80);

    const [
      usersCount,
      approvedCount,
      pendingCount,
      reportsCount,
      coursesCount,
      downloadsSum,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.material.count({ where: { status: 'approved' } }),
      prisma.material.count({ where: { status: 'pending' } }),
      prisma.report.count({ where: { resolved: 0 } }),
      prisma.course.count(),
      prisma.material.aggregate({ _sum: { downloads: true } }),
    ]);

    const stats = {
      users: usersCount,
      approved: approvedCount,
      pending: pendingCount,
      reports: reportsCount,
      courses: coursesCount,
      downloads: downloadsSum._sum.downloads || 0,
    };

    const userWhere = {};
    if (q) {
      userWhere.OR = [
        { name: containsText(q) },
        { email: containsText(q) },
        { studentId: containsText(q) },
      ];
    }

    const rawUsers = await prisma.user.findMany({
      where: userWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: { department: { select: { code: true } } },
    });

    const users = rawUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      student_id: u.studentId,
      role: u.role,
      created_at: u.createdAt.toISOString(),
      dept: u.department ? u.department.code : null,
    }));

    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

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
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/role', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const role = req.body.role;

    if (!['student', 'moderator', 'admin'].includes(role)) {
      flash(req, 'Choose a valid role.', false);
    } else if (userId === req.user.id) {
      flash(req, 'You cannot change your own role.', false);
    } else {
      const updated = await prisma.user.updateMany({
        where: { id: userId },
        data: { role },
      });
      if (updated.count > 0) flash(req, 'Role updated.');
      else flash(req, 'That person was not found.', false);
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.post('/departments', async (req, res, next) => {
  try {
    const code = (req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const name = (req.body.name || '').trim();

    if (!/^[A-Z0-9-]{2,10}$/.test(code) || name.length < 3 || name.length > 80) {
      flash(req, 'Department code must be 2-10 letters or numbers, and the name 3-80 characters.', false);
      return res.redirect('/admin');
    }

    try {
      await prisma.department.create({ data: { code, name } });
      flash(req, `Department ${code} added.`);
    } catch {
      flash(req, `A department with code ${code} already exists.`, false);
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.post('/courses', async (req, res, next) => {
  try {
    const deptId = parseInt(req.body.department_id, 10);
    const code = (req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const title = (req.body.title || '').trim();

    if (!deptId || !(await prisma.department.findUnique({ where: { id: deptId } }))) {
      flash(req, 'Choose a department.', false);
    } else if (!/^[A-Z0-9-]{2,12}$/.test(code) || title.length < 3 || title.length > 100) {
      flash(req, 'Course code must be 2-12 letters or numbers, and the title 3-100 characters.', false);
    } else {
      try {
        await prisma.course.create({
          data: {
            departmentId: deptId,
            code,
            title,
            createdBy: req.user.id,
          },
        });
        flash(req, `Course ${code} added.`);
      } catch {
        flash(req, `${code} already exists in that department.`, false);
      }
    }
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
