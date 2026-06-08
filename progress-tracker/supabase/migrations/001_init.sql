-- 协同目标进度管理 - Supabase 初始化迁移
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 部门表
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 部门人员表
CREATE TABLE IF NOT EXISTS department_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '成员',
  skills TEXT DEFAULT '',
  task_count INTEGER DEFAULT 0,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 目标表
CREATE TABLE IF NOT EXISTS goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  quarter TEXT,
  year INTEGER DEFAULT EXTRACT(YEAR FROM now()),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee TEXT DEFAULT '',
  due_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 进度记录表（用于追溯）
CREATE TABLE IF NOT EXISTS task_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL,
  note TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 人员工作量快照表
CREATE TABLE IF NOT EXISTS member_workload (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES department_members(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_members_department ON department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_task ON task_progress(task_id);

-- Row Level Security (RLS)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_workload ENABLE ROW LEVEL SECURITY;

-- RLS 策略：认证用户可读写所有表（可根据需要细化到部门级权限）
CREATE POLICY "Authenticated full access" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON department_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON task_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON member_workload FOR ALL TO authenticated USING (true) WITH CHECK (true);
