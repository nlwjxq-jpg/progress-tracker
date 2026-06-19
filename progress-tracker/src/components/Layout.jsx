import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, ListTodo, Building2, Target, LogOut, Wrench, Upload, UserPlus, FileUp } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/tasks', icon: ListTodo, label: '任务列表' },
  { to: '/departments', icon: Building2, label: '部门与人员' },
  { to: '/goals', icon: Target, label: '目标管理' },
  { to: '/import-tasks', icon: Upload, label: '导入任务表' },
  { to: '/import-goals', icon: FileUp, label: '导入目标表' },
  { to: '/import-members', icon: UserPlus, label: '导入人员表' },
  { to: '/ai-settings', icon: Wrench, label: 'AI 设置' },
]

export default function Layout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-lg font-bold text-blue-700">协同目标进度管理</h1>
          <p className="text-xs text-gray-400 mt-1">目标·任务·协同</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <button onClick={handleSignOut} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 p-8">
        <Outlet />
      </main>
    </div>
  )
}
