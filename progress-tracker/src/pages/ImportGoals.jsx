import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { parseFileContent } from "../lib/fileParser"
import { getAiApiUrl } from "../lib/deepseek"
import { Upload, Sparkles, CheckCircle, Target, AlertTriangle } from "lucide-react"

function getFunctionUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-parse-goals`
}

export default function ImportGoals() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState("")
  const [parsedGoals, setParsedGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState("upload")
  const [error, setError] = useState("")
  const [warning, setWarning] = useState("")
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
    setError("")
    setWarning("")
    try {
      const text = await parseFileContent(f)
      setTextContent(text)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAiParse = async () => {
    if (!textContent.trim()) { setError("无文本内容，请先选择文件"); return }
    setLoading(true)
    setError("")
    setWarning("")
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apiUrl = getAiApiUrl()
      const resp = await fetch(getFunctionUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ textContent, apiUrl })
      })
      const result = await resp.json()
      if (result.warning) setWarning(result.raw ? result.warning + "\nAI原始返回: " + result.raw.slice(0, 300) : result.warning)
      if (result.error) { setError(result.error); return }

      const goals = (result.goals || []).map((g, i) => ({
        ...g, _id: i, year: g.year || new Date().getFullYear(), quarter: g.quarter || ""
      }))

      setParsedGoals(goals)
      setStep("preview")
    } catch (err) {
      setError(err.message || "AI 解析失败")
    } finally { setLoading(false) }
  }

  const handleImport = async () => {
    if (parsedGoals.length === 0) return
    setImporting(true)
    setError("")
    try {
      const { data: existing } = await supabase.from("goals").select("title")
      const existingTitles = new Set((existing || []).map(g => g.title.trim()))

      let added = 0, skipped = 0
      const now = new Date().toISOString()

      for (const goal of parsedGoals) {
        if (existingTitles.has(goal.title.trim())) { skipped++; continue }
        const { error: insertErr } = await supabase.from("goals").insert({
          title: goal.title.trim(),
          description: (goal.description || "").trim(),
          quarter: goal.quarter || null,
          year: goal.year || new Date().getFullYear(),
          created_at: now
        })
        if (!insertErr) { added++; existingTitles.add(goal.title.trim()) }
      }

      setImportResult({ added, skipped })
      setStep("done")
    } catch (err) { setError(err.message) }
    finally { setImporting(false) }
  }

  const reset = () => {
    setFile(null); setTextContent(""); setParsedGoals([])
    setStep("upload"); setError(""); setWarning("")
    setImportResult({ added: 0, skipped: 0 })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Target size={24} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">导入目标表</h2>
      </div>

      {step === "upload" && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">上传 Excel / CSV / Word / TXT 格式的目标文档，AI 将自动识别并提取年度/季度目标。</p>

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
            <button onClick={handleAiParse} disabled={loading} className="btn-primary flex items-center gap-2">
              <Sparkles size={16} /> AI 解析目标
            </button>
          )}

          {loading && (
            <div className="flex items-center gap-3 text-blue-600 text-sm">
              <Sparkles size={16} className="animate-pulse" /> AI 正在分析文件中...
            </div>
          )}

          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
          {warning && <div className="bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg whitespace-pre-wrap">{warning}</div>}
        </div>
      )}

      {step === "preview" && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">解析结果</h3>

          <div className="space-y-3">
            {parsedGoals.map((goal, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-blue-600 shrink-0" />
                  <span className="font-medium">{goal.title}</span>
                  {goal.quarter && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{goal.year} Q{goal.quarter}</span>}
                  {!goal.quarter && goal.year && <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">{goal.year}</span>}
                </div>
                {goal.description && <p className="text-sm text-gray-500 mt-1 ml-6">{goal.description}</p>}
              </div>
            ))}
          </div>

          {warning && <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg"><AlertTriangle size={16} />{warning}</div>}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
              {importing ? "导入中..." : <><CheckCircle size={16} /> 确认导入 ({parsedGoals.length} 项目标)</>}
            </button>
            <button onClick={reset} className="btn-secondary">重新选择</button>
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
        </div>
      )}

      {step === "done" && (
        <div className="card space-y-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">导入完成</h3>
            <p className="text-sm text-gray-500 mt-1">
              新增 <span className="text-green-600 font-bold">{importResult.added}</span> 项目标
              {importResult.skipped > 0 && <>, 跳过 <span className="text-yellow-600 font-bold">{importResult.skipped}</span> 项（已存在）</>}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate("/goals")} className="btn-primary">查看目标管理</button>
            <button onClick={reset} className="btn-secondary">继续导入</button>
          </div>
        </div>
      )}
    </div>
  )
}