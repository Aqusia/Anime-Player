export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
export const ORIGIN = 'https://anime1.me'

/** GET a page as text with browser-like headers (follows redirects). */
export async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: ORIGIN + '/',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return await res.text()
}
