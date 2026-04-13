# ExamGuard — Deployment Guide

Follow these steps to deploy the system to **Railway** (Backend) and **Vercel** (Frontend).

---

## 1. Supabase Setup (Database)

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** → **New Query**.
3. Copy contents of `supabase/schema.sql` and run it.
4. Run `supabase/seed.sql` to load standard questions and sample students.
5. Go to **Project Settings** → **API** and copy:
   - `Project URL`
   - `Anon Key` (Public)
   - `Service Role Key` (Private - DO NOT SHARE)

---

## 2. Backend Deployment (Railway)

1. Create a [Railway](https://railway.app) account.
2. Click **New Project** → **Deploy from GitHub repo** (or use Railway CLI).
3. Select the `backend/` directory.
4. Add the following **Environment Variables** in Railway:
   - `SUPABASE_URL`: (Your Supabase URL)
   - `SUPABASE_SERVICE_KEY`: (Your Service Role Key)
   - `JWT_SECRET`: (A long random string)
   - `ALLOWED_ORIGINS`: `https://your-vercel-app.vercel.app` (Add localhost for testing)
5. Railway will automatically detect the `requirements.txt` and `main.py`.
6. Use the following start command if prompted: `uvicorn main:app --host 0.0.0.0 --port $PORT`

---

## 3. Frontend Deployment (Vercel)

1. Create a [Vercel](https://vercel.com) account.
2. Click **Add New** → **Project** → **Import from GitHub**.
3. Select the `frontend/` directory.
4. Add the following **Environment Variables** in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`: (Your Supabase URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Your Anon Key)
   - `NEXT_PUBLIC_API_URL`: `https://your-backend-url.railway.app`
   - `ADMIN_PASSWORD`: (Choose a secure password for the admin dashboard)
5. Click **Deploy**.

---

## 4. Production Load Testing

To verify the system can handle **266 concurrent students**:

1. Install Locust: `pip install locust`
2. Run the provided load test script (to be created in `tests/load_test.py`).
3. Point it to your Railway production URL.
4. Monitor Railway's CPU/RAM and Supabase's connection count.

---

## 5. Summary of URLs

- **API Docs:** `https://your-backend.railway.app/docs`
- **Student Exam:** `https://your-app.vercel.app/login`
- **Admin Dashboard:** `https://your-app.vercel.app/admin`
