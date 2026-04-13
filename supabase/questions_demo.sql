-- ============================================================
-- questions_demo.sql
-- 60 Demo Questions (10 per branch)
-- Starting Order Index: 100
-- ============================================================

INSERT INTO questions (text, options, correct_answer, branch, marks, order_index) VALUES
-- ── COMPUTER SCIENCE (CS) ───────────────────────────────────
('Which data structure uses the LIFO (Last-In-First-Out) principle?', 
 '["A) Queue", "B) Linked List", "C) Stack", "D) Hash Table"]', 'C', 'CS', 1, 100),

('What is the time complexity of a binary search on a sorted array?', 
 '["A) O(n)", "B) O(log n)", "C) O(n log n)", "D) O(1)"]', 'B', 'CS', 1, 101),

('In an operating system, what is "thrashing"?', 
 '["A) Excessive CPU usage", "B) Excessive paging", "C) Multiple processes running", "D) High disk space usage"]', 'B', 'CS', 1, 102),

('Which layer of the OSI model is responsible for IP addressing?', 
 '["A) Transport Layer", "B) Data Link Layer", "C) Network Layer", "D) Physical Layer"]', 'C', 'CS', 1, 103),

('Which SQL command is used to remove all records from a table without deleting the table structure?', 
 '["A) DROP", "B) TRUNCATE", "C) DELETE", "D) REMOVE"]', 'B', 'CS', 1, 104),

('What does "ACID" stand for in database management?', 
 '["A) Atomicity, Consistency, Isolation, Durability", "B) Access, Control, Input, Data", "C) Authentication, Coding, Integrity, Depth", "D) Algorithm, Computation, index, Database"]', 'A', 'CS', 1, 105),

('Which protocol is used to send emails?', 
 '["A) HTTP", "B) FTP", "C) SMTP", "D) SNMP"]', 'C', 'CS', 1, 106),

('In Java, which keyword is used to prevent a class from being inherited?', 
 '["A) static", "B) final", "C) private", "D) abstract"]', 'B', 'CS', 1, 107),

('Which of these is NOT a semaphore operation?', 
 '["A) wait()", "B) signal()", "C) P()", "D) check()"]', 'D', 'CS', 1, 108),

('What is the purpose of a Load Balancer?', 
 '["A) To store data", "B) To distribute network traffic across multiple servers", "C) To encrypt data", "D) To compile code"]', 'B', 'CS', 1, 109),

-- ── ELECTRONICS & COMMUNICATION (EC) ────────────────────────
('Which component is known as the "brain" of a digital circuit?', 
 '["A) Resistor", "B) Capacitor", "C) Microprocessor", "D) Inductor"]', 'C', 'EC', 1, 110),

('What is the base of the hexadecimal number system?', 
 '["A) 2", "B) 8", "C) 10", "D) 16"]', 'D', 'EC', 1, 111),

('Which diode is used as a voltage regulator?', 
 '["A) LED", "B) Varactor Diode", "C) Zener Diode", "D) Photodiode"]', 'C', 'EC', 1, 112),

('A BJT (Bipolar Junction Transistor) has how many terminals?', 
 '["A) 2", "B) 3", "C) 4", "D) 5"]', 'B', 'EC', 1, 113),

('Which logic gate produces a HIGH output only when both inputs are LOW?', 
 '["A) AND", "B) OR", "C) NOR", "D) NAND"]', 'C', 'EC', 1, 114),

('What is the unit of capacitance?', 
 '["A) Henry", "B) Tesla", "C) Farad", "D) Pascal"]', 'C', 'EC', 1, 115),

('In modulation, if the amplitude of the carrier wave is varied, it is called:', 
 '["A) Frequency Modulation", "B) Amplitude Modulation", "C) Phase Modulation", "D) Pulse Modulation"]', 'B', 'EC', 1, 116),

('Which theorem states that a linear circuit with multiple sources can be analyzed by considering one source at a time?', 
 '["A) Thevenin Theorem", "B) Superposition Theorem", "C) KVL", "D) Norton Theorem"]', 'B', 'EC', 1, 117),

('The sampling theorem is also known as:', 
 '["A) Fourier Theorem", "B) Nyquist Theorem", "C) Ohm''s Law", "D) Pascal''s Law"]', 'B', 'EC', 1, 118),

