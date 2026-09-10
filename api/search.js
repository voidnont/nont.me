export const config = { runtime: 'edge' };

function decodeHtml(value = '') {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDuckUrl(value) {
  try {
    const url = new URL(value, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    return value;
  }
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.max(1, Math.min(10, Number(searchParams.get('limit') || 8)));
  if (!q) return Response.json({ results: [] });

  try {
    const upstream = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { 'user-agent': 'Mozilla/5.0 NONT-Nexus-Web/1.0' },
    });
    const html = await upstream.text();
    const blocks = html.split('class="result results_links').slice(1);
    const results = [];

    for (const block of blocks) {
      if (results.length >= limit) break;
      const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      const url = unwrapDuckUrl(link[1].replace(/&amp;/g, '&'));
      if (!/^https?:\/\//i.test(url)) continue;
      results.push({
        title: decodeHtml(link[2]),
        url,
        snippet: decodeHtml(snippet?.[1] || snippet?.[2] || ''),
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: String(error), results: [] }, { status: 500 });
  }
}
