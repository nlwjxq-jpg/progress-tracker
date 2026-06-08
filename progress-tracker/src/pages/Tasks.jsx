import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TABLES } from '../lib/supabase'
import { getDueStatus, STATUS_LABELS } from '../lib/dueStatus'
import { format } from 'date-fns'
import { Plus, Search, Edit } from 'lucide-react'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from(TABLES.TASKS)
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setTasks(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (filter === 'overdue' && getDueStatus(t.due_date) !== 'overdue') return false
    if (filter === 'near-due' && getDueStatus(t.due_date) !== 'near-due') return false
    if (filter === 'completed' && t.status !== 'completed') return false
    if (filter === 'active' && t.status === 'completed') return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filters = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'overdue', label: '已逾期' },
    { key: 'near-due', label: '临近截止' },
    { key: 'completed', label: '已完成' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">任务列表</h2>
        <Link to="/tasks/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> 新建任务
        </Link>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="搜索任务..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f.key ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-12" />
      ) : filteredTasks.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">任务名称</th>
                <th className="pb-2 font-medium">负责人</th>
                <th className="pb-2 font-medium">截止日期</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">进度</th>
                <th className="pb-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const status = getDueStatus(task.due_date)
                return (
                  <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5">
                      <div className="font-medium">{task.title}</div>
                      {task.description && <div className="text-xs text-gray-400 mt-0.5">{task.description.slice(0, 60)}</div>}
                    </td>
                    <td className="py-2.5">{task.assignee || '-'}</td>
                    <td className="py-2.5">{task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '-'}</td>
                    <td className="py-2.5">
                      <span className={`${
                        task.status === 'completed' ? 'badge-green' :
                        status === 'overdue' ? 'badge-red' :
                        status === 'near-due' ? 'badge-yellow' :
                        'badge-green'
                      } inline-block`}>
                        {task.status === 'completed' ? '已完成' : STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              task.status === 'completed' ? 'bg-green-500' :
                              (task.progress || 0) > 70 ? 'bg-blue-500' :
                              (task.progress || 0) > 30 ? 'bg-yellow-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${task.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{task.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <Link to={`/tasks/${task.id}/edit`} className="text-blue-600 hover:text-blue-800">
                        <Edit size={16} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
