import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { supabase, TABLES } from "../lib/supabase"
import { getDueStatus, STATUS_LABELS } from "../lib/dueStatus"
import { getAiApiUrl } from "../lib/deepseek"
import { format } from "date-fns"
import { Plus, Search, Edit, FileText, Sparkles } from "lucide-react"

function getFunctionUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${baseUrl}/functions/v1/batch-assign`
}

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [progressModal, setProgressModal] = useState(null)
  const [progressForm, setProgressForm] = useState({ last_progress: "", this_target: "" })
  const [savingProgress, setSavingProgress] = useState(false)
  const [aiMatching, setAiMatching] = useState(false)
  const [aiMsg, setAiMsg] = useState("")

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [{ data: taskData }, { data: memberData }] = await Promise.all([
        supabase.from(TABLES.TASKS).select("*").order("created_at", { ascending: false }),
        supabase.from(TABLES.MEMBERS).select("*")
      ])
      setTasks(taskData || [])
      setMembers(memberData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
  const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

  async function handleAiBatchMatch() {
    setAiMatching(true)
    setAiMsg("正在调用 AI 分析...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()

      const resp = await fetch(getFunctionUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || "",
            work_assignee: t.work_assignee || t.assignee || "",
            dept_leader: t.dept_leader || ""
          })),
          deptLeaders: deptLeaders.map(m => ({
            name: m.name, role: m.role, skills: m.skills, task_count: m.task_count || 0
          })),
          workMembers: workMembers.map(m => ({
            name: m.name, role: m.role, skills: m.skills, task_count: m.task_count || 0
          })),
          apiUrl
        })
      })

      const result = await resp.json()
      if (!resp.ok) throw new Error(result.warning || result.error || "匹配失败")

      const assignments = result.assignments || []
      if (assignments.length === 0) {
        setAiMsg("未获得 AI 匹配结果")
        return
      }

      setAiMsg(`AI 返回 ${assignments.length} 条匹配，正在更新...`)
      let updated = 0

      for (const a of assignments) {
        const task = tasks[a.taskIndex]
        if (!task) continue
        const update = {}
        if (a.work_assignee) update.work_assignee = a.work_assignee
        if (a.dept_leader) update.dept_leader = a.dept_leader
        if (Object.keys(update).length === 0) continue

        const { error } = await supabase.from(TABLES.TASKS).update(update).eq("id", task.id)
        if (!error) updated++
      }

      setAiMsg(`完成：已更新 ${updated} 项任务的负责人`)
      loadData()
    } catch (err) {
      setAiMsg(`AI 匹配失败：${err.message}`)
    } finally {
      setAiMatching(false)
      setTimeout(() => setAiMsg(""), 5000)
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (filter === "overdue" && t.status !== "completed" && getDueStatus(t.due_date) !== "overdue") return false
    if (filter === "near-due" && t.status !== "completed" && getDueStatus(t.due_date) !== "near-due") return false
    if (filter === "completed" && t.status !== "completed") return false
    if (filter === "active" && t.status === "completed") return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filters = [
    { key: "all", label: "全部" },
    { key: "active", label: "进行中" },
    { key: "overdue", label: "已逾期" },
    { key: "near-due", label: "临近截止" },
    { key: "completed", label: "已完成" },
  ]

  function openProgressModal(task) {
    setProgressModal(task)
    setProgressForm({
      last_progress: task.last_month_progress || "",
      this_target: task.this_month_target || ""
    })
  }

  async function saveProgress() {
    if (!progressModal) return
    setSavingProgress(true)
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    try {
      const prevTarget = progressModal.this_month_target || ""
      const updateData = {
        last_month_progress: progressForm.last_progress,
        this_month_target: progressForm.this_target,
        progress_month: month
      }
      if (prevTarget) {
        updateData.last_month_target = prevTarget
      }
      await supabase.from(TABLES.TASKS).update(updateData).eq("id", progressModal.id)
      setProgressModal(null)
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingProgress(false)
    }
  }

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  const unassignedCount = tasks.filter(t => !t.work_assignee && !t.assignee && !t.dept_leader).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">任务列表</h2>
          <button
            onClick={handleAiBatchMatch}
            disabled={aiMatching || tasks.length === 0}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            title="AI 自动匹配并修正工作负责人和部门负责人"
          >
            <Sparkles size={16} className={aiMatching ? "animate-pulse text-blue-500" : "text-blue-500"} />
            AI 校验修正
          </button>
        </div>
        <Link to="/tasks/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> 新建任务
        </Link>
      </div>

      {aiMsg && (
        <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {aiMatching && <Sparkles size={14} className="inline animate-pulse mr-1" />}
          {aiMsg}
        </div>
      )}

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
                filter === f.key ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {unassignedCount > 0 && (
          <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
            {unassignedCount} 项未分配负责人
          </span>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">任务名称</th>
                <th className="pb-2 font-medium whitespace-nowrap">上月工作目标</th>
                <th className="pb-2 font-medium whitespace-nowrap">工作负责人</th>
                <th className="pb-2 font-medium whitespace-nowrap">部门负责人</th>
                <th className="pb-2 font-medium">截止日期</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">进度</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const status = getDueStatus(task.due_date)
                const workAssignee = task.work_assignee || task.assignee || ""
                const deptLeader = task.dept_leader || ""
                const lastMonthTarget = task.last_month_target || ""
                const isUnassigned = !workAssignee && !deptLeader

                return (
                  <tr key={task.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isUnassigned ? "bg-orange-50/30" : ""}`}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{task.title}</div>
                          {task.description && <div className="text-xs text-gray-400 mt-0.5">{task.description.slice(0, 60)}</div>}
                        </div>
                        <Link to={`/tasks/${task.id}/edit`} className="text-blue-500 hover:text-blue-700 shrink-0" title="编辑任务">
                          <Edit size={14} />
                        </Link>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-gray-600 whitespace-pre-wrap max-w-40 block truncate">
                        {lastMonthTarget || "-"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-sm ${!workAssignee ? "text-orange-500 font-medium" : ""}`}>
                        {workAssignee || "未分配"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-sm ${!deptLeader ? "text-orange-500 font-medium" : ""}`}>
                        {deptLeader || "未分配"}
                      </span>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">{task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "-"}</td>
                    <td className="py-2.5">
                      <span className={`${
                        task.status === "completed" ? "badge-green" :
                        status === "overdue" ? "badge-red" :
                        status === "near-due" ? "badge-yellow" :
                        "badge-green"
                      } inline-block`}>
                        {task.status === "completed" ? "已完成" : STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              task.status === "completed" ? "bg-green-500" :
                              (task.progress || 0) > 70 ? "bg-blue-500" :
                              (task.progress || 0) > 30 ? "bg-yellow-500" : "bg-gray-400"
                            }`}
                            style={{ width: `${task.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{task.progress || 0}%</span>
                      </div>
                      <button
                        onClick={() => openProgressModal(task)}
                        className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1"
                      >
                        <FileText size={12} />
                        填写进展/目标
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {progressModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setProgressModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">填写工作进展与目标</h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700">{progressModal.title}</p>
              {progressModal.description && <p className="text-xs text-gray-400 mt-1">{progressModal.description}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">上月工作进展</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="请填写上月实际完成的工作进展..."
                value={progressForm.last_progress}
                onChange={e => setProgressForm(f => ({ ...f, last_progress: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">本月工作目标</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="请填写本月计划完成的工作目标..."
                value={progressForm.this_target}
                onChange={e => setProgressForm(f => ({ ...f, this_target: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setProgressModal(null)}>取消</button>
              <button className="btn-primary" onClick={saveProgress} disabled={savingProgress}>
                {savingProgress ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}