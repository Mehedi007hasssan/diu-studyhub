const express = require('express');
const prisma = require('../db');
const { TYPES } = require('../lib/constants');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        courses: {
          select: {
            id: true,
            _count: {
              select: {
                materials: { where: { status: 'approved' } },
              },
            },
          },
        },
      },
    });

    const deptList = departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      courses: d.courses.length,
      materials: d.courses.reduce((acc, c) => acc + c._count.materials, 0),
    }));

    const recent = await prisma.material.findMany({
      where: { status: 'approved' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: {
        course: {
          include: { department: true },
        },
      },
    });

    const recentList = recent.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      created_at: m.createdAt.toISOString(),
      course_code: m.course.code,
      course_id: m.course.id,
      dept_code: m.course.department.code,
    }));

    const [materialsCount, coursesCount, studentsCount, downloadsSum] = await Promise.all([
      prisma.material.count({ where: { status: 'approved' } }),
      prisma.course.count(),
      prisma.user.count(),
      prisma.material.aggregate({ _sum: { downloads: true } }),
    ]);

    const stats = {
      materials: materialsCount,
      courses: coursesCount,
      students: studentsCount,
      downloads: downloadsSum._sum.downloads || 0,
    };

    res.render('home', { title: 'DIU StudyHub', departments: deptList, recent: recentList, stats, TYPES });
  } catch (err) {
    next(err);
  }
});

router.get('/d/:code', async (req, res, next) => {
  try {
    const dept = await prisma.department.findFirst({
      where: { code: { equals: req.params.code, mode: 'insensitive' } },
    });
    if (!dept) return res.status(404).render('error', { title: 'Not found', message: 'Department not found.' });

    const q = (req.query.q || '').trim().slice(0, 60);
    const where = { departmentId: dept.id };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: {
            materials: { where: { status: 'approved' } },
          },
        },
      },
    });

    const courseList = courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      materials: c._count.materials,
    }));

    res.render('department', { title: dept.name, dept, courses: courseList, q });
  } catch (err) {
    next(err);
  }
});

router.get('/c/:id', async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!courseId) return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { department: true },
    });
    if (!course) return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });

    const type = TYPES[req.query.type] ? req.query.type : '';
    const sort = req.query.sort === 'popular' ? 'popular' : 'new';

    const where = { courseId: course.id, status: 'approved' };
    if (type) where.type = type;

    const materials = await prisma.material.findMany({
      where,
      orderBy:
        sort === 'popular'
          ? [{ downloads: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { uploader: { select: { name: true } } },
    });

    const materialsList = materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      exam: m.exam,
      term: m.term,
      size: m.size,
      downloads: m.downloads,
      created_at: m.createdAt.toISOString(),
      uploader: m.uploader.name,
    }));

    const groupCounts = await prisma.material.groupBy({
      by: ['type'],
      where: { courseId: course.id, status: 'approved' },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(groupCounts.map((g) => [g.type, g._count._all]));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const formattedCourse = {
      id: course.id,
      code: course.code,
      title: course.title,
      dept_code: course.department.code,
      dept_name: course.department.name,
    };

    res.render('course', {
      title: course.code + ' - ' + course.title,
      course: formattedCourse,
      materials: materialsList,
      TYPES,
      type,
      sort,
      counts,
      total,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 100);
    const deptId = parseInt(req.query.dept, 10) || null;
    const type = TYPES[req.query.type] ? req.query.type : '';
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });

    let materials = [];
    let courses = [];
    const searched = q.length > 0 || deptId || type;

    if (searched) {
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);

      const matWhere = { status: 'approved' };
      if (type) matWhere.type = type;
      if (deptId) matWhere.course = { departmentId: deptId };

      if (terms.length) {
        matWhere.AND = terms.map((t) => ({
          OR: [
            { title: { contains: t, mode: 'insensitive' } },
            { description: { contains: t, mode: 'insensitive' } },
            { term: { contains: t, mode: 'insensitive' } },
            { originalName: { contains: t, mode: 'insensitive' } },
            { course: { code: { contains: t, mode: 'insensitive' } } },
            { course: { title: { contains: t, mode: 'insensitive' } } },
          ],
        }));
      }

      const matResults = await prisma.material.findMany({
        where: matWhere,
        orderBy: [{ downloads: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        include: {
          course: {
            include: { department: true },
          },
        },
      });

      materials = matResults.map((m) => ({
        id: m.id,
        title: m.title,
        type: m.type,
        exam: m.exam,
        term: m.term,
        downloads: m.downloads,
        created_at: m.createdAt.toISOString(),
        course_id: m.course.id,
        course_code: m.course.code,
        course_title: m.course.title,
        dept_code: m.course.department.code,
      }));

      if (terms.length) {
        const courseWhere = {};
        if (deptId) courseWhere.departmentId = deptId;
        courseWhere.AND = terms.map((t) => ({
          OR: [
            { code: { contains: t, mode: 'insensitive' } },
            { title: { contains: t, mode: 'insensitive' } },
          ],
        }));

        const courseResults = await prisma.course.findMany({
          where: courseWhere,
          orderBy: { code: 'asc' },
          take: 12,
          include: { department: true },
        });

        courses = courseResults.map((c) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          dept_code: c.department.code,
        }));
      }
    }

    res.render('search', {
      title: q ? 'Search: ' + q : 'Search',
      q,
      deptId,
      type,
      departments,
      materials,
      courses,
      TYPES,
      searched,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
