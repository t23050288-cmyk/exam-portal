# RECON REPORT: Comprehensive Technical Overview

## Part 1 — Backend Infrastructure & Database Schema

### 1. Backend Architecture (FastAPI)
The backend is built using **FastAPI** (Python), served as a serverless function on Vercel. It acts as a secure proxy between the frontend and Supabase, enforcing business logic and security policies that cannot be handled via Supabase RLS alone.

**Key Components:**
- **Router Pattern**: Each functional area has its own router file in `python_api/routers/`.
- **Dependency Injection**: Security checks (`verify_admin`, `get_current_student`) are injected into endpoints using FastAPI's `Depends`.
- **Database Client**: A centralized Supabase client in `python_api/db/supabase_client.py` uses the `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for administrative tasks.

---

### 2. Database Schema (Supabase / Postgres)
The system relies on four primary tables for state management and security.

- **`exam_status`**: Tracks the live state of a student's exam session (status, warnings, last_active).
- **`violations`**: Immutable log of all security events (tab switches, fullscreen exits).
- **`exam_results`**: Persistent record of completed assessments (score, total marks, status).
- **`pyhunt_progress`**: Specialized tracking for the gamified Python Treasure Hunt.

---

### 3. Administrative Security
Administrative endpoints are guarded by the `verify_admin` dependency, currently checking against a hardcoded secret.

> [!IMPORTANT]
> **Action Required**: The `ADMIN_SECRET` must be migrated to a Vercel environment variable before production rollout.

---

## Part 2 — Exam Logic & Question Engine

### 1. Dynamic Question Loading & Spectral Tags
The question engine uses a "spectral tagging" system to manage metadata within question text. Tags like `⟦EXAM:branch:category⟧` are parsed for filtering and stripped before rendering to ensure students only see the question content.

### 2. PyHunt Game State Machine
PyHunt is a 5-round gamified assessment (MCQs, Jumbles, Coding via Pyodide, and Turtle graphics). It uses a WebWorker-based Pyodide bridge for browser-side Python execution.

### 3. Real-Time Configuration Sync
Implements a hot-reload mechanism via Supabase Realtime. Administrators can update exam configs, and student sessions will update instantly without page refreshes.

---

## Part 3 — Security & Anti-Cheat System

### 1. The `AntiCheat.tsx` Sentinel
A global security component enforcing:
- **Mandatory Fullscreen**: Exiting triggers a 60-second auto-submit timer.
- **Navigation Blocking**: Prevents accidental back/refresh.
- **Input Lockdown**: Disables right-click, copy/paste, and DevTools shortcuts.

### 2. 3-Strike Termination Policy
Upon the 3rd violation, the server sets the status to `TERMINATED`, records a 0-score, and "poisons" the session, preventing any further exam access.

### 3. Machine Isolation
Migration from `localStorage` to `sessionStorage` ensures identity isolation in shared computer labs.

---

## Part 4 — Frontend Architecture & Session Management

### 1. Next.js 16 App Router
Utilizes the latest Next.js features for optimized routing and layout management.

### 2. API Client Logic
Centralized `apiFetch` in `lib/api.ts` handles JWT injection, environment detection, and automated error handling.

### 3. Modern Design System
A premium dark-mode aesthetic built with Vanilla CSS Modules and `framer-motion` for smooth transitions.

---
=== RECON COMPLETE ===
