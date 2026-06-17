import { useState, useEffect } from "react"
import { supabase, TABLES } from "../lib/supabase"
import { getAiApiUrl } from "../lib/deepseek"
import { Plus, X, Users, Building2, Sparkles, Edit3 } from "lucide-react"

function getBatchAssignUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${baseUrl}/functions/v1/batch-assign`
}

export default function Departments() {
  const [departments, setDepartments] = useState([])
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showEditMemberModal, setShowEditMemberModal] = useState(false)
  const [deptForm, setDeptForm] = useState({ name: "" })
  const [memberForm, setMemberForm] = useState({ name: "", role: "", skills: "", department_id: "" })
  const [editMemberForm, setEditMemberForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aiMatching, setAiMatching] = useState(false)
  const [aiMsg, setAiMsg] = useState("")

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [{ data: depts }, { data: membs }, { data: taskData }] = await Promise.all([
        supabase.from(TABLES.DEPARTMENTS).select("*").order("name"),
        supabase.from(TABLES.MEMBERS).select("*").order("name"),
        supabase.from(TABLES.TASKS).select("*")
      ])
      setDepartments(depts || [])
      setMembers(membs || [])
      setTasks(taskData || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // Calculate real task count per member from tasks table
  function getMemberTaskCount(memberName) {
    if (!memberName) return 0
    return tasks.filter(t => {
      const wa = t.work_assignee || t.assignee || ""
      return wa === memberName
    }).length
  }

  async function createDepartment() {
    if (!deptForm.name.trim()) return
    await supabase.from(TABLES.DEPARTMENTS).insert({ name: deptForm.name.trim() })
    setDeptForm({ name: "" })
    setShowDeptModal(false)
    loadData()
  }

  async function createMember() {
    if (!memberForm.name.trim() || !memberForm.department_id) return
    await supabase.from(TABLES.MEMBERS).insert({
      name: memberForm.name.trim(),
      role: memberForm.role.trim() || "成员",
      skills: memberForm.skills.trim() || "",
      department_id: memberForm.department_id,
      task_count: 0
    })
    setMemberForm({ name: "", role: "", skills: "", department_id: "" })
    setShowMemberModal(false)
    loadData()
  }

  function openEditMember(member) {
    setEditMemberForm({
      id: member.id,
      name: member.name,
      role: member.role || "",
      skills: member.skills || "",
      department_id: member.department_id || ""
    })
    setShowEditMemberModal(true)
  }

  async function saveEditMember() {
    if (!editMemberForm) return
    await supabase.from(TABLES.MEMBERS).update({
      role: editMemberForm.role.trim(),
      skills: editMemberForm.skills.trim(),
      department_id: editMemberForm.department_id
    }).eq("id", editMemberForm.id)
    setShowEditMemberModal(false)
    setEditMemberForm(null)
    loadData()
  }

  async function deleteMember(id) {
    await supabase.from(TABLES.MEMBERS).delete().eq("id", id)
    loadData()
  }

  async function handleAiBatchMatch() {
    setAiMatching(true)
    setAiMsg("正在调用 AI 校验修正...")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()

      const deptLeaders = members.filter(m => m.role.includes("部长") || m.role.includes("副部长"))
      const workMembers = members.filter(m => !(m.role.includes("部长") || m.role.includes("副部长")))

      const taskList = tasks.filter(t => {
        const wa = t.work_assignee || t.assignee || ""
        const dl = t.dept_leader || ""
        return !wa || !dl
      })

      if (taskList.length === 0 && tasks.every(t => (t.work_assignee || t.assignee) && t.dept_leader)) {
        setAiMsg("所有任务均已分配负责人，无需修正")
        return
      }

      const resp = await fetch(getBatchAssignUrl(), {
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
            name: m.name, role: m.role, skills: m.skills, task_count: getMemberTaskCount(m.name)
          })),
          workMembers: workMembers.map(m => ({
            name: m.name, role: m.role, skills: m.skills, task_count: getMemberTaskCount(m.name)
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

      setAiMsg(`完成：已校验并修正 ${updated} 项任务的负责人分配`)
      loadData()
    } catch (err) {
      setAiMsg(`AI 校验失败：${err.message}`)
    } finally {
      setAiMatching(false)
      setTimeout(() => setAiMsg(""), 5000)
    }
  }

  const membersByDept = {}
  departments.forEach(d => { membersByDept[d.id] = members.filter(m => m.department_id === d.id) })

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  const unassignedCount = tasks.filter(t => !(t.work_assignee || t.assignee) && !t.dept_leader).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">部门与人员管理</h2>
          <button
            onClick={handleAiBatchMatch}
            disabled={aiMatching || tasks.length === 0}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            title="AI 自动校验并修正任务的负责人分配"
          >
            <Sparkles size={16} className={aiMatching ? "animate-pulse text-blue-500" : "text-blue-500"} />
            AI 校验修正
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDeptModal(true)} className="btn-secondary flex items-center gap-2">
            <Plus size={16} /> 新建部门
          </button>
          <button onClick={() => setShowMemberModal(true)} className="btn-primary flex items-center gap-2" disabled={departments.length === 0}>
            <Plus size={16} /> 添加人员
          </button>
        </div>
      </div>

      {aiMsg && (
        <div className={`text-sm p-3 rounded-lg ${aiMsg.includes("失败") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {aiMatching && <Sparkles size={14} className="inline animate-pulse mr-1" />}
          {aiMsg}
        </div>
      )}

      {unassignedCount > 0 && (
        <div className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg inline-block">
          有 {unassignedCount} 项任务未分配负责人，点击 "AI 校验修正" 可自动分配
        </div>
      )}

      {departments.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Building2 size={48} className="mx-auto mb-3 text-gray-300" />
          暂无部门，请先创建部门
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {departments.map(dept => (
            <div key={dept.id} className="card">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-blue-600" />
                <h3 className="text-lg font-semibold">{dept.name}</h3>
                <span className="text-xs text-gray-400 ml-auto">{membersByDept[dept.id]?.length || 0} 人</span>
              </div>

              {membersByDept[dept.id]?.length === 0 ? (
                <p className="text-sm text-gray-400">暂无人员</p>
              ) : (
                <ul className="space-y-2">
                  {membersByDept[dept.id].map(member => {
                    const taskCount = getMemberTaskCount(member.name)
                    return (
                      <li key={member.id} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Users size={16} className="text-gray-400 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{member.name}</span>
                              <span className="text-xs text-gray-400">{member.role}</span>
                            </div>
                            {member.skills && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {member.skills.split(/[\s,，]+/).filter(Boolean).map((skill, i) => (
                                  <span key={i} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-gray-400 whitespace-nowrap">{taskCount} 个任务</span>
                          <button onClick={() => openEditMember(member)} className="text-gray-400 hover:text-blue-500 transition-colors" title="编辑职责">
                            <Edit3 size={13} />
                          </button>
                          <button onClick={() => deleteMember(member.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowDeptModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">新建部门</h3>
            <input className="input-field mb-4" value={deptForm.name} onChange={e => setDeptForm({ name: e.target.value })} placeholder="部门名称" autoFocus />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowDeptModal(false)}>取消</button>
              <button className="btn-primary" onClick={createDepartment}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowMemberModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">添加人员</h3>
            <select className="input-field" value={memberForm.department_id} onChange={e => setMemberForm(f => ({ ...f, department_id: e.target.value }))}>
              <option value="">-- 选择部门 --</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="input-field" placeholder="姓名" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} />
            <input className="input-field" placeholder="角色/职位" value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))} />
            <input className="input-field" placeholder="技能/职责标签（空格分隔，如：前端 React API）" value={memberForm.skills} onChange={e => setMemberForm(f => ({ ...f, skills: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowMemberModal(false)}>取消</button>
              <button className="btn-primary" onClick={createMember}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditMemberModal && editMemberForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowEditMemberModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">编辑人员职责 - {editMemberForm.name}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">角色/职位</label>
              <input
                className="input-field"
                value={editMemberForm.role}
                onChange={e => setEditMemberForm(f => ({ ...f, role: e.target.value }))}
                placeholder="如：前端开发、测试工程师"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">技能/职责标签</label>
              <input
                className="input-field"
                value={editMemberForm.skills}
                onChange={e => setEditMemberForm(f => ({ ...f, skills: e.target.value }))}
                placeholder="空格分隔，如：前端 React Vue API设计"
              />
              <p className="text-xs text-gray-400 mt-1">修改后将影响 AI 分配任务时的技能匹配依据</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">所属部门</label>
              <select
                className="input-field"
                value={editMemberForm.department_id}
                onChange={e => setEditMemberForm(f => ({ ...f, department_id: e.target.value }))}
              >
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setShowEditMemberModal(false); setEditMemberForm(null) }}>取消</button>
              <button className="btn-primary" onClick={saveEditMember}>保存修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}