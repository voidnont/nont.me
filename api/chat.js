const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.together.xyz',
]);

export const config = { runtime: 'edge' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const { baseUrl, model, apiKey, messages } = body ?? {};
    if (!baseUrl || !model || !apiKey || !Array.isArray(messages)) {
      return json({ error: 'Missing provider configuration.' }, 400);
    }

    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      return json({ error: 'This web build only proxies the built-in HTTPS provider presets.' }, 400);
    }

    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || data?.message || `Provider returned ${upstream.status}`;
      return json({ error: message }, upstream.status);
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => typeof part === 'string' ? part : part?.text || '').join('')
      : content;
    if (!text) return json({ error: 'Provider returned no text.' }, 502);
    return json({ text });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}
