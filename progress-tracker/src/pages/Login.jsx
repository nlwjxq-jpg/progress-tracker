import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await signUp(email, password)
        setError('注册成功！请检查邮箱确认链接（如未收到，请联系管理员）。')
      } else {
        await signIn(email, password)
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="card w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-700">协同目标进度管理</h1>
          <p className="text-gray-400 text-sm mt-1">团队目标与任务进度协同平台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">邮箱</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">密码</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="· · · · · ·"
            />
          </div>

          {error && (
            <div className={`text-sm p-3 rounded-lg ${
              error.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>{error}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            type="button"
            className="text-blue-600 ml-1 hover:underline"
            onClick={() => { setIsRegister(!isRegister); setError('') }}
          >
            {isRegister ? '去登录' : '去注册'}
          </button>
        </p>
      </div>
    </div>
  )
}
