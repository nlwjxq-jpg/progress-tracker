const API_URL = import.meta.env.VITE_DEEPSEEK_API_URL
const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY

/**
 * Call DeepSeek API to recommend task assignment based on department members.
 * Falls back to a rule-based match when API is unavailable.
 */
export async function recommendAssignee(taskTitle, taskDescription, members) {
  if (!API_KEY || !API_URL) {
    return ruleBasedRecommend(taskTitle, taskDescription, members)
  }

  try {
    const memberList = members
      .map(m => `${m.name}（${m.role || '成员'}，当前任务数：${m.task_count || 0}，擅长：${m.skills || '未设置'}）`)
      .join('\n')

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是一个任务分工助手。根据任务标题和描述，从以下团队成员中选择最合适的人选。考虑因素：角色匹配度、当前任务负载（优先分配给负载低的人）、技能匹配。只返回一个JSON对象，格式为 {"name":"成员名","reason":"一句话理由"}，不要输出其他内容。`
          },
          {
            role: 'user',
            content: `任务标题：${taskTitle}\n任务描述：${taskDescription}\n\n团队成员：\n${memberList}`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      })
    })

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    const jsonMatch = content.match(/\{[^}]+\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return ruleBasedRecommend(taskTitle, taskDescription, members)
  } catch (err) {
    console.warn('DeepSeek API call failed, using rule-based fallback:', err.message)
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
