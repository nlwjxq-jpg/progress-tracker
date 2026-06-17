-- 003: 任务表扩展 - 部门负责人、工作负责人、员工进展/目标
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dept_leader TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_assignee TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_month_progress TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS this_month_target TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_month_target TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_month TEXT DEFAULT '';

-- 将旧的 assignee 数据迁移到 work_assignee（如果有的话）
UPDATE tasks SET work_assignee = assignee WHERE assignee IS NOT NULL AND assignee != '' AND work_assignee = '';

COMMENT ON COLUMN tasks.dept_leader IS '部门负责人（部长或副部长）';
COMMENT ON COLUMN tasks.work_assignee IS '工作负责人（非部长副部长的员工）';
COMMENT ON COLUMN tasks.last_month_progress IS '上月工作进展';
COMMENT ON COLUMN tasks.this_month_target IS '本月工作目标';
COMMENT ON COLUMN tasks.last_month_target IS '上月工作目标（月初确定，自动显示）';
COMMENT ON COLUMN tasks.progress_month IS '进展/目标填写月份（YYYY-MM）';