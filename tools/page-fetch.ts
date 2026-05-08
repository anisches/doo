import { chromium } from 'playwright';

function normalizeUrl(value: string) {
  const url = String(value || '').trim();
  if (!url) {
    throw new Error('URL is required.');
  }

  try {
    return new URL(url).toString();
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

function collapseWhitespace(text: string) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function fetchPageContent(url: string) {
  const target = normalizeUrl(url);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1800 },
    });

    page.setDefaultTimeout(20000);
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const selectors = [
        'article',
        'main',
        '[role="main"]',
        '.article-content',
        '.post-content',
        '.entry-content',
      ];

      const candidates: HTMLElement[] = [];
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        candidates.push(...nodes);
      }

      const root =
        candidates.find((el) => (el.innerText || '').trim().length > 400) ||
        candidates.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0] ||
        document.body;

      const title = document.title || '';
      const description =
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '';
      const text = root?.innerText || document.body?.innerText || '';

      return {
        title,
        description,
        text,
        url: location.href,
      };
    });

    const content = collapseWhitespace(data.text);
    return [
      `URL: ${data.url}`,
      `TITLE: ${collapseWhitespace(data.title)}`,
      data.description ? `DESCRIPTION: ${collapseWhitespace(data.description)}` : null,
      '',
      'CONTENT:',
      content,
    ]
      .filter(Boolean)
      .join('\n');
  } finally {
    await browser.close().catch(() => {});
  }
}
