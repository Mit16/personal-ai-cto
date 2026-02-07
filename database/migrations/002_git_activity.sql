-- database\migrations\002_git_activity.sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  repo_url TEXT NOT NULL,
  description TEXT
);

CREATE TABLE commits (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  timestamp TIMESTAMP NOT NULL,
  files_changed INTEGER,
  lines_added INTEGER,
  lines_removed INTEGER
);
