import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const TABLES = {
  DEPARTMENTS: 'departments',
  MEMBERS: 'department_members',
  TASKS: 'tasks',
  TASK_PROGRESS: 'task_progress',
  MEMBER_WORKLOAD: 'member_workload',
}
