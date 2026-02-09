-- database\migrations\003_reviews.sql
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER REFERENCES commits(id) ON DELETE CASCADE,
  llm_output_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups by commit
CREATE INDEX idx_reviews_commit_id ON reviews(commit_id);