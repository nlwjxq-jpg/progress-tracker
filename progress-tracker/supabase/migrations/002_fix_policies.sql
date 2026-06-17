-- 修复脚本：先删除已有策略再重建
DROP POLICY IF EXISTS "Authenticated full access" ON departments;
DROP POLICY IF EXISTS "Authenticated full access" ON department_members;
DROP POLICY IF EXISTS "Authenticated full access" ON goals;
DROP POLICY IF EXISTS "Authenticated full access" ON tasks;
DROP POLICY IF EXISTS "Authenticated full access" ON task_progress;
DROP POLICY IF EXISTS "Authenticated full access" ON member_workload;

CREATE POLICY "Authenticated full access" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON department_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON task_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON member_workload FOR ALL TO authenticated USING (true) WITH CHECK (true);
