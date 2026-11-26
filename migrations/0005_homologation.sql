ALTER TABLE categories ADD COLUMN movement_type TEXT NOT NULL DEFAULT 'both' CHECK(movement_type IN ('both','income','expense'));
ALTER TABLE categories ADD COLUMN all_boxes INTEGER NOT NULL DEFAULT 1 CHECK(all_boxes IN (0,1));
CREATE TABLE category_boxes(category_id TEXT NOT NULL REFERENCES categories(id),box_id TEXT NOT NULL REFERENCES boxes(id),PRIMARY KEY(category_id,box_id));
ALTER TABLE users ADD COLUMN box_scope TEXT CHECK(box_scope IS NULL OR json_valid(box_scope));
ALTER TABLE operations ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CONSTRAINT operation_version CHECK(version>=0);
-- Existing categories and users remain unrestricted. Only the known default name changes.
UPDATE boxes SET name='Administração Geral' WHERE name='Caixa da Igreja' COLLATE NOCASE AND NOT EXISTS(SELECT 1 FROM boxes WHERE name='Administração Geral' COLLATE NOCASE);
UPDATE profiles SET permissions=json_insert(permissions,'$[#]','movements.edit','$[#]','audit.export') WHERE id<>'system-pending' AND EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='profiles.manage');
CREATE INDEX audit_filters ON audit(user_id,action,created_at);
