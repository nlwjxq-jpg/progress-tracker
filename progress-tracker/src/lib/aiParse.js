import { getAiApiUrl } from './deepseek'

async function callEdgeFunction(functionName, textContent) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const apiUrl = getAiApiUrl()

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({ textContent, apiUrl })
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown')
    throw new Error(`Edge Function ${functionName} returned ${response.status}: ${errText}`)
  }
  return response.json()
}

export async function parseTasksFromText(textContent) {
  return callEdgeFunction('ai-parse-tasks', textContent)
}

export async function parseMembersFromText(textContent) {
  return callEdgeFunction('ai-parse-members', textContent)
}