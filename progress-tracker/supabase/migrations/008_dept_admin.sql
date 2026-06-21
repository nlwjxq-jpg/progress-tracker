-- 008: Department admin role support

-- 1. Add department_id to user_roles for dept_admin
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
COMMENT ON COLUMN user_roles.department_id IS '部门管理员所属部门';

-- 2. Update role check constraint to include dept_admin
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'member', 'dept_admin'));

-- 3. Helper function: check if user is dept_admin for a specific department
CREATE OR REPLACE FUNCTION is_dept_admin_for(dept_id UUID)
RETURNS BOOLEAN AS $
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role = 'dept_admin' AND department_id = dept_id))
  );
$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. Update department_members RLS for dept_admin
DROP POLICY IF EXISTS "Admins can insert members" ON department_members;
DROP POLICY IF EXISTS "Admins can update members" ON department_members;
DROP POLICY IF EXISTS "Admins can delete members" ON department_members;

-- Admins + dept_admins can insert members (dept_admin only for their dept)
CREATE POLICY "Admins can insert members" ON department_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'dept_admin'))
  );

-- Admins + dept_admins can update members in their department
CREATE POLICY "Admins can update members" ON department_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'admin'
          OR (ur.role = 'dept_admin' AND ur.department_id = department_members.department_id))
    )
  );

-- Admins + dept_admins can delete members in their department
CREATE POLICY "Admins can delete members" ON department_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'admin'
          OR (ur.role = 'dept_admin' AND ur.department_id = department_members.department_id))
    )
  );

-- 5. Update registration_requests: dept_admins can see/approve their dept's requests
DROP POLICY IF EXISTS "Admins can read requests" ON registration_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON registration_requests;

CREATE POLICY "Admins can read requests" ON registration_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'admin'
          OR (ur.role = 'dept_admin' AND ur.department_id = registration_requests.department_id))
    )
  );

CREATE POLICY "Admins can update requests" ON registration_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'admin'
          OR (ur.role = 'dept_admin' AND ur.department_id = registration_requests.department_id))
    )
  );

-- 6. Update tasks RLS for dept_admin (same as regular member for data visibility)
-- Tasks visibility already works via department_id, dept_admin sees same tasks as members

-- 7. Update departments RLS for dept_admin
DROP POLICY IF EXISTS "Admins can update departments" ON departments;
DROP POLICY IF EXISTS "Admins can delete departments" ON departments;

CREATE POLICY "Admins can update departments" ON departments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'admin'
          OR (ur.role = 'dept_admin' AND ur.department_id = departments.id))
    )
  );

CREATE POLICY "Admins can delete departments" ON departments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
