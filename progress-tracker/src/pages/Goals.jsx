import { useState, useEffect } from "react"
import { supabase, TABLES } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { getAiApiUrl } from "../lib/deepseek"
import { getDueStatus, STATUS_LABELS } from "../lib/dueStatus"
import { Plus, Target, AlertTriangle, CheckCircle, Sparkles, Link2, X, Search, Download } from "lucide-react"
import ConfidentialNotice from "../components/ConfidentialNotice";

function getLinkUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-tasks-goals` }

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [tasks, setTasks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", quarter: "", year: new Date().getFullYear() })
  const [loading, setLoading] = useState(true)
  const [aiLinking, setAiLinking] = useState(false)
  const [aiMsg, setAiMsg] = useState("")
  const [linkModal, setLinkModal] = useState(null)
  const [linkSearch, setLinkSearch] = useState("")
  const [linking, setLinking] = useState(false)
  const [selectedGoals, setSelectedGoals] = useState(new Set())

  const { isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let goalQuery = supabase.from("goals").select("*").order("created_at", { ascending: false })
      let taskQuery = supabase.from(TABLES.TASKS).select("*").order("created_at", { ascending: false })
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        goalQuery = goalQuery.eq("department_id", userDeptId)
        taskQuery = taskQuery.eq("department_id", userDeptId)
      }
      const [{ data: goalList }, { data: taskList }] = await Promise.all([
        goalQuery,
        taskQuery
      ])
      setGoals(goalList || [])
      setTasks(taskList || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function createGoal() {
    if (!form.title.trim()) return
    await supabase.from("goals").insert({
      title: form.title.trim(), description: form.description.trim(),
      quarter: form.quarter, year: form.year, department_id: userDeptId || null, created_at: new Date().toISOString()
    })
    setForm({ title: "", description: "", quarter: "", year: new Date().getFullYear() })
    setShowModal(false)
    loadData()
  }

  async function deleteGoal(goalId) {
    await supabase.from("goals").delete().eq("id", goalId)
    loadData()
  }

  async function handleAiLink() {
    setAiLinking(true); setAiMsg("正在调用 AI 关联分析...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getLinkUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          tasks: tasks.map(t => ({ id: t.id, title: t.title, description: t.description || "", goalTitle: goals.find(g => g.id === t.goal_id)?.title || "" })),
          goals: goals.map(g => ({ id: g.id, title: g.title, description: g.description || "", year: g.year, quarter: g.quarter })),
          apiUrl
        })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.warning || result.error || "关联失败")
      const matches = result.matches || []
      if (matches.length === 0) { setAiMsg("未获得 AI 关联结果" + (result.warning ? "：" + result.warning : "") + (result.raw ? "\n原始返回：" + result.raw.slice(0,200) : "")); return }
      setAiMsg(`AI 返回 ${matches.length} 条关联，正在更新...`)
      let updated = 0
      const updateErrors = []
      for (const m of matches) {
        const task = tasks[m.taskIndex]
        if (!task) continue
        if (!m.goalId) continue
        const { error } = await supabase.from(TABLES.TASKS).update({ goal_id: m.goalId, is_key: true }).eq("id", task.id)
        if (!error) {
          updated++
        } else {
          updateErrors.push((task.title || "").substring(0,20) + ":" + error.message)
        }
      }
      if (updated === 0 && updateErrors.length > 0) {
        setAiMsg("关联失败：数据库更新被拒绝。错误：" + updateErrors.slice(0,3).join("；"))
        setAiLinking(false)
        return
      }
      setAiMsg(`完成：已关联 ${updated} 项任务` + (updateErrors.length > 0 ? `，${updateErrors.length} 项失败` : ""))
      loadData()
    } catch (err) { setAiMsg(`AI 关联失败：${err.message}`) }
    finally { setAiLinking(false); setTimeout(() => setAiMsg(""), 5000) }
  }

  async function linkTaskToGoal(taskId, goalId) {
    setLinking(true)
    await supabase.from(TABLES.TASKS).update({ goal_id: goalId, is_key: true }).eq("id", taskId)
    loadData()
    setLinking(false)
  }

  async function unlinkTask(taskId) {
    await supabase.from(TABLES.TASKS).update({ goal_id: null, is_key: false }).eq("id", taskId)
    loadData()
  }

  function getGoalStats(goalId) {
    const goalTasks = tasks.filter(t => t.goal_id === goalId)
    const total = goalTasks.length
    const completed = goalTasks.filter(t => t.status === "completed").length
    const overdue = goalTasks.filter(t => getDueStatus(t.due_date) === "overdue" && t.status !== "completed").length
    return { goalTasks, total, completed, overdue, hasTasks: total > 0 }
  }

  function toggleGoalSelect(goalId) {
    const next = new Set(selectedGoals)
    if (next.has(goalId)) next.delete(goalId); else next.add(goalId)
    setSelectedGoals(next)
  }

  function toggleAllGoals() {
    if (selectedGoals.size === goals.length) {
      setSelectedGoals(new Set())
    } else {
      setSelectedGoals(new Set(goals.map(g => g.id)))
    }
  }

  const unlinkedTasks = tasks.filter(t => !t.goal_id)
  const filteredUnlinked = linkSearch
    ? unlinkedTasks.filter(t => t.title.toLowerCase().includes(linkSearch.toLowerCase()))
    : unlinkedTasks

  function exportGoalsToExcel() {
    const BOM = "\uFEFF"
    const headers = ["目标标题", "目标描述", "年份", "季度", "关联任务数", "完成任务数", "逾期任务数", "任务列表"]
    const rows = goals.map(g => {
      const stats = getGoalStats(g.id)
      return [
        g.title,
        g.description || "",
        g.year || "",
        g.quarter || "",
        stats.total,
        stats.completed,
        stats.overdue,
        stats.goalTasks.map(t => t.title).join("; ")
      ]
    })
    const csv = BOM + headers.join(",") + "\n" + rows.map(r => r.map(c => "\"" + String(c).replace(/"/g, "\"\"") + "\"").join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "目标管理_" + new Date().toISOString().slice(0, 10) + ".csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  return (
    <div className="space-y-6">
      <ConfidentialNotice />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">目标管理</h2>
          <button onClick={toggleAllGoals} className="text-sm text-blue-600 hover:underline">{selectedGoals.size === goals.length && goals.length > 0 ? "取消全选" : "全选"}</button>
          <button onClick={exportGoalsToExcel} className="btn-secondary flex items-center gap-2 text-sm"><Download size={16} /> 导出Excel</button>
          <button onClick={handleAiLink} disabled={aiLinking || tasks.length === 0 || goals.length === 0} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50" title="AI 自动关联任务与目标">
            <Sparkles size={16} className={aiLinking ? "animate-pulse text-blue-500" : "text-blue-500"} /> AI 关联任务
          </button>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> 新增目标
        </button>
      </div>

      {aiMsg && <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>{aiLinking && <Sparkles size={14} className="inline animate-pulse mr-1" />}{aiMsg}</div>}

      {unlinkedTasks.length > 0 && (
        <div className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg inline-block">
          有 {unlinkedTasks.length} 项任务未关联目标，点击 "AI 关联任务" 可自动匹配
        </div>
      )}

      {goals.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Target size={48} className="mx-auto mb-3 text-gray-300" /> 暂无目标，请创建年度/季度考核目标
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
                      {goal.quarter && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{goal.year} Q{goal.quarter}</span>}
                    </div>
                    {goal.description && <p className="text-sm text-gray-500 mt-1">{goal.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setLinkModal(goal.id)} className="btn-secondary text-xs flex items-center gap-1 py-1 px-2"><Link2 size={12} /> 添加任务</button>
                    <button onClick={() => deleteGoal(goal.id)} className="text-gray-400 hover:text-red-500 p-1" title="删除目标"><X size={14} /></button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1"><CheckCircle size={14} className={stats.hasTasks ? "text-green-500" : "text-gray-300"} /><span>任务: {stats.total}</span></div>
                  <div className="flex items-center gap-1"><CheckCircle size={14} className={stats.completed > 0 ? "text-green-500" : "text-gray-300"} /><span>完成: {stats.completed}</span></div>
                  {stats.overdue > 0 && <div className="flex items-center gap-1"><AlertTriangle size={14} className="text-red-500" /><span className="text-red-600">逾期: {stats.overdue}</span></div>}
                  {!stats.hasTasks && <span className="badge-yellow flex items-center gap-1"><AlertTriangle size={12} />该目标下暂无任务</span>}
                </div>

                {stats.hasTasks && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-400 mb-2">关联任务：</p>
                    <ul className="space-y-1.5">
                      {stats.goalTasks.map(task => (
                        <li key={task.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                          <span className="truncate">{task.title}</span>
                          <button onClick={() => unlinkTask(task.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2" title="取消关联"><X size={12} /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary" onClick={createGoal}>创建目标</button>
            </div>
          </div>
        </div>
      )}

      {/* Link Task Modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setLinkModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">关联任务到目标</h3>
            <p className="text-sm text-gray-500">选择任务关联到 "{goals.find(g => g.id === linkModal)?.title}"</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input-field pl-8" placeholder="搜索任务..." value={linkSearch} onChange={e => setLinkSearch(e.target.value)} />
            </div>
            {filteredUnlinked.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">没有可关联的未分配任务</p>
            ) : (
              <ul className="space-y-1">
                {filteredUnlinked.map(task => (
                  <li key={task.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2 hover:bg-blue-50 cursor-pointer" onClick={() => linkTaskToGoal(task.id, linkModal)}>
                    <span>{task.title}</span>
                    <Link2 size={14} className="text-blue-500" />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setLinkModal(null); setLinkSearch("") }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}