-- Placeholder members: people added by name before they join
CREATE TABLE IF NOT EXISTS placeholder_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    claimed_by INTEGER REFERENCES users(id),
    claimed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id, name)
);

CREATE INDEX IF NOT EXISTS idx_placeholder_members_group ON placeholder_members(group_id);
CREATE INDEX IF NOT EXISTS idx_placeholder_members_claimed ON placeholder_members(claimed_by);
