import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { supabase, TABLES } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { getDueStatus, STATUS_LABELS } from "../lib/dueStatus"
import { getAiApiUrl } from "../lib/deepseek"
import { format } from "date-fns"
import { Plus, Search, Edit, FileText, Sparkles, Wand2, Trash2, Download } from "lucide-react"
import ConfidentialNotice from "../components/ConfidentialNotice";

function getFunctionUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-assign` }
function getAnalyzeUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-progress` }

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [progressModal, setProgressModal] = useState(null)
  const [progressForm, setProgressForm] = useState({ last_progress: "", this_target: "", progress: 0, status: "in_progress" })
  const [savingProgress, setSavingProgress] = useState(false)
  const [aiMatching, setAiMatching] = useState(false)
  const [aiMsg, setAiMsg] = useState("")
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [selfOnly, setSelfOnly] = useState(false)
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportMsg, setReportMsg] = useState("")
  const [sortField, setSortField] = useState("")
  const [sortDir, setSortDir] = useState("asc")

  const { user, isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let taskQuery = supabase.from(TABLES.TASKS).select("*").order("created_at", { ascending: false })
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        taskQuery = taskQuery.eq("department_id", userDeptId)
      }
      const [{ data: taskData }, { data: memberData }] = await Promise.all([
        taskQuery,
        supabase.from(TABLES.MEMBERS).select("*")
      ])
      setTasks(taskData || [])
      setMembers(memberData || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
  const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

  function getTaskCount(memberName) {
    if (!memberName) return 0
    return tasks.filter(t => { const wa = t.work_assignee || t.assignee || ""; const dl = t.dept_leader || ""; return wa === memberName || dl === memberName }).length
  }

  function exportToExcel() {
    const sourceTasks = selected.size > 0 ? sortedTasks.filter(t => selected.has(t.id)) : sortedTasks
    if (sourceTasks.length === 0) return
    const BOM = "\uFEFF"
    const headers = ["序号", "任务标题", "任务类型", "工作负责人", "部门负责人", "优先级", "状态", "进度%", "Q1目标", "Q2目标", "Q3目标", "Q4目标", "上月工作目标", "上月工作进展", "本月工作目标", "截止日期", "任务描述"]
    const rows = sourceTasks.map((t, i) => [
      i + 1,
      t.title,
      t.is_key ? "重点任务" : "日常任务",
      t.work_assignee || t.assignee || "",
      t.dept_leader || "",
      t.priority || "",
      STATUS_LABELS[t.status] || t.status || "",
      (t.progress || 0) + "%",
      t.q1_target || "",
      t.q2_target || "",
      t.q3_target || "",
      t.q4_target || "",
      t.last_month_target || "",
      t.last_month_progress || "",
      t.this_month_target || "",
      t.due_date || "",
      (t.description || "").slice(0, 200)
    ])
    const csv = BOM + headers.join(",") + "\n" + rows.map(r => r.map(c => "\"" + String(c).replace(/"/g, "\"\"") + "\"").join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "任务列表_" + new Date().toISOString().slice(0, 10) + ".csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function generateMonthlyReport(month) {
    const sourceTasks = selected.size > 0 ? sortedTasks.filter(t => selected.has(t.id)) : sortedTasks
    if (sourceTasks.length === 0) { setReportMsg("请先选择任务"); return }
    setReportGenerating(true)
    setReportMsg("正在生成月报...")
    try {
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const tasksData = sourceTasks.map(t => ({
        title: t.title,
        is_key: t.is_key,
        progress: t.progress || 0,
        status: t.status,
        last_month_progress: t.last_month_progress || "",
        last_month_target: t.last_month_target || "",
        this_month_target: t.this_month_target || ""
      }))
      const resp = await fetch(funcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ tasks: tasksData, month, apiUrl: getAiApiUrl(), apiKey: localStorage.getItem("deepseek_api_key") || "" })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || "生成失败")
      // Download the Word doc
      const docContent = result.report || result.content || ""
      const blob = new Blob(["\uFEFF" + docContent], { type: "application/msword;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `工作月报_${month}_${new Date().toISOString().slice(0,10)}.doc`
      a.click()
      URL.revokeObjectURL(url)
      setReportMsg("月报已生成并下载")
      setTimeout(() => setReportMsg(""), 4000)
    } catch (err) {
      setReportMsg("生成失败: " + err.message)
    } finally { setReportGenerating(false) }
  }

  function sortTasks(taskList) {
    const list = [...taskList]
    if (!sortField) {
      list.sort((a, b) => {
        if (a.is_key && !b.is_key) return -1
        if (!a.is_key && b.is_key) return 1
        return 0
      })
      return list
    }
    list.sort((a, b) => {
      let va, vb
      switch (sortField) {
        case "type": va = a.is_key ? 1 : 2; vb = b.is_key ? 1 : 2; break
        case "title": va = a.title || ""; vb = b.title || ""; break
        case "last_month_target": va = a.last_month_target || ""; vb = b.last_month_target || ""; break
        case "work_assignee": va = a.work_assignee || a.assignee || ""; vb = b.work_assignee || b.assignee || ""; break
        case "dept_leader": va = a.dept_leader || ""; vb = b.dept_leader || ""; break
        case "due_date": va = a.due_date || ""; vb = b.due_date || ""; break
        case "status": va = a.status || ""; vb = b.status || ""; break
        case "progress": va = a.progress || 0; vb = b.progress || 0; break
        default: return 0
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1
      if (va > vb) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return list
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  function SortArrow({ field }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  const sortedTasks = sortTasks(tasks)

  async function handleAiBatchMatch() {
    setAiMatching(true); setAiMsg("正在调用 AI 分析...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getFunctionUrl(), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          tasks: tasks.map(t => ({ id: t.id, title: t.title, description: t.description || "", work_assignee: t.work_assignee || t.assignee || "", dept_leader: t.dept_leader || "" })),
          deptLeaders: deptLeaders.map(m => ({ name: m.name, role: m.role, skills: m.skills, task_count: getTaskCount(m.name) })),
          workMembers: workMembers.map(m => ({ name: m.name, role: m.role, skills: m.skills, task_count: getTaskCount(m.name) })),
          apiUrl
        })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.warning || result.error || "匹配失败")
      const assignments = result.assignments || []
      if (assignments.length === 0) { setAiMsg("未获得 AI 匹配结果"); return }
      setAiMsg(`AI 返回 ${assignments.length} 条匹配，正在更新...`)
      let updated = 0
      for (const a of assignments) {
        const task = tasks[a.taskIndex]; if (!task) continue
        const update = {}
        if (a.work_assignee) update.work_assignee = a.work_assignee
        if (a.dept_leader) update.dept_leader = a.dept_leader
        if (Object.keys(update).length === 0) continue
        const { error } = await supabase.from(TABLES.TASKS).update(update).eq("id", task.id)
        if (!error) updated++
      }
      setAiMsg(`完成：已更新 ${updated} 项任务的负责人`)
      loadData()
    } catch (err) { setAiMsg(`AI 匹配失败：${err.message}`) }
    finally { setAiMatching(false); setTimeout(() => setAiMsg(""), 5000) }
  }

  function toggleSelect(taskId) {
    const next = new Set(selected)
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId)
    setSelected(next)
  }

  function toggleSelectAll() {
    const visibleIds = filteredTasks.map(t => t.id)
    if (visibleIds.every(id => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visibleIds))
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const ids = Array.from(selected)
      await supabase.from(TABLES.TASKS).delete().in("id", ids)
      setSelected(new Set())
      loadData()
    } catch (err) { console.error(err) }
    finally { setDeleting(false) }
  }

  const filteredTasks = sortedTasks.filter(t => {
    if (filter === "overdue" && t.status !== "completed" && getDueStatus(t.due_date) !== "overdue") return false
    if (filter === "near-due" && t.status !== "completed" && getDueStatus(t.due_date) !== "near-due") return false
    if (filter === "completed" && t.status !== "completed") return false
    if (filter === "active" && t.status === "completed") return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    if (selfOnly) {
      const memberName = members.find(m => m.user_id === user?.id)?.name
      if (!memberName) return false
      const wa = t.work_assignee || t.assignee || ""
      const dl = t.dept_leader || ""
      if (wa !== memberName && dl !== memberName) return false
    }
    return true
  })

  const filters = [
    { key: "all", label: "全部" }, { key: "active", label: "进行中" },
    { key: "overdue", label: "已逾期" }, { key: "near-due", label: "临近截止" }, { key: "completed", label: "已完成" },
  ]

  function openProgressModal(task) {
    setProgressModal(task)
    setProgressForm({
      last_progress: task.last_month_progress || "",
      this_target: task.this_month_target || "",
      progress: task.progress || 0,
      status: task.status || "in_progress"
    })
  }

  async function handleAiAnalyzeProgress() {
    if (!progressForm.last_progress && !progressForm.this_target) return
    setAiAnalyzing(true)
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getAnalyzeUrl(), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          taskTitle: progressModal.title,
          lastProgress: progressForm.last_progress,
          thisTarget: progressForm.this_target,
          apiUrl
        })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || "分析失败")
      if (result.progress !== undefined) {
        setProgressForm(f => ({ ...f, progress: Math.min(100, Math.max(0, result.progress)) }))
      }
      if (result.status) {
        setProgressForm(f => ({ ...f, status: result.status }))
      }
      if (result.suggestion) {
        setAiMsg(`AI 建议：${result.suggestion}`)
        setTimeout(() => setAiMsg(""), 5000)
      }
    } catch (err) {
      console.error("AI analyze failed:", err)
    } finally {
      setAiAnalyzing(false)
    }
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
        progress: progressForm.progress,
        status: progressForm.status,
        progress_month: month
      }
      if (prevTarget) updateData.last_month_target = prevTarget
      await supabase.from(TABLES.TASKS).update(updateData).eq("id", progressModal.id)
      setProgressModal(null)
      loadData()
    } catch (err) { console.error(err) }
    finally { setSavingProgress(false) }
  }

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  const unassignedCount = tasks.filter(t => !t.work_assignee && !t.assignee && !t.dept_leader).length

  return (
    <div className="space-y-6">
      <ConfidentialNotice />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">任务列表</h2>
          <button onClick={handleAiBatchMatch} disabled={aiMatching || tasks.length === 0} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50" title="AI 自动匹配并修正工作负责人和部门负责人">
            <Sparkles size={16} className={aiMatching ? "animate-pulse text-blue-500" : "text-blue-500"} /> AI 校验修正
          </button>
        </div>
        <Link to="/tasks/new" className="btn-primary flex items-center gap-2"><Plus size={18} /> 新建任务</Link>
      </div>

      {reportMsg && (
        <div className={`text-sm p-3 rounded-lg ${reportMsg.includes("失败") ? "bg-red-50 text-red-600" : reportMsg.includes("生成中") ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{reportMsg}</div>
      )}
      {aiMsg && (
        <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {aiMatching && <Sparkles size={14} className="inline animate-pulse mr-1" />}{aiMsg}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-9" placeholder="搜索任务..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {!isAdmin && !isDeptAdmin && (
            <button onClick={() => setSelfOnly(!selfOnly)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selfOnly ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              仅本人
            </button>
          )}
          {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f.key ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f.label}</button>
        ))}</div>
        {selected.size > 0 && (
        <button onClick={deleteSelected} disabled={deleting} className="btn-primary !bg-red-600 hover:!bg-red-700 flex items-center gap-2 text-sm">
          <Trash2 size={16} /> {deleting ? "删除中..." : `删除选中 (${selected.size})`}
        </button>
      )}
      {unassignedCount > 0 && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">{unassignedCount} 项未分配负责人</span>}
        <button onClick={exportToExcel} className="btn-secondary flex items-center gap-2 text-sm"><Download size={16} /> 导出Excel</button>
        <button onClick={() => generateMonthlyReport("current")} disabled={reportGenerating} className="btn-secondary flex items-center gap-2 text-sm" title="生成当月选中任务的月度报告"><FileText size={16} /> {reportGenerating ? "生成中..." : "当月月报"}</button>
        <button onClick={() => generateMonthlyReport("last")} disabled={reportGenerating} className="btn-secondary flex items-center gap-2 text-sm" title="生成上月选中任务的月度报告"><FileText size={16} /> {reportGenerating ? "生成中..." : "上月月报"}</button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium w-8">
                  <input type="checkbox" className="accent-blue-600" checked={filteredTasks.length > 0 && filteredTasks.every(t => selected.has(t.id))} onChange={toggleSelectAll} />
                </th>
                <th className="pb-2 font-medium cursor-pointer select-none" onClick={() => toggleSort("type")}>任务类型<SortArrow field="type" /></th>
                <th className="pb-2 font-medium cursor-pointer select-none" onClick={() => toggleSort("title")}>任务名称<SortArrow field="title" /></th>
                <th className="pb-2 font-medium whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("last_month_target")}>上月工作目标<SortArrow field="last_month_target" /></th>
                <th className="pb-2 font-medium whitespace-nowrap">Q1目标</th>
                <th className="pb-2 font-medium whitespace-nowrap">Q2目标</th>
                <th className="pb-2 font-medium whitespace-nowrap">Q3目标</th>
                <th className="pb-2 font-medium whitespace-nowrap">Q4目标</th>
                <th className="pb-2 font-medium whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("work_assignee")}>工作负责人<SortArrow field="work_assignee" /></th>
                <th className="pb-2 font-medium whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("dept_leader")}>部门负责人<SortArrow field="dept_leader" /></th>
                <th className="pb-2 font-medium whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("due_date")}>截止日期<SortArrow field="due_date" /></th>
                <th className="pb-2 font-medium cursor-pointer select-none" onClick={() => toggleSort("status")}>状态<SortArrow field="status" /></th>
                <th className="pb-2 font-medium cursor-pointer select-none" onClick={() => toggleSort("progress")}>进度<SortArrow field="progress" /></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const status = getDueStatus(task.due_date)
                const workAssignee = task.work_assignee || task.assignee || ""
                const deptLeader = task.dept_leader || ""
                const lastMonthTarget = task.last_month_target || ""
                const isUnassigned = !workAssignee && !deptLeader
                const isChecked = selected.has(task.id)
                return (
                  <tr key={task.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isChecked ? "bg-blue-50/50" : ""} ${isUnassigned ? "bg-orange-50/30" : ""} ${task.is_key ? "bg-gradient-to-r from-blue-50/30" : ""}`}>
                    <td className="py-2.5 pl-2">
                      <input type="checkbox" className="accent-blue-600" checked={isChecked} onChange={() => toggleSelect(task.id)} />
                    </td>
                    <td className="py-2.5">
                      <span className={`badge text-xs ${task.is_key ? "badge-blue" : "badge-gray"}`}>
                        {task.is_key ? "重点任务" : "日常任务"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{task.title}</div>
                          {task.description && <div className="text-xs text-gray-400 mt-0.5">{task.description.slice(0, 60)}</div>}
                        {(task.q1_target || task.q2_target || task.q3_target || task.q4_target) && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {task.q1_target && <span className="text-xs bg-purple-50 text-purple-600 px-1 rounded" title={task.q1_target}>Q1: {task.q1_target.slice(0,20)}{task.q1_target.length>20?'...':''}</span>}
                            {task.q2_target && <span className="text-xs bg-purple-50 text-purple-600 px-1 rounded" title={task.q2_target}>Q2: {task.q2_target.slice(0,20)}{task.q2_target.length>20?'...':''}</span>}
                            {task.q3_target && <span className="text-xs bg-purple-50 text-purple-600 px-1 rounded" title={task.q3_target}>Q3: {task.q3_target.slice(0,20)}{task.q3_target.length>20?'...':''}</span>}
                            {task.q4_target && <span className="text-xs bg-purple-50 text-purple-600 px-1 rounded" title={task.q4_target}>Q4: {task.q4_target.slice(0,20)}{task.q4_target.length>20?'...':''}</span>}
                          </div>
                        )}
                        </div>
                        <Link to={`/tasks/${task.id}/edit`} className="text-blue-500 hover:text-blue-700 shrink-0" title="编辑任务"><Edit size={14} /></Link>
                      </div>
                    </td>
                    <td className="py-2.5"><span className="text-xs text-gray-600 whitespace-pre-wrap max-w-40 block truncate">{lastMonthTarget || "-"}</span></td>
                    <td className="py-2.5">
                      <span className="text-xs text-purple-700 whitespace-pre-wrap" title={task.q1_target || ""}>{task.q1_target ? task.q1_target.slice(0,30) + (task.q1_target.length>30?"...":"") : "-"}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-purple-700 whitespace-pre-wrap" title={task.q2_target || ""}>{task.q2_target ? task.q2_target.slice(0,30) + (task.q2_target.length>30?"...":"") : "-"}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-purple-700 whitespace-pre-wrap" title={task.q3_target || ""}>{task.q3_target ? task.q3_target.slice(0,30) + (task.q3_target.length>30?"...":"") : "-"}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-purple-700 whitespace-pre-wrap" title={task.q4_target || ""}>{task.q4_target ? task.q4_target.slice(0,30) + (task.q4_target.length>30?"...":"") : "-"}</span>
                    </td>
                    <td className="py-2.5"><span className={`text-sm ${!workAssignee ? "text-orange-500 font-medium" : ""}`}>{workAssignee || "未分配"}</span></td>
                    <td className="py-2.5"><span className={`text-sm ${!deptLeader ? "text-orange-500 font-medium" : ""}`}>{deptLeader || "未分配"}</span></td>
                    <td className="py-2.5 whitespace-nowrap">{task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "-"}</td>
                    <td className="py-2.5">
                      <span className={`${task.status === "completed" ? "badge-green" : status === "overdue" ? "badge-red" : status === "near-due" ? "badge-yellow" : "badge-green"} inline-block`}>
                        {task.status === "completed" ? "已完成" : STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${task.status === "completed" ? "bg-green-500" : (task.progress || 0) > 70 ? "bg-blue-500" : (task.progress || 0) > 30 ? "bg-yellow-500" : "bg-gray-400"}`} style={{ width: `${task.progress || 0}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{task.progress || 0}%</span>
                      </div>
                      <button onClick={() => openProgressModal(task)} className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1"><FileText size={12} /> 填写进展/目标</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress & Target Modal */}
      {progressModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setProgressModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">填写工作进展与目标</h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700">{progressModal.title}</p>
              {progressModal.description && <p className="text-xs text-gray-400 mt-1">{progressModal.description}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">上月工作进展</label>
              <textarea className="input-field" rows={3} placeholder="请填写上月实际完成的工作进展..." value={progressForm.last_progress} onChange={e => setProgressForm(f => ({ ...f, last_progress: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">本月工作目标</label>
              <textarea className="input-field" rows={3} placeholder="请填写本月计划完成的工作目标..." value={progressForm.this_target} onChange={e => setProgressForm(f => ({ ...f, this_target: e.target.value }))} />
            </div>

            {/* AI Analyze Button */}
            <button onClick={handleAiAnalyzeProgress} disabled={aiAnalyzing || (!progressForm.last_progress && !progressForm.this_target)} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 w-full justify-center">
              <Wand2 size={16} className={aiAnalyzing ? "animate-pulse text-purple-500" : "text-purple-500"} />
              {aiAnalyzing ? "AI 分析中..." : "AI 自动分析进度与状态"}
            </button>

            {/* Progress Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">完成进度 ({progressForm.progress}%)</label>
              <input type="range" min="0" max="100" value={progressForm.progress} onChange={e => setProgressForm(f => ({ ...f, progress: Number(e.target.value) }))} className="w-full accent-blue-700" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">任务状态</label>
              <div className="flex gap-2">
                {[{ value: "pending", label: "待开始" }, { value: "in_progress", label: "进行中" }, { value: "completed", label: "已完成" }].map(s => (
                  <button key={s.value} type="button" onClick={() => setProgressForm(f => ({ ...f, status: s.value }))} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${progressForm.status === s.value ? s.value === "completed" ? "bg-green-100 text-green-700 border border-green-300" : s.value === "in_progress" ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-gray-200 text-gray-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>{s.label}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setProgressModal(null)}>取消</button>
              <button className="btn-primary" onClick={saveProgress} disabled={savingProgress}>{savingProgress ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}