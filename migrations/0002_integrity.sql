CREATE UNIQUE INDEX only_one_master ON users(is_master) WHERE is_master=1;
CREATE TABLE approvals (operation_id TEXT PRIMARY KEY REFERENCES operations(id), user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TRIGGER account_deactivate_guard BEFORE UPDATE OF active ON financial_accounts WHEN NEW.active=0 AND EXISTS(SELECT 1 FROM postings WHERE account_id=OLD.id GROUP BY box_id HAVING SUM(amount_cents)<>0) BEGIN SELECT RAISE(ABORT,'ACCOUNT_BALANCE_NOT_ZERO'); END;
CREATE TRIGGER box_deactivate_guard BEFORE UPDATE OF active ON boxes WHEN NEW.active=0 AND EXISTS(SELECT 1 FROM postings WHERE box_id=OLD.id GROUP BY account_id HAVING SUM(amount_cents)<>0) BEGIN SELECT RAISE(ABORT,'BOX_BALANCE_NOT_ZERO'); END;
CREATE TRIGGER posting_active_account BEFORE INSERT ON postings WHEN NOT EXISTS(SELECT 1 FROM financial_accounts WHERE id=NEW.account_id AND active=1) BEGIN SELECT RAISE(ABORT,'ACCOUNT_INACTIVE'); END;
CREATE TRIGGER posting_active_box BEFORE INSERT ON postings WHEN NEW.box_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM boxes WHERE id=NEW.box_id AND active=1) BEGIN SELECT RAISE(ABORT,'BOX_INACTIVE'); END;
CREATE TRIGGER profile_deactivate_guard BEFORE UPDATE OF active ON profiles WHEN NEW.active=0 AND EXISTS(SELECT 1 FROM users WHERE profile_id=OLD.id AND active=1) BEGIN SELECT RAISE(ABORT,'PROFILE_ACTIVE_USERS'); END;
CREATE TRIGGER user_last_admin BEFORE UPDATE ON users
WHEN OLD.active=1 AND OLD.is_master=0
AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=OLD.profile_id AND p.active=1 AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='profiles.manage'))
AND (NEW.active=0 OR NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=NEW.profile_id AND p.active=1 AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='profiles.manage')))
AND NOT EXISTS(SELECT 1 FROM users u JOIN profiles p ON p.id=u.profile_id WHERE u.id<>OLD.id AND u.active=1 AND u.is_master=0 AND p.active=1 AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='profiles.manage'))
BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END;
CREATE TRIGGER profile_last_admin BEFORE UPDATE ON profiles
WHEN OLD.active=1 AND EXISTS(SELECT 1 FROM json_each(OLD.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(OLD.permissions) WHERE value='profiles.manage')
AND EXISTS(SELECT 1 FROM users WHERE profile_id=OLD.id AND active=1 AND is_master=0)
AND (NEW.active=0 OR NOT EXISTS(SELECT 1 FROM json_each(NEW.permissions) WHERE value='users.manage') OR NOT EXISTS(SELECT 1 FROM json_each(NEW.permissions) WHERE value='profiles.manage'))
AND NOT EXISTS(SELECT 1 FROM users u JOIN profiles p ON p.id=u.profile_id WHERE u.profile_id<>OLD.id AND u.active=1 AND u.is_master=0 AND p.active=1 AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='profiles.manage'))
BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END;
CREATE TRIGGER no_delete_accounts BEFORE DELETE ON financial_accounts BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_boxes BEFORE DELETE ON boxes BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_categories BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_subcategories BEFORE DELETE ON subcategories BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_users BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_profiles BEFORE DELETE ON profiles BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_operations BEFORE DELETE ON operations BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
CREATE TRIGGER no_delete_approvals BEFORE DELETE ON approvals BEGIN SELECT RAISE(ABORT,'NO_PHYSICAL_DELETE'); END;
