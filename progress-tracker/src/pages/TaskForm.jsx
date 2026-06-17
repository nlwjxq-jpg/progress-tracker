import { useState, useEffect, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase, TABLES } from "../lib/supabase"
import { recommendAssignee } from "../lib/deepseek"
import { ArrowLeft, Sparkles, Save } from "lucide-react"

export default function TaskForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: "", description: "", work_assignee: "", dept_leader: "",
    due_date: "", goal_id: "", priority: "normal"
  })
  const [members, setMembers] = useState([])
  const [goals, setGoals] = useState([])
  const [aiReason, setAiReason] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
  const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

  const loadData = useCallback(async () => {
    try {
      const [{ data: memberList }, { data: goalList }] = await Promise.all([
        supabase.from(TABLES.MEMBERS).select("*"),
        supabase.from("goals").select("*")
      ])
      setMembers(memberList || [])
      setGoals(goalList || [])
    } catch (err) { console.error(err) }
  }, [])

  useEffect(() => {
    loadData()
    if (isEdit) {
      supabase.from(TABLES.TASKS).select("*").eq("id", id).single().then(({ data }) => {
        if (data) setForm({
          title: data.title || "", description: data.description || "",
          work_assignee: data.work_assignee || data.assignee || "",
          dept_leader: data.dept_leader || "",
          due_date: data.due_date || "", goal_id: data.goal_id || "",
          priority: data.priority || "normal"
        })
      })
    }
  }, [id])

  const handleAiRecommend = async () => {
    if (!form.title) return
    setAiLoading(true); setAiReason("")
    try {
      const recommendTarget = deptLeaders.length > 0 ? deptLeaders : workMembers
      const result = await recommendAssignee(form.title, form.description, recommendTarget)
      if (result?.name) {
        if (deptLeaders.some(m => m.name === result.name)) {
          setForm(f => ({ ...f, dept_leader: result.name }))
        } else {
          setForm(f => ({ ...f, work_assignee: result.name }))
        }
        setAiReason(result.reason || "AI 推荐")
      }
    } catch (err) { console.error(err) }
    finally { setAiLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        title: form.title, description: form.description,
        work_assignee: form.work_assignee, dept_leader: form.dept_leader,
        assignee: form.work_assignee,
        due_date: form.due_date || null, goal_id: form.goal_id || null,
        priority: form.priority, updated_at: now
      }
      if (isEdit) {
        await supabase.from(TABLES.TASKS).update(payload).eq("id", id)
      } else {
        await supabase.from(TABLES.TASKS).insert({ ...payload, created_at: now })
      }
      navigate("/tasks")
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const updateField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <h2 className="text-2xl font-bold text-gray-800">{isEdit ? "编辑任务" : "新建任务"}</h2>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">任务标题 *</label>
          <input className="input-field" value={form.title} onChange={e => updateField("title", e.target.value)} required placeholder="输入任务标题" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">任务描述</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={e => updateField("description", e.target.value)} placeholder="详细描述任务内容..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">工作负责人（员工）</label>
            <select className="input-field" value={form.work_assignee} onChange={e => updateField("work_assignee", e.target.value)}>
              <option value="">-- 选择工作负责人 --</option>
              {workMembers.map(m => <option key={m.id} value={m.name}>{m.name} ({m.role || "成员"})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">部门负责人（部长/副部长）</label>
            <select className="input-field" value={form.dept_leader} onChange={e => updateField("dept_leader", e.target.value)}>
              <option value="">-- 选择部门负责人 --</option>
              {deptLeaders.map(m => <option key={m.id} value={m.name}>{m.name} ({m.role})</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={handleAiRecommend} disabled={aiLoading || !form.title} className="btn-secondary flex items-center gap-1 whitespace-nowrap disabled:opacity-50">
            <Sparkles size={16} className={aiLoading ? "animate-pulse text-blue-500" : "text-blue-500"} /> AI推荐负责人
          </button>
          {aiReason && <span className="text-xs text-blue-600 self-center">✨ {aiReason}</span>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">优先级</label>
            <select className="input-field" value={form.priority} onChange={e => updateField("priority", e.target.value)}>
              <option value="low">低</option>
              <option value="normal">普通</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">截止日期</label>
            <input type="date" className="input-field" value={form.due_date} onChange={e => updateField("due_date", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">关联目标</label>
          <select className="input-field" value={form.goal_id} onChange={e => updateField("goal_id", e.target.value)}>
            <option value="">-- 不关联 --</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}><Save size={18} />{saving ? "保存中..." : (isEdit ? "更新任务" : "创建任务")}</button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>取消</button>
        </div>
      </form>
    </div>
  )
}