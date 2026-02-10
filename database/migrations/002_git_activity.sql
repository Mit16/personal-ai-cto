CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  repo_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commits (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  project_id INTEGER REFERENCES projects(id),
  message TEXT,
  timestamp TIMESTAMP NOT NULL,
  files_changed INTEGER,
  lines_added INTEGER,
  lines_removed INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);