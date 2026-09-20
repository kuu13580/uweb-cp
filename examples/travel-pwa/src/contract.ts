import { defineContract } from 'uweb-cp'
import { z } from 'zod'

const stop = z.object({
  time: z.string().optional(),
  place: z.string(),
  note: z.string().optional(),
})

const day = z.object({
  day: z.number().int().min(1),
  date: z.string().optional(),
  title: z.string(),
  stops: z.array(stop).min(1),
})

export const itinerarySchema = z.object({
  destination: z.string(),
  summary: z.string().optional(),
  days: z.array(day).min(1),
})

export type Itinerary = z.infer<typeof itinerarySchema>

/**
 * zod ひとつから両方を出しているのが要点。
 * jsonSchema は LLM への説明、validate は受信値の関門で、役割が違うだけで出典は同じ。
 */
export const itineraryContract = defineContract<Itinerary>({
  id: 'trip.itinerary',
  title: '旅行日程',
  description: '旅行の日程表を作ってください。',
  jsonSchema: z.toJSONSchema(itinerarySchema),
  validate: itinerarySchema,
  examples: [
    {
      destination: '金沢',
      summary: '兼六園と近江町市場を中心に',
      days: [
        {
          day: 1,
          title: '到着と東茶屋街',
          stops: [
            { time: '14:00', place: '金沢駅', note: '荷物をコインロッカーへ' },
            { time: '15:30', place: 'ひがし茶屋街' },
          ],
        },
      ],
    },
  ],
})
