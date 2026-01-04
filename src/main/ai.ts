import axios from 'axios';
import { db } from './db';
import { encoding_for_model, TiktokenModel } from 'tiktoken';

export async function getAISettings() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  return settings;
}

export async function updateTokenUsage(tokens: number) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO token_usage (date, tokens_used)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET tokens_used = tokens_used + ?
  `).run(today, tokens, tokens);
}

function calculateTokens(text: string, modelName: string) {
  try {
    const enc = encoding_for_model(modelName as TiktokenModel);
    const tokens = enc.encode(text).length;
    enc.free();
    return tokens;
  } catch {
    return Math.ceil(text.length / 4); // Fallback
  }
}

export async function callLLM(
  prompt: string, 
  systemPrompt: string = "You are a helpful academic assistant.", 
  maxTokens: number = 4000,
  baseUrl?: string,
  apiKey?: string,
  modelName?: string
) {
  const settings = await getAISettings();
  const finalBaseUrl = baseUrl || settings.llm_base_url;
  const finalApiKey = apiKey || settings.llm_api_key;
  const finalModelName = modelName || settings.llm_model_name;

  if (!finalApiKey) throw new Error('API Key not set');

  const response = await axios.post(
    `${finalBaseUrl}/chat/completions`,
    {
      model: finalModelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      stream: false
    },
    {
      headers: {
        'Authorization': `Bearer ${finalApiKey}`,
        'Content-Type': 'application/json'
      },
      proxy: settings.proxy_url ? {
        host: new URL(settings.proxy_url).hostname,
        port: parseInt(new URL(settings.proxy_url).port)
      } : false
    }
  );

  const content = response.data.choices[0].message.content;
  
  // Calculate tokens
  const inputTokens = calculateTokens(prompt + systemPrompt, finalModelName);
  const outputTokens = calculateTokens(content, finalModelName);
  await updateTokenUsage(inputTokens + outputTokens);

  return content;
}

export async function generateEmbedding(text: string) {
  const settings = await getAISettings();
  if (!settings.llm_api_key) throw new Error('API Key not set');

  const response = await axios.post(
    `${settings.llm_base_url}/embeddings`,
    {
      model: settings.embedding_model_name,
      input: text
    },
    {
      headers: {
        'Authorization': `Bearer ${settings.llm_api_key}`,
        'Content-Type': 'application/json'
      },
      proxy: settings.proxy_url ? {
        host: new URL(settings.proxy_url).hostname,
        port: parseInt(new URL(settings.proxy_url).port)
      } : false
    }
  );
  return response.data.data[0].embedding;
}
