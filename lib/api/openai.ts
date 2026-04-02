import OpenAI from 'openai'
import { SYSTEM_PROMPT } from '../prompt'

export async function callOpenAI(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const res = await client.chat.completions.create({
    model,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    response_format: { type: 'json_object' },
  })
  return res.choices[0]?.message?.content ?? ''
}
