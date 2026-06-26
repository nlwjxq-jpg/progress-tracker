import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { getAiApiUrl } from "../lib/deepseek"
import { Search, Sparkles, Trash2, Download, Plus, Edit, Save } from "lucide-react"
import ConfidentialNotice from "../components/ConfidentialNotice";

function getBatchAssignUrl() { return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-assign` }

const STATUS_LABELS = { pending: "待开始", in_progress: "进行中", completed: "已完成" }
const STATUS_OPTIONS = [
  { value: "pending", label: "待开始" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" }
]

export default function Policies() {
  const [policies, setPolicies] = useState([])
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [aiMatching, setAiMatching] = useState(false)
  const [aiMsg, setAiMsg] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [addForm, setAddForm] = useState({ policy_name: "", deadline: "", task_description: "", assignee: "", status: "pending" })
  const [editForm, setEditForm] = useState({ policy_name: "", deadline: "", task_description: "", work_assignee: "", dept_leader: "", status: "pending" })
  const [saving, setSaving] = useState(false)
  const { user, isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      let query = supabase.from("policies").select("*").order("created_at", { ascending: false })
      if (!isAdmin && !isDeptAdmin && userDeptId) {
        query = query.eq("department_id", userDeptId)
      }
      const [{ data: policyData }, { data: memberData }] = await Promise.all([
        query,
        supabase.from("department_members").select("*")
      ])
      setPolicies(policyData || [])
      setMembers(memberData || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
  const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

  function getTaskCount(memberName) {
    if (!memberName) return 0
    return policies.filter(p => (p.work_assignee || p.assignee || "") === memberName || (p.dept_leader || "") === memberName).length
  }

  function toggleSelect(id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function toggleSelectAll() {
    const ids = filteredPolicies.map(p => p.id)
    ids.every(id => selected.has(id)) ? setSelected(new Set()) : setSelected(new Set(ids))
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await supabase.from("policies").delete().in("id", Array.from(selected))
      setSelected(new Set())
      loadData()
    } catch (err) { console.error(err) }
    finally { setDeleting(false) }
  }

  async function handleAddPolicy() {
    if (!addForm.policy_name.trim()) return
    setSaving(true)
    try {
      await supabase.from("policies").insert({
        policy_name: addForm.policy_name.trim(),
        deadline: addForm.deadline || null,
        task_description: addForm.task_description,
        assignee: addForm.assignee,
        status: addForm.status,
        department_id: userDeptId || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      })
      setShowAddModal(false)
      setAddForm({ policy_name: "", deadline: "", task_description: "", assignee: "", status: "pending" })
      loadData()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  function openEditModal(policy) {
    setEditModal(policy.id)
    setEditForm({
      policy_name: policy.policy_name || "",
      deadline: policy.deadline || "",
      task_description: policy.task_description || "",
      work_assignee: policy.work_assignee || policy.assignee || "",
      dept_leader: policy.dept_leader || "",
      status: policy.status || "pending"
    })
  }

  async function saveEditModal() {
    if (!editModal || !editForm.policy_name.trim()) return
    setSaving(true)
    try {
      await supabase.from("policies").update({
        policy_name: editForm.policy_name.trim(),
        deadline: editForm.deadline || null,
        task_description: editForm.task_description,
        work_assignee: editForm.work_assignee,
        dept_leader: editForm.dept_leader,
        assignee: editForm.work_assignee,
        status: editForm.status,
        updated_at: new Date().toISOString()
      }).eq("id", editModal)
      setEditModal(null)
      loadData()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function handleAiBatchMatch() {
    setAiMatching(true); setAiMsg("正在调用 AI 分析...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getBatchAssignUrl(), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          tasks: policies.map(p => ({ id: p.id, title: p.policy_name, description: p.task_description || "", work_assignee: p.work_assignee || p.assignee || "", dept_leader: p.dept_leader || "" })),
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
        const policy = policies[a.taskIndex]; if (!policy) continue
        const update = {}
        if (a.work_assignee) update.work_assignee = a.work_assignee
        if (a.dept_leader) update.dept_leader = a.dept_leader
        if (Object.keys(update).length === 0) continue
        const { error } = await supabase.from("policies").update(update).eq("id", policy.id)
        if (!error) updated++
      }
      setAiMsg(`完成：已更新 ${updated} 项制度修编任务的负责人`)
      loadData()
    } catch (err) { setAiMsg(`AI 匹配失败：${err.message}`) }
    finally { setAiMatching(false); setTimeout(() => setAiMsg(""), 5000) }
  }

  function exportToExcel() {
    const source = selected.size > 0 ? policies.filter(p => selected.has(p.id)) : policies
    if (source.length === 0) return
    const BOM = "\uFEFF"
    const headers = ["序号", "制度名称", "截止日期", "部门任务", "工作负责人", "部门负责人", "状态"]
    const rows = source.map((p, i) => [
      i + 1, p.policy_name, p.deadline || "", p.task_description || "",
      p.work_assignee || p.assignee || "", p.dept_leader || "",
      STATUS_LABELS[p.status] || p.status || "待开始"
    ])
    const csv = BOM + headers.join(",") + "\n" + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "制度修编列表_" + new Date().toISOString().slice(0, 10) + ".csv"
    a.click(); URL.revokeObjectURL(url)
  }

  const filteredPolicies = policies.filter(p => {
    if (filter === "completed" && p.status !== "completed") return false
    if (filter === "active" && p.status === "completed") return false
    if (search) {
      const s = search.toLowerCase()
      const fields = [p.policy_name, p.task_description, p.work_assignee, p.assignee, p.dept_leader, p.deadline]
      if (!fields.some(f => (f || "").toLowerCase().includes(s))) return false
    }
    return true
  })

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  const unassignedCount = policies.filter(p => !p.work_assignee && !p.assignee && !p.dept_leader).length

  return (
    <div className="space-y-6">
      <ConfidentialNotice />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">制度修编列表</h2>
          <button onClick={handleAiBatchMatch} disabled={aiMatching || policies.length === 0} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50" title="AI 自动匹配并修正工作负责人和部门负责人">
            <Sparkles size={16} className={aiMatching ? "animate-pulse text-blue-500" : "text-blue-500"} /> AI 校验修正
          </button>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> 增加制度修编任务
        </button>
      </div>

      {aiMsg && (
        <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {aiMatching && <Sparkles size={14} className="inline animate-pulse mr-1" />}{aiMsg}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-9" placeholder="搜索制度修编..." value={search} onChange={e => setSearch(e.target.value)} />
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

      {filteredPolicies.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无匹配的制度修编任务</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs">
                <th className="pb-2 font-medium w-8">
                  <input type="checkbox" className="accent-blue-600" checked={filteredPolicies.length > 0 && filteredPolicies.every(p => selected.has(p.id))} onChange={toggleSelectAll} />
                </th>
                <th className="pb-2 font-medium">制度名称</th>
                <th className="pb-2 font-medium w-20">截止日期</th>
                <th className="pb-2 font-medium">部门任务</th>
                <th className="pb-2 font-medium w-20">工作负责人</th>
                <th className="pb-2 font-medium w-20">部门负责人</th>
                <th className="pb-2 font-medium w-16">状态</th>
                <th className="pb-2 font-medium w-16">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredPolicies.map(policy => {
                const workAssignee = policy.work_assignee || policy.assignee || ""
                const deptLeader = policy.dept_leader || ""
                const isUnassigned = !workAssignee && !deptLeader
                const isChecked = selected.has(policy.id)
                return (
                  <tr key={policy.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isChecked ? "bg-blue-50/50" : ""} ${isUnassigned ? "bg-orange-50/30" : ""}`}>
                    <td className="py-2.5 pl-2">
                      <input type="checkbox" className="accent-blue-600" checked={isChecked} onChange={() => toggleSelect(policy.id)} />
                    </td>
                    <td className="py-2.5 pr-2 font-medium whitespace-normal break-words">{policy.policy_name}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap text-xs">{policy.deadline || "--"}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{policy.task_description || ""}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{workAssignee || <span className="text-orange-400">未分配</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-normal break-words text-xs">{deptLeader || <span className="text-gray-300">--</span>}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${policy.status === "completed" ? "bg-green-100 text-green-700" : policy.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[policy.status] || policy.status || "待开始"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <button onClick={() => openEditModal(policy)} className="p-1 hover:bg-gray-200 rounded transition-colors" title="修改制度修编任务">
                        <Edit size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">新增制度修编任务</h3>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">制度名称 *</label>
              <input className="input-field" value={addForm.policy_name} onChange={e => setAddForm(f => ({ ...f, policy_name: e.target.value }))} placeholder="输入制度名称（可含[新编]等标注）" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">截止日期</label>
              <input className="input-field" value={addForm.deadline} onChange={e => setAddForm(f => ({ ...f, deadline: e.target.value }))} placeholder="如：6月 或 2026-06-30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">部门任务</label>
              <textarea className="input-field" rows={3} value={addForm.task_description} onChange={e => setAddForm(f => ({ ...f, task_description: e.target.value }))} placeholder="描述该制度修编的相关任务" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">责任人</label>
              <input className="input-field" value={addForm.assignee} onChange={e => setAddForm(f => ({ ...f, assignee: e.target.value }))} placeholder="输入责任人姓名" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">状态</label>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => setAddForm(f => ({ ...f, status: s.value }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${addForm.status === s.value ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>取消</button>
              <button className="btn-primary flex items-center gap-2" onClick={handleAddPolicy} disabled={saving}>
                <Save size={16} />{saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">修改制度修编任务</h3>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">制度名称 *</label>
              <input className="input-field" value={editForm.policy_name} onChange={e => setEditForm(f => ({ ...f, policy_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">截止日期</label>
              <input className="input-field" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">部门任务</label>
              <textarea className="input-field" rows={3} value={editForm.task_description} onChange={e => setEditForm(f => ({ ...f, task_description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">工作负责人</label>
                <select className="input-field" value={editForm.work_assignee} onChange={e => setEditForm(f => ({ ...f, work_assignee: e.target.value }))}>
                  <option value="">-- 选择 --</option>
                  {workMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">部门负责人</label>
                <select className="input-field" value={editForm.dept_leader} onChange={e => setEditForm(f => ({ ...f, dept_leader: e.target.value }))}>
                  <option value="">-- 选择 --</option>
                  {deptLeaders.map(m => <option key={m.id} value={m.name}>{m.name} ({m.role})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">状态</label>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => setEditForm(f => ({ ...f, status: s.value }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${editForm.status === s.value ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setEditModal(null)}>取消</button>
              <button className="btn-primary flex items-center gap-2" onClick={saveEditModal} disabled={saving}>
                <Save size={16} />{saving ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
