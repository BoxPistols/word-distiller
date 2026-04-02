import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '../prompt'

export async function callAnthropic(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
}
