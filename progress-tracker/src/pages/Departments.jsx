import { useState, useEffect } from 'react'
import { supabase, TABLES } from '../lib/supabase'
import { Plus, X, Users, Briefcase } from 'lucide-react'

export default function Departments() {
  const [departments, setDepartments] = useState([])
  const [members, setMembers] = useState([])
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [deptForm, setDeptForm] = useState({ name: '' })
  const [memberForm, setMemberForm] = useState({ name: '', role: '', skills: '', department_id: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [{ data: depts }, { data: membs }] = await Promise.all([
        supabase.from(TABLES.DEPARTMENTS).select('*').order('name'),
        supabase.from(TABLES.MEMBERS).select('*').order('name')
      ])
      setDepartments(depts || [])
      setMembers(membs || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function createDepartment() {
    if (!deptForm.name.trim()) return
    await supabase.from(TABLES.DEPARTMENTS).insert({ name: deptForm.name.trim() })
    setDeptForm({ name: '' })
    setShowDeptModal(false)
    loadData()
  }

  async function createMember() {
    if (!memberForm.name.trim() || !memberForm.department_id) return
    await supabase.from(TABLES.MEMBERS).insert({
      name: memberForm.name.trim(),
      role: memberForm.role.trim() || '成员',
      skills: memberForm.skills.trim() || '',
      department_id: memberForm.department_id,
      task_count: 0
    })
    setMemberForm({ name: '', role: '', skills: '', department_id: '' })
    setShowMemberModal(false)
    loadData()
  }

  async function deleteMember(id) {
    await supabase.from(TABLES.MEMBERS).delete().eq('id', id)
    loadData()
  }

  const membersByDept = {}
  departments.forEach(d => { membersByDept[d.id] = members.filter(m => m.department_id === d.id) })

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">部门与人员管理</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowDeptModal(true)} className="btn-secondary flex items-center gap-2">
            <Plus size={16} /> 新建部门
          </button>
          <button onClick={() => setShowMemberModal(true)} className="btn-primary flex items-center gap-2" disabled={departments.length === 0}>
            <Plus size={16} /> 添加人员
          </button>
        </div>
      </div>

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
                  {membersByDept[dept.id].map(member => (
                    <li key={member.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-gray-400" />
                        <div>
                          <span className="font-medium text-sm">{member.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{member.role}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{member.task_count || 0} 个任务</span>
                        <button onClick={() => deleteMember(member.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
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

      {/* Member Modal */}
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
            <input className="input-field" placeholder="技能标签（以空格分隔，如：前端 React API）" value={memberForm.skills} onChange={e => setMemberForm(f => ({ ...f, skills: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowMemberModal(false)}>取消</button>
              <button className="btn-primary" onClick={createMember}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