('What does "VLSI" stand for?', 
 '["A) Very Low Scale Integration", "B) Very Local System Interface", "C) Very Large Scale Integration", "D) Virtual Layer System Integration"]', 'C', 'EC', 1, 119),

-- ── MECHANICAL ENGINEERING (ME) ─────────────────────────────
('Which law of thermodynamics defines the concept of entropy?', 
 '["A) Zeroth Law", "B) First Law", "C) Second Law", "D) Third Law"]', 'C', 'ME', 1, 120),

('What is the ratio of lateral strain to longitudinal strain called?', 
 '["A) Young''s Modulus", "B) Poisson''s Ratio", "C) Bulk Modulus", "D) Shear Modulus"]', 'B', 'ME', 1, 121),

('In an IC engine, which stroke follows the compression stroke?', 
 '["A) Suction", "B) Power/Expansion", "C) Exhaust", "D) Injection"]', 'B', 'ME', 1, 122),

('Which cycle is considered the most efficient for a heat engine?', 
 '["A) Otto Cycle", "B) Diesel Cycle", "C) Carnot Cycle", "D) Brayton Cycle"]', 'C', 'ME', 1, 123),

('What is the main constituent of Stainless Steel besides iron?', 
 '["A) Copper", "B) Aluminum", "C) Chromium", "D) Zinc"]', 'C', 'ME', 1, 124),

('The point on a stress-strain curve where plastic deformation begins is the:', 
 '["A) Breaking point", "B) Elastic limit", "C) Yield point", "D) Proportional limit"]', 'C', 'ME', 1, 125),

('Bernoulli''s equation is based on the conservation of:', 
 '["A) Mass", "B) Momentum", "C) Energy", "D) Angular Momentum"]', 'C', 'ME', 1, 126),

('In machining, what does "CNC" stand for?', 
 '["A) Computer Numerical Control", "B) Central Network Control", "C) Calculated Node Connection", "D) Computerized Next Circuit"]', 'A', 'ME', 1, 127),

('Which mechanism is used to convert rotary motion into linear motion?', 
 '["A) Gear", "B) Belt and Pulley", "C) Cam and Follower", "D) Clutch"]', 'C', 'ME', 1, 128),

('The property of a material to resist indentation is called:', 
 '["A) Ductility", "B) Brittleness", "C) Hardness", "D) Malleability"]', 'C', 'ME', 1, 129),

-- ── CIVIL ENGINEERING (CV) ──────────────────────────────────
('Which type of cement is used in underwater structures?', 
 '["A) Portland Cement", "B) White Cement", "C) Quick Setting Cement", "D) Low Heat Cement"]', 'C', 'CV', 1, 130),

('In surveying, what is measured using an Abney level?', 
 '["A) Horizontal angles", "B) Vertical angles and slopes", "C) Distances", "D) Deep water levels"]', 'B', 'CV', 1, 131),

('What is the standard size of a modular brick?', 
 '["A) 19x9x9 cm", "B) 20x10x10 cm", "C) 15x15x15 cm", "D) 25x12x12 cm"]', 'A', 'CV', 1, 132),

('Which member of a truss is subjected only to axial loads?', 
 '["A) Beam", "B) Column", "C) Tie/Strut", "D) Slab"]', 'C', 'CV', 1, 133),

('The maximum bending moment in a cantilever beam of length L with a point load W at the free end is:', 
 '["A) WL", "B) WL/2", "C) WL/4", "D) WL^2"]', 'A', 'CV', 1, 134),

('Which soil classification system is most commonly used by civil engineers?', 
 '["A) ASTM", "B) USCS", "C) USDA", "D) AASHTO"]', 'B', 'CV', 1, 135),

('What is the pH level of water suitable for drinking purpose?', 
 '["A) 4-5", "B) 6.5-8.5", "C) 9-10", "D) 2-3"]', 'B', 'CV', 1, 136),

('The process of maintaining moisture in concrete for a specific period is called:', 
 '["A) Mixing", "B) Compacting", "C) Curing", "D) Finishing"]', 'C', 'CV', 1, 137),

('In GPS, how many satellites are minimum required for a 3D position fix?', 
 '["A) 1", "B) 2", "C) 3", "D) 4"]', 'D', 'CV', 1, 138),

('What is the tensile strength of concrete approximately compared to its compressive strength?', 
 '["A) 50%", "B) 10%", "C) 90%", "D) 0%"]', 'B', 'CV', 1, 139),

