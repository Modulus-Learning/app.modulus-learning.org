import type {
  CLAIM_CUSTOM,
  FieldQuality,
  NormalizedTerm,
  PlatformMessage,
  TermInspection,
} from '@modulus-learning/lti'
import { z } from 'zod'

/**
 * Canvas term metadata: the `Canvas.term.*` substitution variables a Modulus
 * resource link requests (see `deep-link-fields.ts`), inspected with a quality
 * per field so a fallback can say why it happened.
 */

type CustomFields = PlatformMessage[typeof CLAIM_CUSTOM]

type NormalizedCanvasField<T> = {
  value?: T
  quality: FieldQuality
}

const canvasTermDateSchema = z.iso.datetime({ offset: true })

const inspectCanvasString = (custom: CustomFields, key: string): NormalizedCanvasField<string> => {
  const value = custom[key]
  if (value == null) {
    return { quality: 'missing' }
  }
  if (typeof value !== 'string') {
    return { quality: 'malformed' }
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return { quality: 'empty' }
  }
  if (normalized === `$${key}`) {
    return { quality: 'unexpanded' }
  }

  return { value: normalized, quality: 'usable' }
}

const inspectCanvasDate = (custom: CustomFields, key: string): NormalizedCanvasField<Date> => {
  const inspected = inspectCanvasString(custom, key)
  if (inspected.value == null) {
    return { quality: inspected.quality }
  }
  if (!canvasTermDateSchema.safeParse(inspected.value).success) {
    return { quality: 'malformed' }
  }

  return { value: new Date(inspected.value), quality: 'usable' }
}

export const inspectCanvasTerm = (custom: CustomFields): TermInspection => {
  const externalId = inspectCanvasString(custom, 'Canvas.term.id')
  const name = inspectCanvasString(custom, 'Canvas.term.name')
  const startsAt = inspectCanvasDate(custom, 'Canvas.term.startAt')
  const endsAt = inspectCanvasDate(custom, 'Canvas.term.endAt')
  const quality = {
    term_id: externalId.quality,
    name: name.quality,
    starts_at: startsAt.quality,
    ends_at: endsAt.quality,
  }

  if (externalId.value == null) {
    return { quality }
  }

  return {
    term: {
      external_id: externalId.value,
      name: name.value,
      starts_at: startsAt.value,
      ends_at: endsAt.value,
    },
    quality,
  }
}

export const normalizeCanvasTerm = (custom: CustomFields): NormalizedTerm | undefined =>
  inspectCanvasTerm(custom).term
