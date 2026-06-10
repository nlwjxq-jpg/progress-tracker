import { supabase } from './supabase'

/**
 * Get the Edge Function URL for AI recommend.
 * Uses the same Supabase project as the database.
 */
function getFunctionUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${baseUrl}/functions/v1/deepseek-recommend`
}

/**
 * Recommend task assignee via Supabase Edge Function (which calls company's self-hosted DeepSeek).
 * The Edge Function holds the API key securely; the frontend never touches it.
 */
export async function recommendAssignee(taskTitle, taskDescription, members) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return ruleBasedRecommend(taskTitle, taskDescription, members)

    const response = await fetch(getFunctionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ taskTitle, taskDescription, members })
    })

    if (!response.ok) throw new Error(`Edge Function returned ${response.status}`)

    const result = await response.json()
    if (result?.name) return result
    return ruleBasedRecommend(taskTitle, taskDescription, members)
  } catch (err) {
    console.warn('AI recommend failed, using rule-based fallback:', err.message)
    return ruleBasedRecommend(taskTitle, taskDescription, members)
  }
}

function ruleBasedRecommend(taskTitle, taskDescription, members) {
  if (!members.length) return null

  const text = (taskTitle + ' ' + taskDescription).toLowerCase()
  const keywords = {
    '前端': ['前端', '页面', 'ui', '界面', 'react', 'vue', 'css'],
    '后端': ['后端', '接口', 'api', '数据库', '服务', 'server'],
    '测试': ['测试', 'test', 'qa', '验收'],
    '设计': ['设计', 'ui', 'ux', '视觉', '原型'],
    '数据': ['数据', '分析', '报表', '统计', 'sql'],
  }

  for (const member of members) {
    const skills = (member.skills || '').toLowerCase()
    for (const [, kws] of Object.entries(keywords)) {
      if (kws.some(kw => text.includes(kw) && skills.includes(kw))) {
        return { name: member.name, reason: `根据技能匹配：${member.role || '成员'}` }
      }
    }
  }

  const sorted = [...members].sort((a, b) => (a.task_count || 0) - (b.task_count || 0))
  return { name: sorted[0].name, reason: '当前任务负载最低' }
}
