-- Daily activity tracking
CREATE TABLE daily_activity (
  date DATE PRIMARY KEY,
  commit_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL CHECK (status IN ('active', 'idle')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Drift event tracking
CREATE TABLE drift_events (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('idle', 'misalignment', 'quality')),
  description TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE
);

-- Index for faster drift queries
CREATE INDEX idx_drift_events_unresolved ON drift_events(timestamp) WHERE resolved = FALSE;
CREATE INDEX idx_daily_activity_date ON daily_activity(date DESC);