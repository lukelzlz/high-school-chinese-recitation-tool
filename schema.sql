CREATE TABLE IF NOT EXISTS recitation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  text_key TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_id ON recitation_events(user_id);
CREATE INDEX idx_text_key ON recitation_events(text_key);
