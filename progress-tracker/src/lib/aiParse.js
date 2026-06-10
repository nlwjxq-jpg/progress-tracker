import { supabase } from './supabase'
import { getAiApiUrl } from './deepseek'

async function callEdgeFunction(functionName, textContent) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('未登录')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const apiUrl = getAiApiUrl()

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ textContent, apiUrl })
  })

  if (!response.ok) throw new Error(`Edge Function ${functionName} returned ${response.status}`)
  return response.json()
}

export async function parseTasksFromText(textContent) {
  return callEdgeFunction('ai-parse-tasks', textContent)
}

export async function parseMembersFromText(textContent) {
  return callEdgeFunction('ai-parse-members', textContent)
}
