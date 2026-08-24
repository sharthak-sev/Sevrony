CREATE TABLE IF NOT EXISTS feedback_threads (id TEXT PRIMARY KEY, user_email TEXT NOT NULL, subject TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'General', status TEXT NOT NULL DEFAULT 'open', user_unread INTEGER NOT NULL DEFAULT 0, admin_unread INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_user ON feedback_threads (user_email, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_admin ON feedback_threads (updated_at DESC);
CREATE TABLE IF NOT EXISTS feedback_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, sender_role TEXT NOT NULL, sender_email TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (thread_id) REFERENCES feedback_threads(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread ON feedback_messages (thread_id, created_at ASC);
CREATE TABLE IF NOT EXISTS feedback_attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'image/webp', data TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (message_id) REFERENCES feedback_messages(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_feedback_attachments_message ON feedback_attachments (message_id);