-- ── ARTIFICIAL INTELLIGENCE (AI) ────────────────────────────
('Which of these is a supervised learning algorithm?', 
 '["A) K-Means Clustering", "B) Linear Regression", "C) PCA", "D) Autoencoders"]', 'B', 'AI', 1, 140),

('What is the activation function typically used in the hidden layer of a Neural Network?', 
 '["A) Step", "B) Linear", "C) ReLU", "D) Identity"]', 'C', 'AI', 1, 141),

('In AI, what does "NLP" stand for?', 
 '["A) Neural Layer Processing", "B) Natural Language Processing", "C) Node Linear Path", "D) Network Logic Protocol"]', 'B', 'AI', 1, 142),

('Which programming language is most widely used for AI and Machine Learning?', 
 '["A) C++", "B) Python", "C) PHP", "D) Ruby"]', 'B', 'AI', 1, 143),

('What is the name of the Turing Test equivalent for images?', 
 '["A) Visual Turing Test", "B) CAPTCHA", "C) Image Recognition Test", "D) SIFT Test"]', 'B', 'AI', 1, 144),

('Which company developed the AlphaGo program?', 
 '["A) OpenAI", "B) Google DeepMind", "C) Meta", "D) IBM"]', 'B', 'AI', 1, 145),

('A "Heuristic" is often described as:', 
 '["A) An exact algorithm", "B) A rule of thumb", "C) A type of hardware", "D) A database table"]', 'B', 'AI', 1, 146),

('Which optimization algorithm is standard for training Deep Learning models?', 
 '["A) Bubble Sort", "B) Gradient Descent", "C) Binary Search", "D) Dijkstra''s"]', 'B', 'AI', 1, 147),

('What is a "Perceptron"?', 
 '["A) A type of database", "B) A single layer neural network", "C) A data storage device", "D) A cooling system for AI servers"]', 'B', 'AI', 1, 148),

('In probability, what is the value of P(A | B)?', 
 '["A) P(A ∩ B) / P(B)", "B) P(A) + P(B)", "C) P(A) * P(B)", "D) P(B) / P(A)"]', 'A', 'AI', 1, 149),

-- ── INFORMATION SCIENCE (IS) ────────────────────────────────
('Which SDLC model follows a sequential flow?', 
 '["A) Agile", "B) Waterfall", "C) Spiral", "D) Scrum"]', 'B', 'IS', 1, 150),

('What is "Cloud Computing" primarily about?', 
 '["A) Weather forecasting", "B) On-demand delivery of IT resources over the internet", "C) Storing data in physical hard drives", "D) Installing software locally"]', 'B', 'IS', 1, 151),

('Which of these is a NoSQL database?', 
 '["A) MySQL", "B) PostgreSQL", "C) MongoDB", "D) Oracle"]', 'C', 'IS', 1, 152),

('What does "HTTP" stand for?', 
 '["A) Hypertext Transfer Protocol", "B) High Tech Transfer Program", "C) Hidden Text Time Path", "D) Hybrid Total Transfer Protocol"]', 'A', 'IS', 1, 153),

('In cybersecurity, what is an "Injection" attack?', 
 '["A) Physical theft", "B) Passing malicious code into a program", "C) Overheating a server", "D) Deleting local files"]', 'B', 'IS', 1, 154),

('What is the primary role of a System Analyst?', 
 '["A) Writing CSS code", "B) Bridging the gap between business requirements and technical solutions", "C) Cleaning server hardware", "D) Designing logos"]', 'B', 'IS', 1, 155),

('Which version control system is most popular currently?', 
 '["A) SVN", "B) Mercurial", "C) Git", "D) CVS"]', 'C', 'IS', 1, 156),

('What is "SaaS"?', 
 '["A) System as a Service", "B) Software as a Service", "C) Storage as a Service", "D) Structure as a Service"]', 'B', 'IS', 1, 157),

('Which protocol is standard for communicating with web servers securely?', 
 '["A) HTTP", "B) FTP", "C) HTTPS", "D) Telnet"]', 'C', 'IS', 1, 158),

('What is the main purpose of "Unit Testing"?', 
 '["A) Testing the entire system", "B) Testing individual components or functions", "C) Testing the user interface only", "D) Testing server cooling"]', 'B', 'IS', 1, 159);
