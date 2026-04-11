import { z } from 'zod'

export const getTotalRegisteredUsersSchemas = {
  input: z.void(),
  output: z.object({
    total: z.number(),
  }),
}

export const getRegistrationsPerDaySchemas = {
  input: z.object({
    year: z.number().optional(),
    month: z.number().optional(),
  }),
  output: z.object({
    data: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
      })
    ),
    meta: z.object({
      year: z.number(),
      month: z.number(),
    }),
    included: z.object({
      years: z.number().array(),
      months: z.number().array(),
    }),
  }),
}

export const getRegistrationsPerMonthSchemas = {
  input: z.object({
    year: z.number().optional(),
  }),
  output: z.object({
    data: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
      })
    ),
    meta: z.object({
      year: z.number(),
    }),
    included: z.object({
      years: z.number().array(),
    }),
  }),
}

export const getMonthlyActiveUsersSchemas = {
  input: z.object({
    year: z.number().optional(),
  }),
  output: z.object({
    data: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
      })
    ),
    meta: z.object({
      year: z.number(),
    }),
    included: z.object({
      years: z.number().array(),
    }),
  }),
}

export const getNewVsReturningUsersSchemas = {
  input: z.object({
    year: z.number().optional(),
  }),
  output: z.object({
    data: z.array(
      z.object({
        name: z.string(),
        new: z.number(),
        returning: z.number(),
      })
    ),
    meta: z.object({
      year: z.number(),
    }),
    included: z.object({
      years: z.number().array(),
    }),
  }),
}

// export type GetTotalRegisteredUsersRequest = z.infer<typeof getTotalRegisteredUsersSchema.input>
export type GetTotalRegisteredUsersResponse = z.infer<typeof getTotalRegisteredUsersSchemas.output>
export type GetRegistrationsPerDayRequest = z.infer<typeof getRegistrationsPerDaySchemas.input>
export type GetRegistrationsPerDayResponse = z.infer<typeof getRegistrationsPerDaySchemas.output>
export type GetRegistrationsPerMonthRequest = z.infer<typeof getRegistrationsPerMonthSchemas.input>
export type GetRegistrationsPerMonthResponse = z.infer<
  typeof getRegistrationsPerMonthSchemas.output
>
export type GetMonthlyActiveUsersRequest = z.infer<typeof getMonthlyActiveUsersSchemas.input>
export type GetMonthlyActiveUsersResponse = z.infer<typeof getMonthlyActiveUsersSchemas.output>
export type GetNewVsReturningUsersRequest = z.infer<typeof getNewVsReturningUsersSchemas.input>
export type GetNewVsReturningUsersResponse = z.infer<typeof getNewVsReturningUsersSchemas.output>
