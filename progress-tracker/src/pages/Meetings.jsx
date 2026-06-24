import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { getAiApiUrl } from "../lib/deepseek"
import { Search, Sparkles, Trash2, Download, CheckCircle } from "lucide-react"
import ConfidentialNotice from "../components/ConfidentialNotice";

function getBatchAssignUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-assign` }

const STATUS_LABELS = { pending: "待开始", in_progress: "进行中", completed: "已完成" }

export default function Meetings() {
  const [meetings, setMeetings] = useState([])
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [aiMatching, setAiMatching] = useState(false)
  const [aiMsg, setAiMsg] = useState("")
  const { user, isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let query = supabase.from("meetings").select("*").order("created_at", { ascending: false })
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        query = query.eq("department_id", userDeptId)
      }
      const [{ data: meetingData }, { data: memberData }] = await Promise.all([
        query,
        supabase.from("department_members").select("*")
      ])
      setMeetings(meetingData || [])
      setMembers(memberData || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
  const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

  function getTaskCount(memberName) {
    if (!memberName) return 0
    return meetings.filter(m => (m.work_assignee || m.assignee || "") === memberName || (m.dept_leader || "") === memberName).length
  }

  function toggleSelect(id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function toggleSelectAll() {
    const ids = filteredMeetings.map(m => m.id)
    ids.every(id => selected.has(id)) ? setSelected(new Set()) : setSelected(new Set(ids))
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await supabase.from("meetings").delete().in("id", Array.from(selected))
      setSelected(new Set())
      loadData()
    } catch (err) { console.error(err) }
    finally { setDeleting(false) }
  }

  async function handleAiBatchMatch() {
    setAiMatching(true); setAiMsg("正在调用 AI 分析...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getBatchAssignUrl(), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          tasks: meetings.map(m => ({ id: m.id, title: m.meeting_name + " - " + (m.task_description || ""), description: m.task_description || "", work_assignee: m.work_assignee || m.assignee || "", dept_leader: m.dept_leader || "" })),
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
        const meeting = meetings[a.taskIndex]; if (!meeting) continue
        const update = {}
        if (a.work_assignee) update.work_assignee = a.work_assignee
        if (a.dept_leader) update.dept_leader = a.dept_leader
        if (Object.keys(update).length === 0) continue
        const { error } = await supabase.from("meetings").update(update).eq("id", meeting.id)
        if (!error) updated++
      }
      setAiMsg(`完成：已更新 ${updated} 项会议任务的负责人`)
      loadData()
    } catch (err) { setAiMsg(`AI 匹配失败：${err.message}`) }
    finally { setAiMatching(false); setTimeout(() => setAiMsg(""), 5000) }
  }

  function exportToExcel() {
    const source = selected.size > 0 ? meetings.filter(m => selected.has(m.id)) : meetings
    if (source.length === 0) return
    const BOM = "\uFEFF"
    const headers = ["序号", "会议名称", "会议时间", "部门任务", "工作负责人", "部门负责人", "状态"]
    const rows = source.map((m, i) => [
      i + 1, m.meeting_name, m.meeting_date || "", m.task_description || "",
      m.work_assignee || m.assignee || "", m.dept_leader || "",
      STATUS_LABELS[m.status] || m.status || "待开始"
    ])
    const csv = BOM + headers.join(",") + "\n" + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "会议任务列表_" + new Date().toISOString().slice(0, 10) + ".csv"
    a.click(); URL.revokeObjectURL(url)
  }

  const filteredMeetings = meetings.filter(m => {
    if (filter === "completed" && m.status !== "completed") return false
    if (filter === "active" && m.status === "completed") return false
    if (search) {
      const s = search.toLowerCase()
      const fields = [m.meeting_name, m.task_description, m.work_assignee, m.assignee, m.dept_leader, m.meeting_date]
      if (!fields.some(f => (f || "").toLowerCase().includes(s))) return false
    }
    return true
  })

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  const unassignedCount = meetings.filter(m => !m.work_assignee && !m.assignee && !m.dept_leader).length

  return (
    <div className="space-y-6">
      <ConfidentialNotice />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">会议列表</h2>
          <button onClick={handleAiBatchMatch} disabled={aiMatching || meetings.length === 0} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50" title="AI 自动匹配并修正工作负责人和部门负责人">
            <Sparkles size={16} className={aiMatching ? "animate-pulse text-blue-500" : "text-blue-500"} /> AI 校验修正
          </button>
        </div>
      </div>

      {aiMsg && (
        <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {aiMatching && <Sparkles size={14} className="inline animate-pulse mr-1" />}{aiMsg}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-9" placeholder="搜索会议..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[
            { key: "all", label: "全部" }, { key: "active", label: "进行中" }, { key: "completed", label: "已完成" }
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f.key ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f.label}</button>
          ))}
        </div>
        {selected.size > 0 && (
          <button onClick={deleteSelected} disabled={deleting} className="btn-primary !bg-red-600 hover:!bg-red-700 flex items-center gap-2 text-sm">
            <Trash2 size={16} /> {deleting ? "删除中..." : `删除选中 (${selected.size})`}
          </button>
        )}
        {unassignedCount > 0 && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">{unassignedCount} 项未分配负责人</span>}
        <button onClick={exportToExcel} className="btn-secondary flex items-center gap-2 text-sm"><Download size={16} /> 导出Excel</button>
      </div>

      {filteredMeetings.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的会议任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs">
                <th className="pb-2 font-medium w-8">
                  <input type="checkbox" className="accent-blue-600" checked={filteredMeetings.length > 0 && filteredMeetings.every(m => selected.has(m.id))} onChange={toggleSelectAll} />
                </th>
                <th className="pb-2 font-medium">会议名称</th>
                <th className="pb-2 font-medium w-24">会议时间</th>
                <th className="pb-2 font-medium">部门任务</th>
                <th className="pb-2 font-medium w-20">工作负责人</th>
                <th className="pb-2 font-medium w-20">部门负责人</th>
                <th className="pb-2 font-medium w-16">状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map(meeting => {
                const workAssignee = meeting.work_assignee || meeting.assignee || ""
                const deptLeader = meeting.dept_leader || ""
                const isUnassigned = !workAssignee && !deptLeader
                const isChecked = selected.has(meeting.id)
                return (
                  <tr key={meeting.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isChecked ? "bg-blue-50/50" : ""} ${isUnassigned ? "bg-orange-50/30" : ""}`}>
                    <td className="py-2.5 pl-2">
                      <input type="checkbox" className="accent-blue-600" checked={isChecked} onChange={() => toggleSelect(meeting.id)} />
                    </td>
                    <td className="py-2.5 pr-2 font-medium whitespace-normal break-words">{meeting.meeting_name}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap text-xs">{meeting.meeting_date || "--"}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{meeting.task_description || ""}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{workAssignee || <span className="text-orange-400">未分配</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{deptLeader || <span className="text-gray-300">--</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${meeting.status === "completed" ? "bg-green-100 text-green-700" : meeting.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[meeting.status] || meeting.status || "待开始"}
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
  )
}
