
-- 1. Consecutive flag for subjects
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS is_consecutive boolean NOT NULL DEFAULT false;

-- 2. Allow students/lecturers to read their own row by email
DROP POLICY IF EXISTS "students self read" ON public.students;
CREATE POLICY "students self read" ON public.students FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "lecturers self read" ON public.lecturers;
CREATE POLICY "lecturers self read" ON public.lecturers FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

-- 3. Seed UCSM B.C.Sc core subjects
INSERT INTO public.subjects (code, name, year, semester, credit, duration_hours, is_consecutive) VALUES
  -- Year 1 Sem 1
  ('M-1001','Burmese Language & Literature I',1,1,2,1,false),
  ('E-1001','English Proficiency I',1,1,2,1,false),
  ('P-1001','Physics: Mechanics',1,1,4,2,true),
  ('CST-1011','Web Development',1,1,4,2,true),
  ('CST-1021','Calculus I',1,1,4,2,true),
  ('CST-1031','Software Development Fundamentals I',1,1,3,1,false),
  -- Year 1 Sem 2
  ('M-1002','Burmese Language & Literature II',1,2,2,1,false),
  ('E-1002','English Proficiency II',1,2,2,1,false),
  ('P-1002','Physics: Electromagnetics',1,2,4,2,true),
  ('CST-1012','Digital Logic I',1,2,3,1,false),
  ('CST-1022','Differential Equations & Discrete Mathematics I',1,2,4,2,true),
  ('CST-1032','Software Development Fundamentals II',1,2,4,2,true),
  -- Year 2 Sem 1
  ('E-2001','English Proficiency III',2,1,2,1,false),
  ('CST-2011','Software Development Fundamentals III',2,1,4,2,true),
  ('CST-2021','Calculus II & Discrete Mathematics II',2,1,4,2,true),
  ('CST-2031','Digital Logic II',2,1,4,2,true),
  ('CST-2041','Information Management I',2,1,4,2,true),
  ('CS-2051','Systems Analysis and Design & UML',2,1,3,1,false),
  -- Year 2 Sem 2
  ('E-2002','English Proficiency IV',2,2,2,1,false),
  ('CST-2012','Software Development Fundamentals IV',2,2,4,2,true),
  ('CST-2022','Theory of Probability & Infinite Series',2,2,4,2,true),
  ('CS-2042','Software Engineering I',2,2,3,1,false),
  ('CS-2052','Human Computer Interaction',2,2,3,1,false),
  ('CST-2032','Project (Year 2)',2,2,2,1,false),
  ('CST-2112','C# Programming',2,2,4,2,true),
  -- Year 3 Sem 1
  ('E-3001','English Proficiency V',3,1,2,1,false),
  ('CST-3011','Operating Systems',3,1,3,1,false),
  ('CST-3021','Introduction to Modelling and Simulation',3,1,4,2,true),
  ('CS-3031','Computer Networks I',3,1,4,2,true),
  ('CST-3041','Computer Architecture and Organization I',3,1,3,1,false),
  ('CS-3051','Information Management II',3,1,4,2,true),
  -- Year 3 Sem 2
  ('E-3002','English Proficiency VI',3,2,2,1,false),
  ('CS-3012','Algorithms and Complexity I',3,2,3,1,false),
  ('CS-3022','Modelling and Simulation',3,2,4,2,true),
  ('CS-3032','Distributed Systems',3,2,3,1,false),
  ('CS-3042','Software Engineering II',3,2,3,1,false),
  ('CST-3052','Project (Year 3)',3,2,2,1,false),
  ('CST-3112','Python Programming',3,2,4,2,true),
  -- Year 4 Sem 1
  ('CS-4011','Intelligent Systems I',4,1,3,1,false),
  ('CS-4031','Social Issues and Professional Practice',4,1,3,1,false),
  ('CS-4041','Systems Fundamentals I',4,1,3,1,false),
  -- Year 4 Sem 2
  ('CS-4012','Algorithms and Complexity II',4,2,3,1,false),
  ('CS-4022','Information Assurance and Security',4,2,3,1,false),
  ('CS-4032','Programming Languages',4,2,3,1,false),
  -- Year 5
  ('E-5001','Academic Writing',5,1,2,1,false),
  ('PI-5002','Professional Internship',5,2,12,1,false)
ON CONFLICT (code) DO NOTHING;
