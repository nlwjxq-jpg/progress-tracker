import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseFileContent } from '../lib/fileParser'
import { getAiApiUrl } from '../lib/deepseek'
import { Upload, Sparkles, CheckCircle, AlertTriangle } from 'lucide-react'
import ConfidentialNotice from "../components/ConfidentialNotice";

export default function ImportPolicies() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [parsedPolicies, setParsedPolicies] = useState([])
  const [selectedPolicies, setSelectedPolicies] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState('upload')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [importResult, setImportResult] = useState({ added: 0, skipped: 0 })
  const [deptId, setDeptId] = useState('')
  const [departments, setDepartments] = useState([])
  const { isAdmin, isDeptAdmin, userDeptId } = useAuth()

  useEffect(() => {
    supabase.from('departments').select('*').then(({ data }) => setDepartments(data || []))
  }, [])

  const effectiveDeptId = isAdmin ? (deptId || '') : (userDeptId || '')

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(''); setWarning('')
    try { setTextContent(await parseFileContent(f)) } catch (err) { setError(err.message) }
  }

  const handleAiParse = async () => {
    if (!textContent.trim()) { setError('无文本内容，请先选择文件'); return }
    setLoading(true); setError(''); setWarning('')
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const resp = await fetch(`${baseUrl}/functions/v1/ai-parse-policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ textContent, apiUrl: getAiApiUrl() })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.warning || result.error || "解析失败")
      if (result.warning) setWarning(result.raw ? result.warning + '\n原始返回: ' + result.raw.slice(0, 300) : result.warning)
      if (result.error) { setError(result.error); return }
      const policies = (result.policies || []).map((p, i) => ({ ...p, _id: i, status: p.status || 'pending' }))
      setParsedPolicies(policies)
      setSelectedPolicies(new Set(policies.map(p => p._id)))
      setStep('preview')
    } catch (err) { setError(err.message || 'AI 解析失败') }
    finally { setLoading(false) }
  }

  const togglePolicy = (id) => {
    const next = new Set(selectedPolicies)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedPolicies(next)
  }

  const toggleAll = () => {
    selectedPolicies.size === parsedPolicies.length
      ? setSelectedPolicies(new Set())
      : setSelectedPolicies(new Set(parsedPolicies.map(p => p._id)))
  }

  const handleImport = async () => {
    const toImport = parsedPolicies.filter(p => selectedPolicies.has(p._id))
    if (toImport.length === 0) return
    setImporting(true); setError('')
    try {
      const { data: existing } = await supabase.from("policies").select('policy_name')
      const existingNames = new Set((existing || []).map(p => p.policy_name.trim()))
      let added = 0, skipped = 0
      const now = new Date().toISOString()
      for (const policy of toImport) {
        if (existingNames.has(policy.policy_name.trim())) { skipped++; continue }
        const { error: insertErr } = await supabase.from("policies").insert({
          policy_name: policy.policy_name.trim(),
          deadline: policy.deadline || null,
          task_description: policy.task_description || '',
          assignee: policy.assignee || '',
          status: policy.status || 'pending',
          department_id: effectiveDeptId || null,
          created_at: now, updated_at: now
        })
        if (!insertErr) { added++; existingNames.add(policy.policy_name.trim()) }
      }
      setImportResult({ added, skipped })
      setStep('done')
    } catch (err) { setError(err.message) }
    finally { setImporting(false) }
  }

  const reset = () => {
    setFile(null); setTextContent(''); setParsedPolicies([])
    setSelectedPolicies(new Set()); setStep('upload')
    setError(''); setWarning(''); setImportResult({ added: 0, skipped: 0 })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <ConfidentialNotice />
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">导入制度修编表</h2>
      </div>

      {step === 'upload' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">上传 Excel (.xlsx) 或 CSV 制度修编表，AI 将自动识别制度名称、截止日期、责任人和状态。</p>

          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">选择部门</label>
              <select className="input-field" value={deptId} onChange={e => setDeptId(e.target.value)}>
                <option value="">-- 不指定部门 --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <label className={`flex flex-col items-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
            <Upload size={32} className={file ? 'text-blue-500' : 'text-gray-400'} />
            <span className="text-sm text-gray-500">{file ? file.name : '点击选择文件 (.xlsx / .csv / .txt)'}</span>
            <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt" onChange={handleFileChange} />
          </label>

          <button onClick={handleAiParse} disabled={loading || !textContent.trim()} className="btn-primary flex items-center gap-2">
            <Sparkles size={16} /> AI 解析制度修编任务
          </button>

          {loading && <div className="flex items-center gap-3 text-blue-600 text-sm"><Sparkles size={16} className="animate-pulse" /> AI 正在分析文件中...</div>}
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
          {warning && <div className="bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg">{warning}</div>}
        </div>
      )}

      {step === 'preview' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">解析结果（{parsedPolicies.length} 项制度修编任务）</h3>
            <div className="flex gap-2">
              <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline">
                {selectedPolicies.size === parsedPolicies.length ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-400">已选 {selectedPolicies.size}</span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {parsedPolicies.map(p => (
              <div key={p._id} onClick={() => togglePolicy(p._id)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedPolicies.has(p._id) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selectedPolicies.has(p._id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {selectedPolicies.has(p._id) && <CheckCircle size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{p.policy_name}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {p.deadline && <span>📅 {p.deadline}</span>}
                    {p.assignee && <span>👤 {p.assignee}</span>}
                    <span className={`px-1.5 py-0.5 rounded ${p.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {p.status === 'completed' ? '已完成' : '待开始'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {warning && <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg"><AlertTriangle size={16} />{warning}</div>}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={importing || selectedPolicies.size === 0} className="btn-primary flex items-center gap-2">
              {importing ? '导入中...' : <><CheckCircle size={16} /> 导入选中的 {selectedPolicies.size} 项制度修编任务</>}
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
              新增 <span className="text-green-600 font-bold">{importResult.added}</span> 项制度修编任务，
              跳过 <span className="text-yellow-600 font-bold">{importResult.skipped}</span> 项重复
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/policies')} className="btn-primary">查看制度修编列表</button>
            <button onClick={reset} className="btn-secondary">继续导入</button>
          </div>
        </div>
      )}
    </div>
  )
}
