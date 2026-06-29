const DEFAULT_TIMEOUT_MS = 60000;

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
