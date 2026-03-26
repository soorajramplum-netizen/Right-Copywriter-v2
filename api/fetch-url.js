// ─────────────────────────────────────────────────────────────────
// Right Copywriter — URL Fetcher
// Fetches a brand website and extracts meaningful text content.
// Used by Campaign Manager to make copies brand-specific.
// If fetch fails for any reason — returns null, UI skips silently.
// ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(parsedUrl.href, {
      method: 'GET',
      headers: {
        // Mimic a browser to avoid basic bot blocks
        'User-Agent': 'Mozilla/5.0 (compatible; RightCopywriter/1.0; brand-context-fetcher)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      // 8 second timeout — don't hang if site is slow
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[FetchURL] ${parsedUrl.hostname}: HTTP ${response.status}`);
      return res.status(200).json({ text: null, reason: `HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return res.status(200).json({ text: null, reason: 'Non-HTML content type' });
    }

    const html = await response.text();

    // ── Extract meaningful text from HTML ──────────────────────
    // Remove scripts, styles, nav, footer, header — keep body content
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')          // strip remaining tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#[0-9]+;/g, ' ')
      .replace(/\s{2,}/g, ' ')           // collapse whitespace
      .trim();

    // Cap at 2000 chars — enough context for the AI without bloating the prompt
    if (text.length > 2000) {
      text = text.slice(0, 2000) + '...';
    }

    if (text.length < 50) {
      // Probably a JS-rendered SPA — nothing useful extracted
      return res.status(200).json({ text: null, reason: 'JS-rendered or empty content' });
    }

    console.log(`[FetchURL] ${parsedUrl.hostname}: extracted ${text.length} chars`);
    return res.status(200).json({ text, hostname: parsedUrl.hostname });

  } catch(err) {
    // Timeout, network error, CORS block — skip silently
    console.warn(`[FetchURL] Failed: ${err.message}`);
    return res.status(200).json({ text: null, reason: err.message });
  }
}
