const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_STREAM_TIMEOUT_MS = 300000;

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`${name} belum diisi di server/.env.`);
    error.status = 503;
    throw error;
  }
  return value;
}

export function getAiConfig() {
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const model = String(process.env.AI_MODEL || '').trim();
  const baseUrl = String(process.env.AI_BASE_URL || '').trim().replace(/\/$/, '');

  return {
    configured: Boolean(apiKey && model && baseUrl),
    model: model || null,
    baseUrl: baseUrl || null
  };
}

export async function createAiChatCompletion({ messages, temperature, maxTokens, signal }) {
  const apiKey = requiredEnv('AI_API_KEY');
  const model = requiredEnv('AI_MODEL');
  const baseUrl = requiredEnv('AI_BASE_URL').replace(/\/$/, '');
  const timeoutMs = Math.max(1000, Number(process.env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const body = { model, messages };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.AI_HTTP_REFERER ? { 'HTTP-Referer': process.env.AI_HTTP_REFERER } : {}),
        ...(process.env.AI_APP_NAME ? { 'X-Title': process.env.AI_APP_NAME } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || `Provider AI merespons HTTP ${response.status}.`);
      error.status = response.status >= 500 ? 502 : response.status;
      error.details = data?.error || undefined;
      throw error;
    }

    return {
      id: data.id || null,
      model: data.model || model,
      message: data.choices?.[0]?.message || null,
      usage: data.usage || null
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Permintaan ke model AI melewati batas waktu.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Streaming: response dikirim sebagai chunk via fetch readable stream
export async function createAiChatStream({ messages, temperature, maxTokens, onChunk, signal }) {
  const apiKey = requiredEnv('AI_API_KEY');
  const model = requiredEnv('AI_MODEL');
  const baseUrl = requiredEnv('AI_BASE_URL').replace(/\/$/, '');
  const timeoutMs = Math.max(1000, Number(process.env.AI_STREAM_TIMEOUT_MS || DEFAULT_STREAM_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const body = { model, messages, stream: true };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.AI_HTTP_REFERER ? { 'HTTP-Referer': process.env.AI_HTTP_REFERER } : {}),
        ...(process.env.AI_APP_NAME ? { 'X-Title': process.env.AI_APP_NAME } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Provider AI merespons HTTP ${response.status}: ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body tidak readable.');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
          if (content && onChunk) onChunk(content, parsed);
        } catch {
          // skip malformed
        }
      }
    }
    return { done: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Stream AI melewati batas waktu.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
