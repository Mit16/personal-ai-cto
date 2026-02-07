--  database/migrations/001_init.sql
CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE system_events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);