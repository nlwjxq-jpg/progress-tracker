import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, TABLES } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseFileContent } from '../lib/fileParser'
import { parseTasksFromText } from '../lib/aiParse'
import { Upload, Sparkles, Plus, CheckCircle, X, FileSpreadsheet, AlertTriangle } from 'lucide-react'

export default function ImportTasks() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [parsedTasks, setParsedTasks] = useState([])
  const [selectedTasks, setSelectedTasks] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState('upload') // upload | parse | preview | done
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
      const result = await parseTasksFromText(textContent)
      if (result.warning) setWarning(result.raw ? result.warning + '\\nAI原始返回: ' + result.raw.slice(0, 300) : result.warning)
      if (result.error) { setError(result.error); return }

      const tasks = (result.tasks || []).map((t, i) => ({
        ...t,
        _id: i,
        status: 'pending',
        progress: 0,
        due_date: t.due_date || ''
      }))

      setParsedTasks(tasks)
      setSelectedTasks(new Set(tasks.map(t => t._id)))
      setStep('preview')
    } catch (err) {
      setError(err.message || 'AI 解析失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleTask = (id) => {
    const next = new Set(selectedTasks)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedTasks(next)
  }

  const toggleAll = () => {
    if (selectedTasks.size === parsedTasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(parsedTasks.map(t => t._id)))
    }
  }

  const handleImport = async () => {
    const toImport = parsedTasks.filter(t => selectedTasks.has(t._id))
    if (toImport.length === 0) return

    setImporting(true)
    setError('')

    try {
      // Get existing task titles for dedup
      const { data: existing } = await supabase.from(TABLES.TASKS).select('title')
      const existingTitles = new Set((existing || []).map(t => t.title.trim()))

      let added = 0, skipped = 0
      const now = new Date().toISOString()

      for (const task of toImport) {
        if (existingTitles.has(task.title.trim())) {
          skipped++
          continue
        }
        const { error: insertErr } = await supabase.from(TABLES.TASKS).insert({
          title: task.title.trim(),
          description: task.description || '',
          due_date: task.due_date || null,
          priority: task.priority || 'normal',
          status: 'pending',
          progress: 0,
          created_at: now,
          updated_at: now
        })
        if (!insertErr) {
          added++
          existingTitles.add(task.title.trim())
        }
      }

      setImportResult({ added, skipped })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleManualAdd = () => {
    navigate('/tasks/new')
  }

  const reset = () => {
    setFile(null); setTextContent(''); setParsedTasks([])
    setSelectedTasks(new Set()); setStep('upload')
    setError(''); setWarning(''); setImportResult({ added: 0, skipped: 0 })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <FileSpreadsheet size={24} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">导入年度任务表</h2>
      </div>

      {step === 'upload' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">上传 Excel / CSV / Word / TXT 格式的年度工作任务表，AI 将自动识别并提取任务。</p>

          {isAdmin && departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">导入到部门</label>
              <select className="input-field max-w-xs" value={deptId} onChange={e => setDeptId(e.target.value)}>
                <option value="">-- 选择部门 --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
            <Upload size={40} className="mx-auto text-gray-300 mb-3" />
            <label className="cursor-pointer">
              <span className="btn-primary inline-block">选择文件</span>
              <input type="file" accept=".xlsx,.xls,.csv,.docx,.txt" onChange={handleFileChange} className="hidden" />
            </label>
            {file && (
              <p className="mt-3 text-sm text-gray-600">
                已选择：<span className="font-medium">{file.name}</span>
                <span className="text-gray-400 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
              </p>
            )}
          </div>

          {file && (
            <div className="flex gap-3">
              <button onClick={handleAiParse} disabled={loading} className="btn-primary flex items-center gap-2">
                <Sparkles size={16} /> AI 解析任务
              </button>
              <button onClick={handleManualAdd} className="btn-secondary flex items-center gap-2">
                <Plus size={16} /> 手动新增任务
              </button>
            </div>
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
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">解析结果（{parsedTasks.length} 项任务）</h3>
            <div className="flex gap-2">
              <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline">
                {selectedTasks.size === parsedTasks.length ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-400">已选 {selectedTasks.size}</span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {parsedTasks.map(task => (
              <div key={task._id}
                onClick={() => toggleTask(task._id)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTasks.has(task._id) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedTasks.has(task._id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                }`}>
                  {selectedTasks.has(task._id) && <CheckCircle size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{task.title}</p>
                  {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {task.due_date && <span>📅 {task.due_date}</span>}
                    <span className={`px-1.5 py-0.5 rounded ${
                      task.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                      task.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                      task.priority === 'low' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '普通'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {warning && <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg"><AlertTriangle size={16} />{warning}</div>}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={importing || selectedTasks.size === 0} className="btn-primary flex items-center gap-2">
              {importing ? '导入中...' : <><CheckCircle size={16} /> 导入选中的 {selectedTasks.size} 项任务</>}
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
              新增 <span className="text-green-600 font-bold">{importResult.added}</span> 项任务，
              跳过 <span className="text-yellow-600 font-bold">{importResult.skipped}</span> 项重复任务
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/tasks')} className="btn-primary">查看任务列表</button>
            <button onClick={reset} className="btn-secondary">继续导入</button>
          </div>
        </div>
      )}
    </div>
  )
}
