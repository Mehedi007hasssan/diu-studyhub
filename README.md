# DIU StudyHub 🎓

[![Live Demo](https://img.shields.io/badge/Live_Demo-diu--studyhub.vercel.app-0070f3?style=for-the-badge&logo=vercel&logoColor=white)](https://diu-studyhub.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.x-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Serverless-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)

> **DIU StudyHub** is a student-centric educational resource-sharing platform designed and developed for **Daffodil International University (DIU)** students. It empowers students to discover, preview, and share course materials—including lecture slides, handwritten notes, previous exam questions, and lab assignments—organized seamlessly by **Department → Course → Materials**.

Developed and maintained by **[Mehedi Hassan Shuvo](https://github.com/Mehedi007hasssan)**.

---

## 🌟 Live Demo

Visit the production site: **[https://diu-studyhub.vercel.app](https://diu-studyhub.vercel.app)**

---

## 🚀 Key Features

- **Department & Course Catalog**: Full coverage of DIU departments (CSE, SWE, EEE, BBA, Civil, English, etc.) with course code indexing. Students can add missing courses on-the-fly during upload.
- **Categorized Resource Sharing**: Filter materials by type (Lecture Slides, Notes, Past Questions, Lab Tasks, Handouts, Textbooks) and sort by newest or most downloaded.
- **In-Browser Preview & Streaming**: Inline PDF and image previewing without forced external downloads.
- **File Upload Security & Validation**:
  - Validates real **file magic bytes** (header bytes) to ensure file integrity and prevent malicious script execution.
  - Computes cryptographic **SHA-256 hashes** to prevent accidental duplicates in the same course.
  - Multi-format support: PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, PNG/JPG, ZIP (up to 25 MB).
- **Cloud Object Storage (Vercel Blob / S3 / Cloudinary)**: All uploads stream directly to cloud object storage, bypassing serverless filesystem limitations.
- **Day / Night Mode**: Intelligent theme switcher matching system preferences with instant manual toggle remembered across sessions.
- **Student Authentication & Moderation Pipeline**:
  - Secure account registration & login with password hashing via `bcryptjs`.
  - Moderation queue (`/mod`) and real-time community report system for quality assurance.
  - Admin management panel (`/admin`) for site metrics, course management, and role promotion.
  - Password change interface (`/change-password`) available both in the UI and via CLI utility.

---

## 🛡️ Security Architecture

- **Stateless HMAC Sessions**: Built using signed, encrypted cookies (`cookie-session`) optimized for serverless edge scaling.
- **CSRF Protection**: Timing-safe double submit cookie verification preventing cross-site request forgery attacks.
- **Content Security Policy (CSP)**: Hardened headers with `helmet` allowing only verified font and media CDNs.
- **Distributed Rate Limiting**: Powered by Upstash Redis and sliding-window rate limiters to mitigate brute-force and spam requests.
- **Isolated Credentials**: Sensitive tokens, database URLs, and session secrets are managed strictly through environment variables and excluded from version control (`.gitignore`).

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Runtime** | Node.js (v20+) |
| **Web Framework** | Express.js 5 |
| **Serverless Engine** | Vercel Serverless Functions (`@vercel/node`) |
| **Database** | PostgreSQL (Neon Serverless in production) / SQLite (local dev preview) |
| **ORM & Migrations** | Prisma ORM 6 |
| **Cloud Storage** | Vercel Blob Storage, AWS S3 / Cloudflare R2, Cloudinary |
| **Frontend Templates** | EJS (Embedded JavaScript) with semantic, responsive CSS |
| **Security & Auth** | Helmet, Cookie-Session, Bcrypt.js, Timing-safe CSRF |

---

## 💻 Local Development Setup

### 1. Clone the repository
```bash
git clone https://github.com/Mehedi007hasssan/diu-studyhub.git
cd diu-studyhub
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables
Copy the template configuration:
```bash
copy .env.example .env      # On Linux/macOS: cp .env.example .env
```

### 4. Zero-Setup Local Preview (SQLite mode)
To preview the app locally without needing to install or configure PostgreSQL:
```bash
# Push the local SQLite schema and seed DIU departments & admin
npm run db:push:local
npm run db:seed

# Start the local development server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 5. Production Database Setup (Neon PostgreSQL)
Whenever you want to test against PostgreSQL:
1. Provide your PostgreSQL URI in `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
   ```
2. Push the schema and seed data:
   ```bash
   npm run db:push
   npm run db:seed
   ```

---

## 🚢 Deployment on Vercel

1. Push this repository to your GitHub account:
   ```bash
   git remote add origin https://github.com/Mehedi007hasssan/diu-studyhub.git
   git branch -M master
   git push -u origin master
   ```
2. Import the project in the [Vercel Dashboard](https://vercel.com).
3. Connect **Neon Serverless Postgres** and **Vercel Blob** from the **Storage** tab.
4. Set the following environment variables:
   - `DATABASE_URL` (Automatically set by Neon integration)
   - `SESSION_SECRET` (A 32+ character random secret)
   - `ADMIN_EMAILS` (e.g. `mehedishuvo644@gmail.com`)
5. Click **Deploy**.

---

## 👨‍💻 Author & Acknowledgements

Created with ❤️ for the Daffodil International University student community by:

**Mehedi Hassan Shuvo**  
- **GitHub**: [@Mehedi007hasssan](https://github.com/Mehedi007hasssan)  
- **Contact**: `mehedishuvo644@gmail.com`  

---

## 📄 License & Disclaimer

This project is a student-run educational resource sharing platform. All course materials shared on this platform are owned by their respective authors, faculty members, and Daffodil International University.
