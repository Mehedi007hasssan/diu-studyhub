# DIU StudyHub

A student-run site where Daffodil International University students share course materials:
lecture slides, notes, assignments and previous questions. Organised by **department → course → files**.

Created and owned by Mehedi Hassan Shuvo.

## Features

- Day / night mode (follows the device setting until the visitor picks one; the choice is remembered)
- Accounts (register / log in / log out), passwords hashed with bcrypt
- All departments; students can add a missing course while uploading
- Course pages with filters (slides, notes, previous questions…) and sorting
- Upload PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, PNG/JPG, ZIP (max 25 MB, checked by real file header, not just extension)
- Duplicate detection (the same file in the same course is refused)
- Download counter, PDF/image preview in the browser
- Search by course code, title, topic, term, filename; filter by department and type
- **Moderation**: student uploads wait in a queue; moderators approve or reject (with a reason). Anyone can report a file
- **Admin panel** (`/admin`): site numbers, people list with role changes, add departments and courses
- About page, upload guidelines, contact, terms of use, privacy policy, copyright and takedown pages
- Security basics: CSRF tokens, helmet headers, rate limits on login/upload, parameterised SQL, random stored filenames

## Run it

Requires Node.js 22.13 or newer (uses the built-in SQLite, so there is nothing to compile on Windows).

```bash
npm install
copy .env.example .env      # Mac/Linux: cp .env.example .env
npm start
```

Open http://localhost:3000

The SQLite database is created in `data/studyhub.db` and uploads go to `uploads/`.
Departments and sample courses are loaded from `data/seed.js` on the first run.
**The sample course codes are placeholders.** Edit `data/seed.js` before the first run (or delete `data/studyhub.db` and restart to re-seed). You can also add departments and courses later in the admin panel.

## Admin access

`.env.example` contains `ADMIN_EMAILS`. Anyone who signs up with an email listed there becomes an **admin** automatically.

1. Make sure your email is in `ADMIN_EMAILS` in `.env`.
2. Start the site and **sign up with that email** (do this before you share the site with anyone).
3. Open the account menu (your name, top right) → **Admin**.

Admins can also promote others to moderator or admin from the admin panel, or from the terminal:

```bash
npm run set-role -- friend@example.com moderator
```

Moderators see a **Moderation** link in the menu. Moderator and admin uploads are published immediately.

## Change the owner details, links and legal text

- Name, role, LinkedIn and Facebook links, and the "last updated" date: `lib/site.js`
- About page: `views/about.ejs`
- Terms, privacy, guidelines, contact, copyright: `views/pages/*.ejs`
- Colours and fonts: the top of `public/style.css`

The legal pages are plain-language templates that describe how this site works. Have them reviewed
(for example by a lawyer or your university) before a large public launch.

## Project layout

```
server.js            app setup (security, sessions, routes)
db.js                SQLite schema + first-run seed + ADMIN_EMAILS
data/seed.js         departments and sample courses (edit this)
lib/site.js          owner name, social links, legal date
lib/auth.js          login/role/CSRF helpers
lib/upload.js        multer config, file type whitelist, header check, hashing
routes/auth.js       register, login, logout
routes/browse.js     home, department, course, search
routes/materials.js  upload, view, download, report, delete, my uploads
routes/mod.js        moderation queue and reports
routes/admin.js      admin panel
routes/pages.js      About and information pages
views/               EJS templates (views/pages = legal and info text)
public/              CSS, theme switcher and small client script
scripts/set-role.js  promote users from the terminal
```

## Deploying

Any host that runs Node with a **persistent disk** works (a VPS, Railway, Render, Fly.io…).

1. Set environment variables: `NODE_ENV=production`, a long random `SESSION_SECRET`, and `ADMIN_EMAILS`.
   Optionally set `ALLOWED_EMAIL_DOMAINS` to limit sign-ups to university emails.
2. Point `DB_PATH` and `UPLOAD_DIR` at the persistent disk so data survives redeploys.
3. Put it behind HTTPS (Nginx/Caddy or the host's built-in TLS).
4. **Sign up with your admin email immediately after the first deploy**, before sharing the link.
5. Back up the database file and the uploads folder regularly.

## Important notes

- **Email is not verified yet.** `ADMIN_EMAILS` and `ALLOWED_EMAIL_DOMAINS` only compare the text of the address. Add email verification before relying on either. Until then, register your admin account first.
- **Uploads are not virus-scanned.** Moderation helps, but for a public launch consider ClamAV.
- **Copyright.** Previous questions and student notes are fine to share; full commercial textbooks are not. The upload page warns about this, and moderators should reject them.
- Headings use the Sora font from Google Fonts; if it cannot load, the site falls back to a system font.
- Sessions use a signed cookie, so there is no session table to manage.

## Ideas for next steps

- Email verification, password reset and a "change password" page
- Upvotes / "helpful" ratings and comments
- Teacher name and semester filters
- Deleting users, departments and courses from the admin panel
- Auto-approve trusted uploaders (e.g. after 5 approved uploads)
- Move files to object storage (S3 / Cloudflare R2) when the library grows
- Swap SQLite for PostgreSQL if you expect heavy traffic
