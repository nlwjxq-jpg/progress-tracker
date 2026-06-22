import { useState, useEffect } from 'react'
import { Wrench, Save, RotateCcw, CheckCircle } from 'lucide-react'
import { getAiApiUrl, setAiApiUrl } from '../lib/deepseek'
import ConfidentialNotice from "../components/ConfidentialNotice";

const PLACEHOLDER_URL = 'https://api.deepseek.com/v1/chat/completions'

export default function AISettings() {
  const [apiUrl, setApiUrl] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setApiUrl(getAiApiUrl())
  }, [])

  const handleSave = () => {
    const trimmed = apiUrl.trim()
    if (!trimmed) {
      setAiApiUrl('')
      setApiUrl('')
    } else {
      setAiApiUrl(trimmed)
      setApiUrl(trimmed)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setAiApiUrl('')
    setApiUrl('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <ConfidentialNotice />
      <div className="flex items-center gap-3">
        <Wrench size={24} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">AI 设置</h2>
      </div>

      <div className="card space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            DeepSeek API 地址
          </label>
          <input
            className="input-field"
            value={apiUrl}
            onChange={e => { setApiUrl(e.target.value); setSaved(false) }}
            placeholder={PLACEHOLDER_URL}
          />
          <p className="text-xs text-gray-400 mt-1">
            可切换官方地址或公司自建地址。API Key 安全存储在服务端，前端不可见。
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700 space-y-1">
          <p><strong>官方 DeepSeek：</strong>{PLACEHOLDER_URL}</p>
          <p><strong>公司自建：</strong>填入公司内部部署的 DeepSeek API 地址</p>
          <p className="text-xs text-blue-500 mt-2">
            ⚠ API Key 需在 Supabase Dashboard → Edge Functions → Secrets 中设置为 <code className="bg-blue-100 px-1 rounded">DEEPSEEK_API_KEY</code>
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            保存设置
          </button>
          <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
            <RotateCcw size={16} />
            恢复默认
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle size={14} />
              已保存
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
