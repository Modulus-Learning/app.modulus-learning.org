import { booleanSchema } from '@infonomic/schemas'
import { z } from 'zod'

import type { ActivityCodeRecord, ActivityRecord } from './repository/index.js'

// ==============================================
//  Output schemas
// ==============================================

// ----------------------------------------------
//  ActivityCode
// ----------------------------------------------

export const activityCodeSchema = z.strictObject({
  id: z.uuid(),
  created_by: z.uuid().nullable(),
  code: z.string(),
  private_code: z.string(),
  url_prefix: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type ActivityCode = z.infer<typeof activityCodeSchema>

export const toActivityCode = ({
  id,
  created_by,
  code,
  private_code,
  url_prefix,
  description,
  created_at,
  updated_at,
}: ActivityCodeRecord): ActivityCode => {
  return {
    id,
    created_by,
    code,
    private_code,
    url_prefix,
    description,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  }
}

// ----------------------------------------------
//  ActivityCodeMember
// ----------------------------------------------

export const activityCodeMemberSchema = z.strictObject({
  activity_code_id: z.uuid(),
  user_id: z.uuid(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.iso.datetime(),
})

export type ActivityCodeMember = z.infer<typeof activityCodeMemberSchema>

// ----------------------------------------------
//  InstructorSearchResult
// ----------------------------------------------

export const instructorSearchResultSchema = z.strictObject({
  user_id: z.uuid(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
})

export type InstructorSearchResult = z.infer<typeof instructorSearchResultSchema>

// ----------------------------------------------
//  Activity
// ----------------------------------------------

export const activitySchema = z.strictObject({
  id: z.uuid(),
  name: z.string().optional(),
  url: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type Activity = z.infer<typeof activitySchema>

export const toActivity = ({ id, name, url, created_at, updated_at }: ActivityRecord): Activity => {
  return {
    id,
    name: name ?? undefined,
    url,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  }
}

// ----------------------------------------------
//  Progress
// ----------------------------------------------

export const progressItemSchema = z.strictObject({
  user_id: z.uuid(),
  full_name: z.string().nullable(),
  activity_code: z.string(),
  activity_code_id: z.uuid(),
  progress: z.number().nullable(),
  activity_name: z.string().nullable(),
  activity_url: z.string(),
  created_at: z.iso.datetime().nullable(),
  updated_at: z.iso.datetime().nullable(),
})

// export const toProgress = () => {}

export type ProgressItem = z.infer<typeof progressItemSchema>

// ----------------------------------------------
//  ProgressReport
// ----------------------------------------------

export const progressReportSchema = z.strictObject({
  progress: z.array(progressItemSchema),
  included: z.strictObject({
    activity_code: activityCodeSchema,
  }),
  meta: z.strictObject({
    total: z.int(),
    total_pages: z.int(),
    page: z.int(),
    page_size: z.int(),
    order: z.enum(['updated_at', 'full_name', 'progress']),
    query: z.string().optional(),
    desc: z.boolean(),
  }),
})

export type ProgressReport = z.infer<typeof progressReportSchema>

// ----------------------------------------------
//  ActivityCodeWithActivities
// ----------------------------------------------

export const activityCodeWithActivitiesSchema = z.strictObject({
  activity_code: activityCodeSchema,
  activities: activitySchema.array(),
})

export type ActivityCodeWithActivities = z.infer<typeof activityCodeWithActivitiesSchema>

// ----------------------------------------------
//  StartActivityResponse
// ----------------------------------------------

export const startActivityResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.string(),
    full_name: z.string().optional(),
  }),
  activity_code: z.strictObject({
    id: z.string(),
    code: z.string(),
  }),
  activity: z.strictObject({
    id: z.string(),
    name: z.string().optional(),
    url: z.url(),
  }),
  scope_id: z.uuid(),
  scope_name: z.string().nullable(),
  modulus_server_url: z.string(),
})

export type StartActivityResponse = z.infer<typeof startActivityResponseSchema>

// ==============================================
//  Input schemas
// ==============================================

export const progressSearchOptionsSchema = z.object({
  page: z.coerce.number().int().optional().default(1),
  page_size: z.coerce.number().int().optional().default(25),
  order: z.enum(['updated_at', 'full_name', 'progress']).default('updated_at'),
  query: z
    .string()
    .max(128, { error: 'query must be a string with a maximum of 128 characters' })
    .optional(),
  desc: booleanSchema(true),
})

export type ProgressSearchOptions = z.infer<typeof progressSearchOptionsSchema>

// ----------------------------------------------
//  ProgressRequestSchema
// ----------------------------------------------

export const progressRequestSchema = z.strictObject({
  id: z.uuid(),
  options: progressSearchOptionsSchema,
})

export type ProgressRequest = z.infer<typeof progressRequestSchema>

// ----------------------------------------------
//  CreateActivityCodeRequest
// ----------------------------------------------

export const createActivityCodeRequestSchema = z.strictObject({
  code: z
    .string()
    .min(5, 'activity_code must be a string with a minimum of 5 characters')
    .max(60, 'activity_code must be a string with a maximum of 200 characters')
    .regex(/^[a-zA-Z0-9-]+$/, 'activity_code must be alphanumeric with dashes'),
  url_prefix: z.string().max(255).nullable().optional(),
  description: z.string().max(1024).nullable().optional(),

  // TODO: enforce more rules here, like starting with https?
  urls: z.url().array(),
})

export type CreateActivityCodeRequest = z.infer<typeof createActivityCodeRequestSchema>

// ----------------------------------------------
//  UpdateActivityCodeRequest
// ----------------------------------------------

export const updateActivityCodeRequestSchema = z.strictObject({
  id: z.uuid(),
  url_prefix: z.string().max(255).nullable().optional(),
  description: z.string().max(1024).nullable().optional(),

  // TODO: enforce more rules here, like starting with https?
  urls: z.url().array(),
})

export type UpdateActivityCodeRequest = z.infer<typeof updateActivityCodeRequestSchema>

// ----------------------------------------------
//  StartActivityRequest
// ----------------------------------------------

// TODO: Revisit this schema
export const startActivityRequestSchema = z.object({
  activity_code: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Activity code is required.'
          : 'Activity code must be a string.',
    })
    .min(4, {
      error: 'Valid activity code is required',
    })
    // TODO: check!!!
    .max(26, {
      error: 'Activity code is too long.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Activity code cannot be empty.'),
  activity_url: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Activity URL is required.' : 'Activity URL must be a string.',
    })
    .min(4, {
      error: 'Valid activity URL is required',
    })
    // TODO: check!!!
    .max(256, {
      error: 'Activity URL is too long.',
    })
    .transform((s) => s.trim())
    .pipe(z.url({ error: 'Valid activity URL is required.' })),
  scope_id: z.uuid(),
})

export type StartActivityRequest = z.infer<typeof startActivityRequestSchema>

// ----------------------------------------------
//  Membership requests
// ----------------------------------------------

export const addActivityCodeMemberRequestSchema = z.strictObject({
  activity_code_id: z.uuid(),
  user_id: z.uuid(),
})

export type AddActivityCodeMemberRequest = z.infer<typeof addActivityCodeMemberRequestSchema>

export const removeActivityCodeMemberRequestSchema = z.strictObject({
  activity_code_id: z.uuid(),
  user_id: z.uuid(),
})

export type RemoveActivityCodeMemberRequest = z.infer<typeof removeActivityCodeMemberRequestSchema>

export const searchInstructorsRequestSchema = z.strictObject({
  activity_code_id: z.uuid(),
  query: z.string().max(128).default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

export type SearchInstructorsRequest = z.infer<typeof searchInstructorsRequestSchema>
