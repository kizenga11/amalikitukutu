CREATE TABLE lp_syllabi (
  id SERIAL PRIMARY KEY,
  subject_name VARCHAR(150) NOT NULL,
  form_level SMALLINT NOT NULL CHECK (form_level BETWEEN 1 AND 4),
  source VARCHAR(50) NOT NULL DEFAULT 'TIE',
  minutes_per_period SMALLINT NOT NULL DEFAULT 40,
  UNIQUE (subject_name, form_level, source)
);

CREATE TABLE lp_topics (
  id SERIAL PRIMARY KEY,
  syllabus_id INTEGER NOT NULL REFERENCES lp_syllabi(id) ON DELETE CASCADE,
  seq SMALLINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  main_competence TEXT,
  total_periods SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (syllabus_id, seq)
);

CREATE TABLE lp_subtopics (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES lp_topics(id) ON DELETE CASCADE,
  seq SMALLINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  periods SMALLINT NOT NULL DEFAULT 1,
  specific_competence TEXT,
  main_activity TEXT,
  specific_activity TEXT,
  resources TEXT,
  reference_books TEXT,
  intro_teaching TEXT, intro_learning TEXT, intro_assessment TEXT,
  develop_teaching TEXT, develop_learning TEXT, develop_assessment TEXT,
  design_teaching TEXT, design_learning TEXT, design_assessment TEXT,
  realise_teaching TEXT, realise_learning TEXT, realise_assessment TEXT,
  UNIQUE (topic_id, seq)
);

CREATE TABLE lp_plans (
  id SERIAL PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT '',
  subtopic_id INTEGER NOT NULL REFERENCES lp_subtopics(id),
  class_label TEXT NOT NULL DEFAULT '',
  lesson_no SMALLINT NOT NULL,
  lesson_date DATE,
  lesson_time VARCHAR(30),
  registered_girls SMALLINT, registered_boys SMALLINT,
  present_girls SMALLINT, present_boys SMALLINT,
  main_competence TEXT, specific_competence TEXT,
  main_activity TEXT, specific_activity TEXT,
  resources TEXT, reference_books TEXT,
  remarks TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, subtopic_id, class_label, lesson_no)
);

CREATE TABLE lp_plan_stages (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES lp_plans(id) ON DELETE CASCADE,
  stage VARCHAR(25) NOT NULL CHECK (stage IN ('Introduction','Competence Development','Design','Realisation')),
  minutes SMALLINT NOT NULL,
  teaching_activities TEXT, learning_activities TEXT, assessment_criteria TEXT,
  UNIQUE (plan_id, stage)
);

CREATE INDEX idx_lp_topics_syllabus ON lp_topics(syllabus_id);
CREATE INDEX idx_lp_subtopics_topic ON lp_subtopics(topic_id);
CREATE INDEX idx_lp_plans_teacher ON lp_plans(teacher_id, subtopic_id);

-- Usalama: hakuna ufikiaji wa moja kwa moja kutoka browser; seva pekee (service role)
ALTER TABLE lp_syllabi ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_plan_stages ENABLE ROW LEVEL SECURITY;
