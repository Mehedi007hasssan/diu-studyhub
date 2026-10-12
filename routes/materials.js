const fs = require('fs');
const path = require('path');
const express = require('express');
const prisma = require('../db');
const { requireLogin, isMod, checkCsrf } = require('../lib/auth');
const {
  upload,
  inspectFile,
  uploadToStorage,
  removeStored,
  getFileDownloadUrl,
  getFileViewUrl,
  isInline,
  MAX_MB,
} = require('../lib/upload');
const { uploadLimiter } = require('../lib/ratelimit');
const { LOCAL_UPLOAD_DIR, getLocalFilePath } = require('../lib/storage');
const { TYPES, EXAMS } = require('../lib/constants');

const router = express.Router();

function notFound(res, message = 'Not found.') {
  return res.status(404).render('error', { title: 'Not found', message });
}

async function getMaterial(id) {
  const matId = parseInt(id, 10);
  if (!matId) return null;

  const m = await prisma.material.findUnique({
    where: { id: matId },
    include: {
      uploader: { select: { id: true, name: true } },
      course: {
        include: { department: true },
      },
    },
  });
  if (!m) return null;

  return {
    id: m.id,
    course_id: m.courseId,
    uploader_id: m.uploaderId,
    title: m.title,
    type: m.type,
    exam: m.exam,
    term: m.term,
    description: m.description,
    stored_name: m.storedName,
    original_name: m.originalName,
    mime: m.mime,
    size: m.size,
    sha256: m.sha256,
    status: m.status,
    reject_reason: m.rejectReason,
    reviewed_by: m.reviewedBy,
    reviewed_at: m.reviewedAt ? m.reviewedAt.toISOString() : null,
    downloads: m.downloads,
    created_at: m.createdAt.toISOString(),
    uploader_name: m.uploader.name,
    course_code: m.course.code,
    course_title: m.course.title,
    dept_code: m.course.department.code,
    dept_name: m.course.department.name,
  };
}

function canSee(m, user) {
  if (!m) return false;
  if (m.status === 'approved') return true;
  return !!user && (user.id === m.uploader_id || isMod(user));
}

async function uploadFormData(extra = {}) {
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  const courses = await prisma.course.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, departmentId: true, code: true, title: true },
  });
  const formattedCourses = courses.map((c) => ({
    id: c.id,
    department_id: c.departmentId,
    code: c.code,
    title: c.title,
  }));
  return {
    title: 'Upload material',
    departments,
    courses: formattedCourses,
    TYPES,
    EXAMS,
    MAX_MB,
    errors: [],
    form: {},
    ...extra,
  };
}

router.get('/upload', requireLogin, async (req, res, next) => {
  try {
    const form = {};
    const cid = parseInt(req.query.course, 10);
    if (cid) {
      const c = await prisma.course.findUnique({ where: { id: cid } });
      if (c) {
        form.course_id = c.id;
        form.department_id = c.departmentId;
      }
    }
    if (!form.department_id && req.user.department_id) form.department_id = req.user.department_id;
    const data = await uploadFormData({ form });
    res.render('upload', data);
  } catch (err) {
    next(err);
  }
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
  async (req, res, next) => {
    try {
      const file = req.file;
      const fail = async (errors, form) => {
        const data = await uploadFormData({ errors, form });
        return res.status(400).render('upload', data);
      };

      if (!checkCsrf(req)) {
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

      let course = null;
      if (form.course_id) {
        course = await prisma.course.findUnique({ where: { id: form.course_id } });
        if (!course) errors.push('That course does not exist.');
      } else if (form.new_course_code || form.new_course_title) {
        const code = form.new_course_code.toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z0-9-]{2,12}$/.test(code)) errors.push('Course code must be 2-12 letters/numbers, e.g. CSE131.');
        if (form.new_course_title.length < 3 || form.new_course_title.length > 100) {
          errors.push('Course title must be 3-100 characters.');
        }
        if (
          !form.department_id ||
          !(await prisma.department.findUnique({ where: { id: form.department_id } }))
        ) {
          errors.push('Choose the department for the new course.');
        }
        if (!errors.length) {
          form.new_course_code = code;
          course = await prisma.course.findUnique({
            where: {
              departmentId_code: {
                departmentId: form.department_id,
                code,
              },
            },
          });
        }
      } else {
        errors.push('Choose a course, or add a new one.');
      }

      if (errors.length) return await fail(errors, form);

      const info = await inspectFile(file);
      if (!info.ok) {
        return await fail(['The file content does not match its extension, so it was rejected.'], form);
      }

      if (!course) {
        course = await prisma.course.create({
          data: {
            departmentId: form.department_id,
            code: form.new_course_code,
            title: form.new_course_title,
            createdBy: req.user.id,
          },
        });
      }

      const dup = await prisma.material.findFirst({
        where: {
          sha256: info.sha256,
          courseId: course.id,
          status: { not: 'rejected' },
        },
      });
      if (dup) {
        return res.status(409).render('error', {
          title: 'Already uploaded',
          message: 'This exact file is already in this course.',
          link: { href: '/m/' + dup.id, text: 'View the existing file' },
        });
      }

      // Upload buffer directly to Cloud Object Storage
      const storageRes = await uploadToStorage(info.storedName, file.buffer, info.mime);
      const storedIdentifier = (storageRes && storageRes.url) ? storageRes.url : info.storedName;

      const mod = isMod(req.user);
      const created = await prisma.material.create({
        data: {
          courseId: course.id,
          uploaderId: req.user.id,
          title: form.title,
          type: form.type,
          exam: form.type === 'question' ? form.exam || null : null,
          term: form.term || null,
          description: form.description || null,
          storedName: storedIdentifier,
          originalName: file.originalname.slice(0, 200),
          mime: info.mime,
          size: file.size,
          sha256: info.sha256,
          status: 'approved',
          reviewedBy: mod ? req.user.id : null,
          reviewedAt: new Date(),
        },
      });

      res.redirect('/m/' + created.id + '?new=1');
    } catch (err) {
      next(err);
    }
  }
);

