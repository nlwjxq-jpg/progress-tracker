import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, TABLES } from '../lib/supabase'
import { parseFileContent } from '../lib/fileParser'
import { parseMembersFromText } from '../lib/aiParse'
import { recommendAssignee } from '../lib/deepseek'
import { Upload, Sparkles, CheckCircle, Users, Building2, AlertTriangle } from 'lucide-react'
import ConfidentialNotice from "../components/ConfidentialNotice";

export default function ImportMembers() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [departments, setDepartments] = useState([])
  const [autoAssign, setAutoAssign] = useState(true)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState('upload')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [importResult, setImportResult] = useState({ depts: 0, members: 0, assigned: 0 })

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError('')
    setWarning('')

    try {
      const text = await parseFileContent(f)
      setTextContent(text)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAiParse = async () => {
    if (!textContent.trim()) {
      setError('无文本内容，请先选择文件')
      return
    }
    setLoading(true)
    setError('')
    setWarning('')

    try {
      const result = await parseMembersFromText(textContent)
      if (result.warning) setWarning(result.warning)
      if (result.error) { setError(result.error); return }

      setDepartments(result.departments || [])
      setStep('preview')
    } catch (err) {
      setError(err.message || 'AI 解析失败')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (departments.length === 0) return
    setImporting(true)
    setError('')

    try {
      const allMembers = []
      let deptsCreated = 0

      for (const dept of departments) {
        // Create department
        const { data: existingDept } = await supabase
          .from(TABLES.DEPARTMENTS)
          .select('id')
          .eq('name', dept.department)
          .maybeSingle()

        let deptId = existingDept?.id
        if (!deptId) {
          const { data: newDept } = await supabase
            .from(TABLES.DEPARTMENTS)
            .insert({ name: dept.department })
            .select('id')
            .single()
          deptId = newDept?.id
          if (deptId) deptsCreated++
        }

        // Create members for this department
        for (const member of (dept.members || [])) {
          const { data: existingMember } = await supabase
            .from(TABLES.MEMBERS)
            .select('id')
            .eq('name', member.name)
            .maybeSingle()

          if (!existingMember) {
            const { data: newMember } = await supabase
              .from(TABLES.MEMBERS)
              .insert({
                name: member.name,
                role: member.role || '成员',
                skills: member.skills || '',
                department_id: deptId,
                task_count: 0
              })
              .select('id')
              .single()

            if (newMember) {
              allMembers.push({ id: newMember.id, name: member.name, role: member.role, skills: member.skills || '', task_count: 0 })
            }
          } else {
            allMembers.push({ id: existingMember.id, name: member.name, role: member.role, skills: member.skills || '', task_count: 0 })
          }
        }
      }

      // Auto-assign tasks using AI if enabled and we have unassigned tasks
      let assigned = 0
      if (autoAssign && allMembers.length > 0) {
        const { data: unassignedTasks } = await supabase
          .from(TABLES.TASKS)
          .select('*')
          .or('assignee.is.null,assignee.eq.')
          .limit(50)

        for (const task of (unassignedTasks || [])) {
          try {
            const rec = await recommendAssignee(task.title, task.description || '', allMembers)
            if (rec?.name) {
              await supabase.from(TABLES.TASKS).update({ assignee: rec.name }).eq('id', task.id)
              assigned++
            }
          } catch {}
        }
      }

      setImportResult({
        depts: deptsCreated,
        members: allMembers.length,
        assigned
      })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setFile(null); setTextContent(''); setDepartments([])
    setStep('upload'); setError(''); setWarning('')
    setAutoAssign(true); setImportResult({ depts: 0, members: 0, assigned: 0 })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <ConfidentialNotice />
      <div className="flex items-center gap-3">
        <Users size={24} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">导入部门人员分工表</h2>
      </div>

      {step === 'upload' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">上传 Excel / CSV / Word / TXT 格式的部门人员分工安排表，AI 将自动识别部门与人员。</p>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
            <Upload size={40} className="mx-auto text-gray-300 mb-3" />
            <label className="cursor-pointer">
              <span className="btn-primary inline-block">选择文件</span>
              <input type="file" accept=".xlsx,.xls,.csv,.docx,.txt" onChange={handleFileChange} className="hidden" />
            </label>
            {file && (
              <p className="mt-3 text-sm text-gray-600">
                已选择：<span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          {file && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} className="accent-blue-600" />
                导入后自动用 AI 为未分配任务匹配责任人
              </label>

              <button onClick={handleAiParse} disabled={loading} className="btn-primary flex items-center gap-2">
                <Sparkles size={16} /> AI 解析人员
              </button>
            </>
          )}

          {loading && (
            <div className="flex items-center gap-3 text-blue-600 text-sm">
              <Sparkles size={16} className="animate-pulse" />
              AI 正在分析文件中...
            </div>
          )}

          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
          {warning && <div className="bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg">{warning}</div>}
        </div>
      )}

      {step === 'preview' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">解析结果</h3>

          <div className="space-y-4">
            {departments.map((dept, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={16} className="text-blue-600" />
                  <h4 className="font-semibold">{dept.department}</h4>
                  <span className="text-xs text-gray-400">{(dept.members || []).length} 人</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(dept.members || []).map((m, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <Users size={14} className="text-gray-400" />
                      <span className="font-medium">{m.name}</span>
                      <span className="text-gray-400 text-xs">{m.role}</span>
                      {m.skills && <span className="text-blue-500 text-xs">{m.skills}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {warning && <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg"><AlertTriangle size={16} />{warning}</div>}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
              {importing ? '导入中...' : <><CheckCircle size={16} /> 确认导入</>}
            </button>
            <button onClick={reset} className="btn-secondary">重新选择</button>
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
        </div>
      )}

      {step === 'done' && (
        <div className="card space-y-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">导入完成</h3>
            <p className="text-sm text-gray-500 mt-1">
              新增 <span className="text-green-600 font-bold">{importResult.depts}</span> 个部门，
              <span className="text-green-600 font-bold"> {importResult.members}</span> 名人员
            </p>
            {autoAssign && importResult.assigned > 0 && (
              <p className="text-sm text-blue-500 mt-1">
                已为 <span className="font-bold">{importResult.assigned}</span> 项任务自动匹配责任人
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/departments')} className="btn-primary">查看部门人员</button>
            <button onClick={reset} className="btn-secondary">继续导入</button>
          </div>
        </div>
      )}
    </div>
  )
}
