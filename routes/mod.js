const express = require('express');
const prisma = require('../db');
const { requireMod } = require('../lib/auth');
const { removeStored } = require('../lib/upload');
const { TYPES } = require('../lib/constants');

const router = express.Router();
router.use(requireMod);

router.get('/', async (req, res, next) => {
  try {
    const pendingMaterials = await prisma.material.findMany({
      where: { status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        uploader: { select: { name: true } },
        course: {
          include: { department: true },
        },
      },
    });

    const pending = pendingMaterials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      size: m.size,
      original_name: m.originalName,
      description: m.description,
      created_at: m.createdAt.toISOString(),
      uploader: m.uploader.name,
      course_code: m.course.code,
      course_title: m.course.title,
      dept_code: m.course.department.code,
    }));

    const openReports = await prisma.report.findMany({
      where: { resolved: 0 },
      orderBy: { createdAt: 'asc' },
      include: {
        material: {
          include: { course: true },
        },
        reporter: { select: { name: true } },
      },
    });

    const reports = openReports.map((r) => ({
      id: r.id,
      reason: r.reason,
      created_at: r.createdAt.toISOString(),
      material_id: r.materialId,
      title: r.material.title,
      course_code: r.material.course.code,
      reporter: r.reporter.name,
    }));

    res.render('mod', { title: 'Moderation', pending, reports, TYPES });
  } catch (err) {
    next(err);
  }
});

router.post('/m/:id/approve', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    await prisma.material.update({
      where: { id: matId },
      data: {
        status: 'approved',
        rejectReason: null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
    });
    res.redirect('/mod');
  } catch (err) {
    next(err);
  }
});

router.post('/m/:id/reject', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    const reason = (req.body.reason || '').trim().slice(0, 200) || 'Not suitable for StudyHub.';
    await prisma.material.update({
      where: { id: matId },
      data: {
        status: 'rejected',
        rejectReason: reason,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
    });
    res.redirect('/mod');
  } catch (err) {
    next(err);
  }
});

// Remove a material for good (used for reported files).
router.post('/m/:id/remove', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    const m = await prisma.material.findUnique({ where: { id: matId } });
    if (m) {
      await prisma.material.delete({ where: { id: matId } });
      await removeStored(m.storedName);
    }
    res.redirect('/mod');
  } catch (err) {
    next(err);
  }
});

router.post('/reports/:id/dismiss', async (req, res, next) => {
  try {
    const repId = parseInt(req.params.id, 10);
    await prisma.report.update({
      where: { id: repId },
      data: { resolved: 1 },
    });
    res.redirect('/mod');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
