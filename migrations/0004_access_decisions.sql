CREATE TABLE access_decisions (user_id TEXT PRIMARY KEY REFERENCES users(id), decided_by TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), created_at TEXT NOT NULL);
CREATE TRIGGER no_delete_access_decisions BEFORE DELETE ON access_decisions BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
