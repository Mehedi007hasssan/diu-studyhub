const express = require('express');

const router = express.Router();

// Information pages. The body of each lives in views/pages/<slug>.ejs and is wrapped by views/page.ejs.
const PAGES = [
  { slug: 'guidelines', title: 'Upload guidelines' },
  { slug: 'contact', title: 'Contact' },
  { slug: 'terms', title: 'Terms of use' },
  { slug: 'privacy', title: 'Privacy policy' },
  { slug: 'copyright', title: 'Copyright and takedown' },
];

router.get('/about', (req, res) => {
  res.render('about', { title: 'About' });
});

for (const p of PAGES) {
  router.get('/' + p.slug, (req, res) => {
    res.render('page', { title: p.title, slug: p.slug, PAGES });
  });
}

module.exports = router;
