-- Payments can be edited and deleted (soft delete, so they can be restored)
ALTER TABLE payments ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN updated_at TEXT;
