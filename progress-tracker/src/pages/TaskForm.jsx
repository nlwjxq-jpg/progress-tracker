import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, TABLES } from '../lib/supabase'
import { recommendAssignee } from '../lib/deepseek'
import { ArrowLeft, Sparkles, Save } from 'lucide-react'

export default function TaskForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: '', description: '', assignee: '', due_date: '',
    goal_id: '', progress: 0, status: 'pending', priority: 'normal'
  })
  const [members, setMembers] = useState([])
  const [goals, setGoals] = useState([])
  const [aiReason, setAiReason] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [{ data: memberList }, { data: goalList }] = await Promise.all([
        supabase.from(TABLES.MEMBERS).select('*'),
        supabase.from('goals').select('*')
      ])
      setMembers(memberList || [])
      setGoals(goalList || [])
    } catch (err) { console.error(err) }
  }, [])

  useEffect(() => {
    loadData()
    if (isEdit) {
      supabase.from(TABLES.TASKS).select('*').eq('id', id).single().then(({ data }) => {
        if (data) setForm({
          title: data.title || '', description: data.description || '',
          assignee: data.assignee || '', due_date: data.due_date || '',
          goal_id: data.goal_id || '', progress: data.progress || 0,
          status: data.status || 'pending', priority: data.priority || 'normal'
        })
      })
    }
  }, [id])

  const handleAiRecommend = async () => {
    if (!form.title) return
    setAiLoading(true)
    setAiReason('')
    try {
      const result = await recommendAssignee(form.title, form.description, members)
      if (result?.name) {
        setForm(f => ({ ...f, assignee: result.name }))
        setAiReason(result.reason || 'AI 推荐')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAiLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        updated_at: new Date().toISOString()
      }
      if (isEdit) {
        await supabase.from(TABLES.TASKS).update(payload).eq('id', id)
      } else {
        await supabase.from(TABLES.TASKS).insert({ ...payload, created_at: new Date().toISOString() })
      }
      navigate('/tasks')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-gray-800">{isEdit ? '编辑任务' : '新建任务'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">任务标题 *</label>
          <input className="input-field" value={form.title} onChange={e => updateField('title', e.target.value)} required placeholder="输入任务标题" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">任务描述</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="详细描述任务内容..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">负责人</label>
            <div className="flex gap-2">
              <select className="input-field flex-1" value={form.assignee} onChange={e => { updateField('assignee', e.target.value); setAiReason('') }}>
                <option value="">-- 选择负责人 --</option>
                {members.map(m => (
                  <option key={m.id} value={m.name}>{m.name} ({m.role || '成员'})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAiRecommend}
                disabled={aiLoading || !form.title}
                className="btn-secondary flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
              >
                <Sparkles size={16} className={aiLoading ? 'animate-pulse text-blue-500' : 'text-blue-500'} />
                AI推荐
              </button>
            </div>
            {aiReason && <p className="text-xs text-blue-600 mt-1">✨ {aiReason}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">优先级</label>
            <select className="input-field" value={form.priority} onChange={e => updateField('priority', e.target.value)}>
              <option value="low">低</option>
              <option value="normal">普通</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">截止日期</label>
            <input type="date" className="input-field" value={form.due_date} onChange={e => updateField('due_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">关联目标</label>
            <select className="input-field" value={form.goal_id} onChange={e => updateField('goal_id', e.target.value)}>
              <option value="">-- 不关联 --</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
        </div>

        {isEdit && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">进度 ({form.progress}%)</label>
              <input type="range" min="0" max="100" value={form.progress} onChange={e => updateField('progress', Number(e.target.value))}
                className="w-full accent-blue-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">状态</label>
              <select className="input-field" value={form.status} onChange={e => updateField('status', e.target.value)}>
                <option value="pending">待开始</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
            <Save size={18} />
            {saving ? '保存中...' : (isEdit ? '更新任务' : '创建任务')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>取消</button>
        </div>
      </form>
    </div>
  )
}
