# Database Setup & Credentials Guide

This guide provides step-by-step instructions to configure your PostgreSQL database connection for the **Amrutam Telemedicine Backend**.

Currently, the project uses dummy local credentials in `.env.example`:
```env
DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_db?schema=public"
```

You can use either **Option A (Free Cloud PostgreSQL)** or **Option B (Local Docker Desktop)**.

---

## Option A: Free Cloud PostgreSQL (Recommended & Instant)

If you do not want to run Docker locally, you can create a free cloud PostgreSQL database in under 2 minutes using **Neon** or **Supabase**.

### Method 1: Using Neon Serverless PostgreSQL (Fastest & Simplest)

1. **Visit Neon**: Go to [https://console.neon.tech/signup](https://console.neon.tech/signup) and create a free account (Sign up with GitHub or Google).
2. **Create Project**: Click **"New Project"**, name it `amrutam-telemedicine`, select your preferred cloud region, and click **"Create Project"**.
3. **Copy Connection String**:
   - On the project dashboard, locate the **Connection Details** box.
   - Select **Prisma** or **Pooled / Direct connection**.
   - Your connection string will look like:
     ```text
     postgresql://alex:AbCdEfGh1234@ep-cool-cloud-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
4. **Update `.env`**:
   - Open `.env` in the root of the project:
     ```env
     DATABASE_URL="postgresql://alex:AbCdEfGh1234@ep-cool-cloud-123456.us-east-2.aws.neon.tech/neondb?sslmode=require&schema=public"
     ```
5. **Run Migrations & Seed**:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```

---

### Method 2: Using Supabase

1. **Visit Supabase**: Go to [https://supabase.com](https://supabase.com) and click **"Start your project"**.
2. **Create Organization & Project**:
   - Name: `amrutam-telemedicine`
   - Set a secure database password (save this password!).
   - Choose a region closest to you.
3. **Copy Connection URI**:
   - Go to **Project Settings** (gear icon) -> **Database**.
   - Under **Connection String**, choose **URI**.
   - Replace `[YOUR-PASSWORD]` with the password you chose in step 2.
   - Example:
     ```text
     postgresql://postgres.xxxxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require
     ```
4. **Update `.env`**:
   - Set `DATABASE_URL="postgresql://postgres.xxxxxx:YOUR_REAL_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&schema=public"`
5. **Run Migrations & Seed**:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```

---

### Method 3: Using Render PostgreSQL

1. **Visit Render**: Go to [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. **New PostgreSQL**: Click **"New +"** -> **"PostgreSQL"**.
3. **Settings**:
   - Name: `amrutam-db`
   - Database: `amrutam_telemedicine`
   - User: `amrutam_admin`
   - Plan: **Free**
4. **Copy External Database URL**:
   - Under **Connections**, copy the **"External Database URL"**.
5. **Paste into `.env`**:
   ```env
   DATABASE_URL="postgresql://amrutam_admin:password@dpg-xxxxx.singapore-postgres.render.com/amrutam_telemedicine?sslmode=require&schema=public"
   ```

---

## Option B: Local Docker Desktop

If you prefer to run PostgreSQL inside a local container on your machine:

1. **Start Docker Desktop**:
   - Search for **"Docker Desktop"** in the Windows Start menu and launch it.
   - Wait until the Docker icon in your system tray turns steady (Docker Engine Running).
2. **Start the PostgreSQL and Redis containers**:
   ```bash
   docker compose up -d postgres redis
   ```
3. **Verify Containers**:
   ```bash
   docker ps
   ```
4. **Use Default Local Credentials in `.env`**:
   ```env
   DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_db?schema=public"
   TEST_DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_test_db?schema=public"
   REDIS_URL="redis://127.0.0.1:6379"
   ```
5. **Apply Migrations and Seed**:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```

---

## Verifying Database Connection

Once your `.env` contains your connection string:

1. **Test Schema Validation**:
   ```bash
   npm run db:validate
   ```
2. **Apply Initial Migration**:
   ```bash
   npm run db:deploy
   ```
3. **Seed Safe Development Data**:
   ```bash
   npm run db:seed
   ```
4. **Run Live Database Integration Tests**:
   ```bash
   npm run test:integration
   ```
5. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5000/health/ready` in your browser. It will return:
   ```json
   {
     "status": "ready",
     "timestamp": "2026-10-20T...",
     "services": {
       "database": { "status": "up", "latencyMs": 12 },
       "redis": { "status": "up", "latencyMs": 1 }
     }
   }
   ```
