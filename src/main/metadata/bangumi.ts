import { toSimplified, toTraditional } from './convert'

const SEARCH = 'https://api.bgm.tv/v0/search/subjects?limit=1'
const UA = 'anime1-netflix/1.0 (personal media client)'

export interface MetaResult {
  found: boolean
  definitiveMiss?: boolean
  rateLimited?: boolean
  nsfw?: boolean
  cover?: string
  description?: string
  score?: number
  votes?: number
  rank?: number
  year?: number
  matchedTitle?: string
  bgmId?: number
  tags?: string[]
}

// Bangumi tags mix real genres with a lot of noise (staff/cast names, studios,
// years, format, source, country). An allowlist of genre/theme words keeps only
// the meaningful ones, so the chips read clean and "similar style" matching is
// genre-pure. Matched against the SIMPLIFIED tag name (Bangumi is Simplified).
const GENRE_TAGS = new Set([
  '战斗', '战争', '军事', '热血', '动作', '冒险', '奇幻', '魔幻', '西幻', '魔法',
  '科幻', '机战', '机甲', '赛博朋克', '蒸汽朋克', '校园', '青春', '恋爱', '爱情', '纯爱',
  '三角恋', '后宫', '逆后宫', '百合', '耽美', '日常', '治愈', '治愈系', '温馨', '搞笑',
  '喜剧', '欢乐', '吐槽', '卖肉', '福利', '致郁', '催泪', '感人', '虐心', '励志',
  '运动', '竞技', '体育', '音乐', '偶像', '舞蹈', '推理', '悬疑', '侦探', '烧脑',
  '恐怖', '惊悚', '猎奇', '血腥', '黑暗', '末世', '末日', '丧尸', '吸血鬼', '妖怪',
  '鬼怪', '神话', '宗教', '超能力', '异能', '异世界', '穿越', '重生', '转生', '历史',
  '武侠', '仙侠', '古风', '职场', '美食', '料理', '旅行', '成长', '友情', '亲情',
  '家庭', '亲子', '中二', '废萌', '萌系', '美少女', '美少年', '师生', '社会', '犯罪',
  '政治', '经济', '心理', '哲学', '科学', '游戏', '电竞', '赛车', '策略', '复仇',
  '人性', '校园恋爱', '奇幻冒险', '悬疑推理', '科幻冒险'
])

/** Keep only allowlisted genre/theme tags (Bangumi sorts by count desc),
 *  matched in Simplified, returned in Traditional, deduped, capped. */
function pickTags(raw: { name?: string; count?: number }[] | undefined): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of raw) {
    const name = (t?.name || '').trim()
    if (!name || !GENRE_TAGS.has(toSimplified(name))) continue
    const trad = toTraditional(name)
    if (seen.has(trad)) continue
    seen.add(trad)
    out.push(trad)
    if (out.length >= 6) break
  }
  return out
}

/** Strip season markers / brackets / fansub noise to improve match rate. */
export function cleanTitle(t: string): string {
  return t
    .replace(/\(.*?\)/g, ' ')
    .replace(/（.*?）/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/第[一二三四五六七八九十百零\d]+[季期部]/g, ' ')
    .replace(/Season\s*\d+/gi, ' ')
    .replace(/[:：~～\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Look up one anime on Bangumi by its (Traditional) anime1 title. */
export async function fetchMeta(title: string): Promise<MetaResult> {
  const keyword = toSimplified(cleanTitle(title)) || title
  try {
    const res = await fetch(SEARCH, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ keyword, sort: 'match', filter: { type: [2] } })
    })
    if (res.status === 429) return { found: false, rateLimited: true }
    if (!res.ok) return { found: false, definitiveMiss: true }
    const json: any = await res.json()
    const m = json?.data?.[0]
    if (!m) return { found: false, definitiveMiss: true }

    const cover = m.images?.common || m.images?.large || m.images?.medium || undefined
    const description = m.summary ? toTraditional(String(m.summary)) : undefined
    const matchedTitle = m.name_cn ? toTraditional(m.name_cn) : m.name || undefined
    const yearMatch = typeof m.date === 'string' ? m.date.match(/^(\d{4})/) : null

    return {
      found: true,
      nsfw: m.nsfw === true,
      cover,
      description,
      score: m.rating?.score || undefined,
      votes: m.rating?.total || undefined,
      rank: m.rating?.rank || undefined,
      year: yearMatch ? +yearMatch[1] : undefined,
      matchedTitle,
      bgmId: m.id,
      tags: pickTags(m.tags)
    }
  } catch {
    return { found: false } // transient (network) — retry on next build
  }
}
