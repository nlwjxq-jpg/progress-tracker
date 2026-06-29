import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { supabase, TABLES } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { getDueStatus, STATUS_LABELS } from "../lib/dueStatus"
import { getAiApiUrl } from "../lib/deepseek"
import { Plus, Search, Edit, FileText, Sparkles, Wand2, Trash2, Download } from "lucide-react"

function getFunctionUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-assign` }
function getAnalyzeUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-progress` }

const TASK_STATUS_LABELS = { pending: "待开始", in_progress: "进行中", completed: "已完成" }

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [goals, setGoals] = useState([])
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
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const [quarterModal, setQuarterModal] = useState(null)
  const [sortKey, setSortKey] = useState("is_key")
  const [sortOrder, setSortOrder] = useState("asc")

  const { user, isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let taskQuery = supabase.from(TABLES.TASKS).select("*").order("created_at", { ascending: false })
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        taskQuery = taskQuery.eq("department_id", userDeptId)
      }
      const [{ data: taskData }, { data: memberData }, { data: goalData }] = await Promise.all([
        taskQuery,
        supabase.from(TABLES.MEMBERS).select("*"),
        supabase.from("goals").select("*")
      ])
      setTasks(taskData || [])
      setMembers(memberData || [])
      setGoals(goalData || [])
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
    const headers = ["序号", "任务类别", "考核目标", "具体任务", "截止日期", "状态", "工作责任人", "部门负责人", "一季度", "二季度", "三季度", "四季度", "上月工作目标", "上月工作进展", "本月工作目标", "进度%"]
    const rows = sourceTasks.map((t, i) => [
      i + 1,
      t.category || "",
      t.assessment_target || "",
      t.title,
      t.due_date || "",
      TASK_STATUS_LABELS[t.status] || t.status || "",
      t.work_assignee || t.assignee || "",
      t.dept_leader || "",
      t.q1_target || "",
      t.q2_target || "",
      t.q3_target || "",
      t.q4_target || "",
      t.last_month_target || "",
      t.last_month_progress || "",
      t.this_month_target || "",
      (t.progress || 0) + "%"
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

  async function generateAnnualSummary() {
    const sourceTasks = selected.size > 0 ? sortedTasks.filter(t => selected.has(t.id)) : sortedTasks
    if (sourceTasks.length === 0) { setReportMsg("请先选择任务"); return }
    setSummaryGenerating(true)
    setReportMsg("正在生成全年总结...")
    try {
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-summary`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const tasksData = sourceTasks.map(t => ({
        title: t.title,
        is_key: t.is_key,
        assessment_target: t.assessment_target || "",
        progress: t.progress || 0,
        status: t.status,
        q1_target: t.q1_target || "",
        q2_target: t.q2_target || "",
        q3_target: t.q3_target || "",
        q4_target: t.q4_target || "",
        last_month_progress: t.last_month_progress || "",
        last_month_target: t.last_month_target || "",
        this_month_target: t.this_month_target || ""
      }))
      const resp = await fetch(funcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ tasks: tasksData, apiUrl: getAiApiUrl(), apiKey: localStorage.getItem("deepseek_api_key") || "" })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || "生成失败")
      const docContent = result.report || result.content || ""
      const blob = new Blob(["\uFEFF" + docContent], { type: "application/msword;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `年度工作总结_${new Date().getFullYear()}_${new Date().toISOString().slice(0,10)}.doc`
      a.click()
      URL.revokeObjectURL(url)
      setReportMsg("全年总结已生成并下载")
      setTimeout(() => setReportMsg(""), 4000)
    } catch (err) {
      setReportMsg("生成失败: " + err.message)
    } finally { setSummaryGenerating(false) }
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

  function toggleSort(column) {
    if (sortKey === column) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortKey(column)
      setSortOrder("asc")
    }
  }

  function getSortIcon(column) {
    if (sortKey !== column) return <span className="inline-block w-3 text-gray-300">↕</span>
    return sortOrder === "asc" ? <span className="inline-block w-3 text-blue-600">▲</span> : <span className="inline-block w-3 text-blue-600">▼</span>
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    // Always sort key tasks first
    if (a.is_key && !b.is_key) return -1
    if (!a.is_key && b.is_key) return 1
    // If both same type, apply user-chosen sort
    if (sortKey === "is_key") return 0
    const dir = sortOrder === "asc" ? 1 : -1
    const va = (a[sortKey] ?? "").toString().toLowerCase()
    const vb = (b[sortKey] ?? "").toString().toLowerCase()
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })

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
    if (search) {
      const s = search.toLowerCase()
      const fields = [
        t.title, t.description, t.assessment_target, t.category,
        t.work_assignee, t.assignee, t.dept_leader,
        t.q1_target, t.q2_target, t.q3_target, t.q4_target,
        t.last_month_target, t.last_month_progress, t.this_month_target
      ]
      if (!fields.some(f => (f || "").toLowerCase().includes(s))) return false
    }
    return true
  })

  const filters = [
    { key: "all", label: "全部" }, { key: "active", label: "进行中" },
    { key: "overdue", label: "已逾期" }, { key: "near-due", label: "临近截止" }, { key: "completed", label: "已完成" },
  ]

  function openQuarterModal(task) {
    setQuarterModal({ id: task.id, title: task.title, q1: task.q1_target||"", q2: task.q2_target||"", q3: task.q3_target||"", q4: task.q4_target||"" })
  }

  async function saveQuarterModal() {
    if (!quarterModal) return
    try {
      await supabase.from(TABLES.TASKS).update({
        q1_target: quarterModal.q1 || null,
        q2_target: quarterModal.q2 || null,
        q3_target: quarterModal.q3 || null,
        q4_target: quarterModal.q4 || null
      }).eq("id", quarterModal.id)
      setQuarterModal(null)
      loadData()
    } catch (e) { alert("保存失败: " + e.message) }
  }

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
        <div className={`text-sm p-3 rounded-lg ${reportMsg.includes("失败") ? "bg-red-50 text-red-600" : reportMsg.includes("中") ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{reportMsg}</div>
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
        <button onClick={generateAnnualSummary} disabled={summaryGenerating} className="btn-secondary flex items-center gap-2 text-sm" title="AI生成选中任务的年度工作总结报告"><FileText size={16} /> {summaryGenerating ? "生成中..." : "全年总结"}</button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs">
                <th className="pb-2 font-medium w-8">
                  <input type="checkbox" className="accent-blue-600" checked={filteredTasks.length > 0 && filteredTasks.every(t => selected.has(t.id))} onChange={toggleSelectAll} />
                </th>
                <th className="pb-2 font-medium w-20 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("category")}>任务类别{getSortIcon("category")}</th>
                <th className="pb-2 font-medium w-32 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("assessment_target")}>考核目标{getSortIcon("assessment_target")}</th>
                <th className="pb-2 font-medium w-40 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("title")}>具体任务{getSortIcon("title")}</th>
                <th className="pb-2 font-medium w-20 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("due_date")}>截止日期{getSortIcon("due_date")}</th>
                <th className="pb-2 font-medium w-16 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("status")}>状态{getSortIcon("status")}</th>
                <th className="pb-2 font-medium w-16 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("work_assignee")}>工作<br/>责任人{getSortIcon("work_assignee")}</th>
                <th className="pb-2 font-medium w-16 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("dept_leader")}>部门<br/>负责人{getSortIcon("dept_leader")}</th>
                <th className="pb-2 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("q1_target")}>一季度{getSortIcon("q1_target")}</th>
                <th className="pb-2 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("q2_target")}>二季度{getSortIcon("q2_target")}</th>
                <th className="pb-2 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("q3_target")}>三季度{getSortIcon("q3_target")}</th>
                <th className="pb-2 font-medium w-24 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("q4_target")}>四季度{getSortIcon("q4_target")}</th>
                <th className="pb-2 font-medium w-28 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("last_month_target")}>上月工作目标{getSortIcon("last_month_target")}</th>
                <th className="pb-2 font-medium w-16 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("progress")}>进度{getSortIcon("progress")}</th>
                <th className="pb-2 font-medium w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const status = getDueStatus(task.due_date)
                const workAssignee = task.work_assignee || task.assignee || ""
                const deptLeader = task.dept_leader || ""
                const isUnassigned = !workAssignee && !deptLeader
                const isChecked = selected.has(task.id)
                return (
                  <tr key={task.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isChecked ? "bg-blue-50/50" : ""} ${isUnassigned ? "bg-orange-50/30" : ""} ${task.is_key ? "bg-gradient-to-r from-blue-50/30" : ""}`}>
                    <td className="py-2.5 pl-2">
                      <input type="checkbox" className="accent-blue-600" checked={isChecked} onChange={() => toggleSelect(task.id)} />
                    </td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words">
                      {task.is_key ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">重点</span> : <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mr-1">日常</span>}
                      {task.category || ""}
                    </td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{task.assessment_target || ""}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words">
                      <Link to={`/tasks/${task.id}/edit`} className="text-blue-700 hover:underline font-medium">{task.title}</Link>
                      {task.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{task.description}</p>}
                    </td>
                    <td className="py-2.5 pr-2 whitespace-nowrap text-xs">
                      {task.due_date ? <span className={`${status === "overdue" ? "text-red-600 font-medium" : status === "near-due" ? "text-orange-600" : "text-gray-600"}`}>{task.due_date}</span> : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${task.status === "completed" ? "bg-green-100 text-green-700" : task.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{TASK_STATUS_LABELS[task.status] || task.status || "待开始"}</span>
                    </td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{workAssignee || <span className="text-orange-400">未分配</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{deptLeader || <span className="text-gray-300">--</span>}</td>
                    <td className="py-2.5 pr-2">
                      <button onClick={() => openQuarterModal(task)} className="text-left text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer whitespace-normal break-words w-full" title="点击编辑Q1目标">
                        {task.q1_target ? task.q1_target.slice(0, 50) + (task.q1_target.length > 50 ? "..." : "") : <span className="text-gray-300 italic">点击设置</span>}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2">
                      <button onClick={() => openQuarterModal(task)} className="text-left text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer whitespace-normal break-words w-full" title="点击编辑Q2目标">
                        {task.q2_target ? task.q2_target.slice(0, 50) + (task.q2_target.length > 50 ? "..." : "") : <span className="text-gray-300 italic">点击设置</span>}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2">
                      <button onClick={() => openQuarterModal(task)} className="text-left text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer whitespace-normal break-words w-full" title="点击编辑Q3目标">
                        {task.q3_target ? task.q3_target.slice(0, 50) + (task.q3_target.length > 50 ? "..." : "") : <span className="text-gray-300 italic">点击设置</span>}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2">
                      <button onClick={() => openQuarterModal(task)} className="text-left text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer whitespace-normal break-words w-full" title="点击编辑Q4目标">
                        {task.q4_target ? task.q4_target.slice(0, 50) + (task.q4_target.length > 50 ? "..." : "") : <span className="text-gray-300 italic">点击设置</span>}
                      </button>
                    </td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{task.last_month_target || <span className="text-gray-300">--</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${(task.progress || 0) >= 100 ? "bg-green-500" : (task.progress || 0) >= 50 ? "bg-blue-500" : "bg-yellow-500"}`} style={{ width: `${task.progress || 0}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8">{task.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Link to={`/tasks/${task.id}/edit`} className="p-1 hover:bg-gray-200 rounded transition-colors" title="编辑任务"><Edit size={14} /></Link>
                        <button onClick={() => openProgressModal(task)} className="p-1 hover:bg-blue-100 rounded transition-colors text-blue-600" title="填写进展/目标"><FileText size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress/Status Modal */}
      {progressModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setProgressModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">填写进展 / 目标</h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700">{progressModal.title}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">上月工作进展</label>
              <textarea className="input-field" rows={3} placeholder="请填写上月实际完成的工作进展..." value={progressForm.last_progress} onChange={e => setProgressForm(f => ({ ...f, last_progress: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">本月工作目标</label>
              <textarea className="input-field" rows={3} placeholder="请填写本月计划完成的工作目标..." value={progressForm.this_target} onChange={e => setProgressForm(f => ({ ...f, this_target: e.target.value }))} />
            </div>

            <button onClick={handleAiAnalyzeProgress} disabled={aiAnalyzing || (!progressForm.last_progress && !progressForm.this_target)} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 w-full justify-center">
              <Wand2 size={16} className={aiAnalyzing ? "animate-pulse text-purple-500" : "text-purple-500"} />
              {aiAnalyzing ? "AI 分析中..." : "AI 自动分析进度与状态"}
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">完成进度 ({progressForm.progress}%)</label>
              <input type="range" min="0" max="100" value={progressForm.progress} onChange={e => setProgressForm(f => ({ ...f, progress: Number(e.target.value) }))} className="w-full accent-blue-700" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
            </div>

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

      {/* Quarter Edit Modal */}
      {quarterModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setQuarterModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">编辑季度目标</h3>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-sm font-medium text-gray-700">{quarterModal.title}</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-600 mb-1">一季度目标</label><textarea className="input-field" rows={4} value={quarterModal.q1} onChange={e => setQuarterModal(f => ({ ...f, q1: e.target.value }))} placeholder="Q1" /></div>
              <div><label className="block text-sm font-medium text-gray-600 mb-1">二季度目标</label><textarea className="input-field" rows={4} value={quarterModal.q2} onChange={e => setQuarterModal(f => ({ ...f, q2: e.target.value }))} placeholder="Q2" /></div>
              <div><label className="block text-sm font-medium text-gray-600 mb-1">三季度目标</label><textarea className="input-field" rows={4} value={quarterModal.q3} onChange={e => setQuarterModal(f => ({ ...f, q3: e.target.value }))} placeholder="Q3" /></div>
              <div><label className="block text-sm font-medium text-gray-600 mb-1">四季度目标</label><textarea className="input-field" rows={4} value={quarterModal.q4} onChange={e => setQuarterModal(f => ({ ...f, q4: e.target.value }))} placeholder="Q4" /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2"><button className="btn-secondary" onClick={() => setQuarterModal(null)}>取消</button><button className="btn-primary" onClick={saveQuarterModal}>保存全部</button></div>
          </div>
        </div>
      )}
    </div>
  )
}