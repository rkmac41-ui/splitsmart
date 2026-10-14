-- Placeholder members are stored as negative user IDs (-placeholder_members.id)
-- in expense_payers, expense_splits and payments. The original user_id foreign
-- keys to users(id) rejected those rows, so rebuild the tables without them.
-- Membership is validated in the service layer instead.

CREATE TABLE expense_payers_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    UNIQUE(expense_id, user_id)
);
INSERT INTO expense_payers_new (id, expense_id, user_id, amount)
    SELECT id, expense_id, user_id, amount FROM expense_payers;
DROP TABLE expense_payers;
ALTER TABLE expense_payers_new RENAME TO expense_payers;
CREATE INDEX IF NOT EXISTS idx_expense_payers_expense ON expense_payers(expense_id);

CREATE TABLE expense_splits_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    share_value REAL,
    UNIQUE(expense_id, user_id)
);
INSERT INTO expense_splits_new (id, expense_id, user_id, amount, share_value)
    SELECT id, expense_id, user_id, amount, share_value FROM expense_splits;
DROP TABLE expense_splits;
ALTER TABLE expense_splits_new RENAME TO expense_splits;
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id);

CREATE TABLE payments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    payer_id INTEGER NOT NULL,
    payee_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    recorded_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO payments_new (id, group_id, payer_id, payee_id, amount, note, recorded_by, created_at)
    SELECT id, group_id, payer_id, payee_id, amount, note, payer_id, created_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX IF NOT EXISTS idx_payments_group ON payments(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee ON payments(payee_id);
