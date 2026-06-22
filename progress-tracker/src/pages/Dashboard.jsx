import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TABLES } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getDueStatus, STATUS_LABELS } from '../lib/dueStatus'
import { format } from 'date-fns'
import { Plus, AlertTriangle, CheckCircle, Clock, Users } from 'lucide-react'
import ConfidentialNotice from "../components/ConfidentialNotice";

export default function Dashboard() {
  const { isAdmin, isDeptAdmin, userDeptId } = useAuth()
  const [stats, setStats] = useState({ total: 0, overdue: 0, nearDue: 0, completed: 0, members: 0 })
  const [recentTasks, setRecentTasks] = useState([])
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      // Get tasks
      const { data: tasks, error } = await supabase
        .from(TABLES.TASKS)
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const total = tasks.length
      let overdue = 0, nearDue = 0, completed = 0

      tasks.forEach(t => {
        if (t.status === 'completed') completed++
        else {
          const status = getDueStatus(t.due_date)
          if (status === 'overdue') overdue++
          if (status === 'near-due') nearDue++
        }
      })

      let memberQuery = supabase.from(TABLES.MEMBERS).select('*')
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        memberQuery = memberQuery.eq('department_id', userDeptId)
      }
      const { data: deptMembers } = await memberQuery
      setStats({ total, overdue, nearDue, completed, members: deptMembers?.length || 0 })
      setRecentTasks(tasks.slice(0, 6))

      // Goal gap detection
      const goalsWithNoTasks = tasks.filter(t => t.goal_id && t.status !== 'completed')
      setGaps(goalsWithNoTasks.filter(t => t.goal_id).slice(0, 5))

    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: '总任务数', value: stats.total, icon: Clock, color: 'text-blue-600' },
    { label: '已完成', value: stats.completed, icon: CheckCircle, color: 'text-green-600' },
    { label: '已逾期', value: stats.overdue, icon: AlertTriangle, color: 'text-red-600' },
    { label: '临近截止', value: stats.nearDue, icon: AlertTriangle, color: 'text-yellow-600' },
  ]

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  return (
    <div className="space-y-6">
      <ConfidentialNotice />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">仪表盘</h2>
        <Link to="/tasks/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          新建任务
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-4">
            <Icon size={32} className={color} />
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent tasks */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">最近任务</h3>
        {recentTasks.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无任务，点击右上角新建。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">任务</th>
                  <th className="pb-2 font-medium">负责人</th>
                  <th className="pb-2 font-medium">截止日期</th>
                  <th className="pb-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map(task => {
                  const status = getDueStatus(task.due_date)
                  return (
                    <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 font-medium">{task.title}</td>
                      <td className="py-2.5">{task.assignee || '-'}</td>
                      <td className="py-2.5">{task.due_date ? format(new Date(task.due_date), 'MM-dd') : '-'}</td>
                      <td className="py-2.5">
                        <span className={`${task.status === 'completed' ? 'badge-green' : status === 'overdue' ? 'badge-red' : status === 'near-due' ? 'badge-yellow' : 'text-gray-500'} text-xs px-2 py-0.5 rounded-full font-medium`}>
                          {task.status === 'completed' ? '已完成' : STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
