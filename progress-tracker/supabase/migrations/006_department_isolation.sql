-- 006: Department isolation - user-to-member mapping, department_id on tasks/goals

-- 1. Add user_id to department_members
ALTER TABLE department_members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN department_members.user_id IS '关联的Supabase用户账号';

-- 2. Add department_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_department_id ON tasks(department_id);
COMMENT ON COLUMN tasks.department_id IS '所属部门';

-- 3. Add department_id to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_goals_department_id ON goals(department_id);
COMMENT ON COLUMN goals.department_id IS '所属部门';

-- 4. Update RLS on tasks: department members see only their department's tasks
DROP POLICY IF EXISTS "Authenticated full access" ON tasks;

-- Admins see all tasks
CREATE POLICY "Admins full access tasks" ON tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Department members see only their department's tasks
CREATE POLICY "Members see own department tasks" ON tasks
  FOR SELECT TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
    OR department_id IS NULL
  );

-- Department members can insert/update/delete tasks in their own department
CREATE POLICY "Members insert own department tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

CREATE POLICY "Members update own department tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

CREATE POLICY "Members delete own department tasks" ON tasks
  FOR DELETE TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

-- 5. Update RLS on goals: department isolation
DROP POLICY IF EXISTS "Authenticated full access" ON goals;

CREATE POLICY "Admins full access goals" ON goals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Members see own department goals" ON goals
  FOR SELECT TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
    OR department_id IS NULL
  );

CREATE POLICY "Members insert own department goals" ON goals
  FOR INSERT TO authenticated
  WITH CHECK (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

CREATE POLICY "Members update own department goals" ON goals
  FOR UPDATE TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

CREATE POLICY "Members delete own department goals" ON goals
  FOR DELETE TO authenticated
  USING (
    department_id IN (
      SELECT dm.department_id FROM department_members dm
      WHERE dm.user_id = auth.uid() AND dm.department_id IS NOT NULL
    )
  );

-- 6. Update RLS on department_members: members see their own department
DROP POLICY IF EXISTS "Anyone can read members" ON department_members;
DROP POLICY IF EXISTS "Admins can insert members" ON department_members;
DROP POLICY IF EXISTS "Admins can update members" ON department_members;
DROP POLICY IF EXISTS "Admins can delete members" ON department_members;

-- All authenticated users can read members (needed for dropdowns, but data scoping is in pages)
CREATE POLICY "Anyone can read members" ON department_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert members" ON department_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update members" ON department_members
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete members" ON department_members
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
