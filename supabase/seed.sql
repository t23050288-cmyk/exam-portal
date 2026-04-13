-- ============================================================
-- ExamGuard — Seed Data
-- Run AFTER schema.sql in Supabase Dashboard → SQL Editor
-- ============================================================
-- All student passwords: exam123
-- Password hash generated with bcrypt (cost factor 12)
-- ============================================================

-- ============================================================
-- SAMPLE QUESTIONS (20 MCQ — General Science & Aptitude)
-- ============================================================
INSERT INTO questions (text, options, correct_answer, marks, order_index) VALUES
('Which planet is known as the Red Planet?',
 '["A) Venus", "B) Mars", "C) Jupiter", "D) Saturn"]', 'B', 1, 1),

('What is the chemical symbol for Gold?',
 '["A) Gd", "B) Go", "C) Au", "D) Ag"]', 'C', 1, 2),

('What is the speed of light in a vacuum (approximately)?',
 '["A) 3 × 10^6 m/s", "B) 3 × 10^8 m/s", "C) 3 × 10^10 m/s", "D) 3 × 10^4 m/s"]', 'B', 1, 3),

('Which gas is most abundant in Earth''s atmosphere?',
 '["A) Oxygen", "B) Carbon Dioxide", "C) Hydrogen", "D) Nitrogen"]', 'D', 1, 4),

('What is the powerhouse of the cell?',
 '["A) Nucleus", "B) Ribosome", "C) Mitochondria", "D) Golgi Apparatus"]', 'C', 1, 5),

('What is 2^10?',
 '["A) 512", "B) 1024", "C) 2048", "D) 256"]', 'B', 1, 6),

('Which is the largest ocean on Earth?',
 '["A) Atlantic Ocean", "B) Indian Ocean", "C) Arctic Ocean", "D) Pacific Ocean"]', 'D', 1, 7),

('What does CPU stand for?',
 '["A) Central Processing Unit", "B) Core Processing Unit", "C) Central Program Utility", "D) Computer Processing Unit"]', 'A', 1, 8),

('Which element has the atomic number 1?',
 '["A) Helium", "B) Carbon", "C) Hydrogen", "D) Oxygen"]', 'C', 1, 9),

('What is the SI unit of electric current?',
 '["A) Volt", "B) Watt", "C) Ohm", "D) Ampere"]', 'D', 1, 10),

('What is the square root of 144?',
 '["A) 11", "B) 12", "C) 13", "D) 14"]', 'B', 1, 11),

('Which programming language is known as the "language of the web"?',
 '["A) Python", "B) Java", "C) JavaScript", "D) C++"]', 'C', 1, 12),

('What is Newton''s Second Law of Motion?',
 '["A) F = mv", "B) F = ma", "C) F = m/a", "D) F = v/t"]', 'B', 1, 13),

('Which continent is known as the "Dark Continent"?',
 '["A) Asia", "B) South America", "C) Australia", "D) Africa"]', 'D', 1, 14),

('What is the boiling point of water at standard atmospheric pressure?',
 '["A) 90°C", "B) 95°C", "C) 100°C", "D) 105°C"]', 'C', 1, 15),

('How many bits are in a byte?',
 '["A) 4", "B) 6", "C) 8", "D) 16"]', 'C', 1, 16),

('Which organ produces insulin in the human body?',
 '["A) Liver", "B) Kidney", "C) Pancreas", "D) Heart"]', 'C', 1, 17),

('What is the capital of France?',
 '["A) Berlin", "B) Madrid", "C) Rome", "D) Paris"]', 'D', 1, 18),

('What does RAM stand for?',
 '["A) Read Access Memory", "B) Random Access Memory", "C) Rapid Access Module", "D) Read And Memory"]', 'B', 1, 19),

('Which is the smallest prime number?',
 '["A) 0", "B) 1", "C) 2", "D) 3"]', 'C', 1, 20);

-- ============================================================
-- SAMPLE STUDENTS (10 for testing — see note below for 266)
-- ============================================================
-- Password for all: exam123
-- bcrypt hash of "exam123" with 12 rounds:
-- $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O (approximate — regenerate in your backend)
-- For actual deployment, generate hashes via: python -c "from passlib.hash import bcrypt; print(bcrypt.hash('exam123'))"

INSERT INTO students (roll_number, name, password_hash) VALUES
('EX001', 'Aarav Shah', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX002', 'Priya Patel', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX003', 'Rohan Verma', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX004', 'Sneha Gupta', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX005', 'Arjun Mehta', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX006', 'Kavya Sharma', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX007', 'Dev Joshi', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX008', 'Ananya Singh', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX009', 'Vikram Nair', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O'),
('EX010', 'Meera Reddy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2RPiGdPy4O');

-- ============================================================
-- INITIALIZE exam_status for seeded students
-- ============================================================
INSERT INTO exam_status (student_id, status, warnings)
SELECT id, 'not_started', 0 FROM students;

-- ============================================================
-- NOTE: Generate 266 students via the Python script below
-- Run: python supabase/generate_students.py | psql <connection_string>
-- Or run the SQL output in Supabase Dashboard SQL Editor
-- ============================================================
