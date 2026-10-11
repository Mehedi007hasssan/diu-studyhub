const app = require('./app');

const port = process.env.PORT || 3000;

if (require.main === module || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`DIU StudyHub running at http://localhost:${port}`);
  });
}

module.exports = app;
