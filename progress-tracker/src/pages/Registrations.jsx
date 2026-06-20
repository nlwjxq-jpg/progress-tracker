import { useState, useEffect } from 'react'
import { supabase, TABLES } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Check, X, UserCheck, Clock } from 'lucide-react'

export default function Registrations() {
  const { isAdmin, user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => { loadRequests() }, [])

  async function loadRequests() {
    const { data } = await supabase.from('registration_requests').select('*').order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function handleApprove(req) {
    setActionMsg('')
    try {
      // Update request status
      await supabase.from('registration_requests').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      }).eq('id', req.id)

      // Check if user already exists in auth (they might have registered via another flow)
      // If not, we just approve the request; the user still needs to sign up via Supabase Auth
      // The actual sign-up and department_members creation happens when they confirm email
      // For now, just approve so they can sign up and then we auto-create member record

      setActionMsg(`已批准 ${req.name} 的注册申请`)
      loadRequests()
      setTimeout(() => setActionMsg(''), 4000)
    } catch (err) {
      setActionMsg('操作失败: ' + err.message)
    }
  }

  async function handleReject(req) {
    setActionMsg('')
    try {
      await supabase.from('registration_requests').update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      }).eq('id', req.id)

      setActionMsg(`已拒绝 ${req.name} 的注册申请`)
      loadRequests()
      setTimeout(() => setActionMsg(''), 4000)
    } catch (err) {
      setActionMsg('操作失败: ' + err.message)
    }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  if (!isAdmin) {
    return <div className="card text-center text-gray-400 py-12">仅管理员可访问此页面</div>
  }

  if (loading) return <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mt-24" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800">注册审批</h2>
          {pendingCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingCount} 待审批</span>}
        </div>
      </div>

      {actionMsg && (
        <div className={`text-sm p-3 rounded-lg ${actionMsg.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{actionMsg}</div>
      )}

      {requests.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">暂无注册申请</div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">姓名</th>
                  <th className="pb-2 font-medium">邮箱</th>
                  <th className="pb-2 font-medium">部门</th>
                  <th className="pb-2 font-medium">申请时间</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{req.name}</td>
                    <td className="py-3">{req.email}</td>
                    <td className="py-3">{req.department_name}</td>
                    <td className="py-3 text-gray-500">{new Date(req.created_at).toLocaleDateString('zh-CN')}</td>
                    <td className="py-3">
                      {req.status === 'pending' && <span className="badge-yellow flex items-center gap-1 w-fit"><Clock size={12} /> 待审批</span>}
                      {req.status === 'approved' && <span className="badge-green flex items-center gap-1 w-fit"><Check size={12} /> 已通过</span>}
                      {req.status === 'rejected' && <span className="badge-red flex items-center gap-1 w-fit"><X size={12} /> 已拒绝</span>}
                    </td>
                    <td className="py-3">
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(req)} className="btn-primary !py-1 !px-3 text-xs flex items-center gap-1"><Check size={14} /> 通过</button>
                          <button onClick={() => handleReject(req)} className="btn-secondary !py-1 !px-3 text-xs flex items-center gap-1 !text-red-600"><X size={14} /> 拒绝</button>
                        </div>
                      )}
                      {req.status !== 'pending' && <span className="text-xs text-gray-400">{new Date(req.reviewed_at).toLocaleDateString('zh-CN')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
