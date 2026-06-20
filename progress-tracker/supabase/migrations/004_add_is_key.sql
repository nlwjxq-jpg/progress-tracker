-- 004: tasks add is_key field for key/daily task classification
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_key BOOLEAN DEFAULT false;

COMMENT ON COLUMN tasks.is_key IS '是否为与目标关联的重点任务';

-- Auto-set is_key based on existing goal_id references
UPDATE tasks SET is_key = true WHERE goal_id IS NOT NULL AND goal_id != '' AND is_key = false;