router.get('/my', requireLogin, async (req, res, next) => {
  try {
    const materials = await prisma.material.findMany({
      where: { uploaderId: req.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { course: true },
    });

    const items = materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      status: m.status,
      reject_reason: m.rejectReason,
      downloads: m.downloads,
      created_at: m.createdAt.toISOString(),
      course_code: m.course.code,
      course_id: m.course.id,
    }));

    res.render('my', { title: 'My uploads', items, TYPES, justUploaded: req.query.uploaded === '1' });
  } catch (err) {
    next(err);
  }
});

router.get('/m/:id', async (req, res, next) => {
  try {
    const m = await getMaterial(req.params.id);
    if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');

    const reported = req.user
      ? await prisma.report.findUnique({
          where: {
            materialId_reporterId: {
              materialId: m.id,
              reporterId: req.user.id,
            },
          },
        })
      : null;

    const openReports = isMod(req.user)
      ? await prisma.report.count({ where: { materialId: m.id, resolved: 0 } })
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
  } catch (err) {
    next(err);
  }
});

router.get('/m/:id/download', async (req, res, next) => {
  try {
    const m = await getMaterial(req.params.id);
    if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');

    if (m.status === 'approved') {
      await prisma.material.update({
        where: { id: m.id },
        data: { downloads: { increment: 1 } },
      });
    }

    // Cloud Object Storage (S3 / Cloudinary) presigned download URL
    const cloudUrl = await getFileDownloadUrl(m.stored_name, m.original_name);
    if (cloudUrl) {
      return res.redirect(cloudUrl);
    }

    // Local file fallback for offline testing
    const localFile = getLocalFilePath(m.stored_name);
    if (!fs.existsSync(localFile)) return notFound(res, 'The file is missing from the server.');
    res.download(localFile, m.original_name);
  } catch (err) {
    next(err);
  }
});

router.get('/m/:id/view', async (req, res, next) => {
  try {
    const m = await getMaterial(req.params.id);
    if (!canSee(m, req.user)) return notFound(res, 'That material was not found.');
    if (!isInline(m.mime)) return res.redirect('/m/' + m.id + '/download');

    // Cloud Object Storage inline view URL
    const cloudUrl = await getFileViewUrl(m.stored_name, m.mime);
    if (cloudUrl) {
      return res.redirect(cloudUrl);
    }

    // Local file fallback
    const localFile = getLocalFilePath(m.stored_name);
    if (!fs.existsSync(localFile)) return notFound(res, 'The file is missing from the server.');
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(localFile);
  } catch (err) {
    next(err);
  }
});

router.post('/m/:id/report', requireLogin, async (req, res, next) => {
  try {
    const m = await getMaterial(req.params.id);
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
      await prisma.report.upsert({
        where: {
          materialId_reporterId: {
            materialId: m.id,
            reporterId: req.user.id,
          },
        },
        update: { reason, resolved: 0 },
        create: {
          materialId: m.id,
          reporterId: req.user.id,
          reason,
        },
      });
    }
    res.redirect('/m/' + m.id + '?reported=1');
  } catch (err) {
    next(err);
  }
});

router.post('/m/:id/delete', requireLogin, async (req, res, next) => {
  try {
    const m = await getMaterial(req.params.id);
    if (!m) return notFound(res);
    if (m.uploader_id !== req.user.id && !isMod(req.user)) {
      return res.status(403).render('error', { title: 'Forbidden', message: 'You cannot delete this.' });
    }
    await prisma.material.delete({ where: { id: m.id } });
    await removeStored(m.stored_name);
    res.redirect(m.uploader_id === req.user.id ? '/my' : '/c/' + m.course_id);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
