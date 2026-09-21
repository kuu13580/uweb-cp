import { defineContract } from 'uweb-cp'
import { z } from 'zod'

const idea = z.object({
  title: z.string().max(60),
  why: z.string().optional(),
  /** UI のバッジにそのまま流すので、揺れると壊れる。enum で固定する。 */
  effort: z.enum(['small', 'medium', 'large']),
})

export const ideaListSchema = z.object({
  topic: z.string(),
  ideas: z.array(idea).min(1).max(20),
})

export type IdeaList = z.infer<typeof ideaListSchema>
export type Idea = z.infer<typeof idea>

/**
 * zod ひとつから両方を出しているのが要点。
 * jsonSchema は LLM への説明、validate は受信値の関門で、役割が違うだけで出典は同じ。
 */
export const ideaListContract = defineContract<IdeaList>({
  id: 'idea.list',
  title: 'アイデアの一覧',
  description: 'お題について、具体的で重複のないアイデアを挙げてください。',
  jsonSchema: z.toJSONSchema(ideaListSchema),
  validate: ideaListSchema,
  examples: [
    {
      topic: 'チーム内 Wiki に足す機能',
      ideas: [
        {
          title: '未更新ページの棚卸しリマインド',
          why: '古い情報が残り続けるのが一番の害',
          effort: 'medium',
        },
        {
          title: 'ページ冒頭に「最終確認者」を出す',
          why: '誰に聞けばよいか分かる',
          effort: 'small',
        },
      ],
    },
  ],
})
