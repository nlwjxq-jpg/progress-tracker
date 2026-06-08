import { useState, useEffect } from 'react'
import { supabase, TABLES } from '../lib/supabase'
import { getDueStatus, STATUS_LABELS } from '../lib/dueStatus'
import { format } from 'date-fns'
import { Plus, Target, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [tasks, setTasks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', quarter: '', year: new Date().getFullYear() })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [{ data: goalList }, { data: taskList }] = await Promise.all([
        supabase.from('goals').select('*').order('created_at', { ascending: false }),
        supabase.from(TABLES.TASKS).select('*')
      ])
      setGoals(goalList || [])
      setTasks(taskList || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function createGoal() {
    if (!form.title.trim()) return
    await supabase.from('goals').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      quarter: form.quarter,
      year: form.year,
      created_at: new Date().toISOString()
    })
    setForm({ title: '', description: '', quarter: '', year: new Date().getFullYear() })
    setShowModal(false)
    loadData()
  }

  function getGoalStats(goalId) {
    const goalTasks = tasks.filter(t => t.goal_id === goalId)
    const total = goalTasks.length
    const completed = goalTasks.filter(t => t.status === 'completed').length
    const overdue = goalTasks.filter(t => getDueStatus(t.due_date) === 'overdue' && t.status !== 'completed').length
    return { total, completed, overdue, hasTasks: total > 0 }
  }

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">目标管理</h2>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> 新增目标
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Target size={48} className="mx-auto mb-3 text-gray-300" />
          暂无目标，请创建年度/季度考核目标
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const stats = getGoalStats(goal.id)
            return (
              <div key={goal.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Target size={18} className="text-blue-600" />
                      <h3 className="font-semibold text-lg">{goal.title}</h3>
                      {goal.quarter && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{goal.year} Q{goal.quarter}</span>
                      )}
                    </div>
                    {goal.description && <p className="text-sm text-gray-500 mt-1">{goal.description}</p>}
                  </div>
                </div>

                {/* Gap detection */}
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle size={14} className={stats.hasTasks ? 'text-green-500' : 'text-gray-300'} />
                    <span>任务: {stats.total}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle size={14} className={stats.completed > 0 ? 'text-green-500' : 'text-gray-300'} />
                    <span>完成: {stats.completed}</span>
                  </div>
                  {stats.overdue > 0 && (
                    <div className="flex items-center gap-1">
                      <AlertTriangle size={14} className="text-red-500" />
                      <span className="text-red-600">逾期: {stats.overdue}</span>
                    </div>
                  )}
                  {!stats.hasTasks && (
                    <span className="badge-yellow flex items-center gap-1">
                      <AlertTriangle size={12} />
                      该目标下暂无任务
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">新增考核目标</h3>
            <input className="input-field" placeholder="目标标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            <textarea className="input-field" rows={3} placeholder="目标描述（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" className="input-field" placeholder="年份" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} />
              <select className="input-field" value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))}>
                <option value="">-- 季度 --</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary" onClick={createGoal}>创建目标</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
