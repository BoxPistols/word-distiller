import { SYSTEM_PROMPT } from '../prompt'

export async function callGemini(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  const data = await res.json() as {
    error?: { message: string }
    choices?: { message: { content: string } }[]
  }
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content ?? ''
}
