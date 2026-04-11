import { integerFromStringSchema } from '@infonomic/schemas'
import { z } from 'zod'

export const validateSearchParamsSchema = z.strictObject({
  year: integerFromStringSchema.optional(),
  month: integerFromStringSchema.optional(),
}) // Ensures no extra properties are allowed

export interface TotalRegisteredUsers {
  total: number
}

export interface RegistrationsPerDay {
  data: Datum[]
  meta: MetaYearMonth
  included: IncludedYearsMonths
}

export interface RegistrationsPerMonth {
  data: Datum[]
  meta: MetaYear
  included: IncludedYears
}

export interface MonthlyActiveUsers {
  data: Datum[]
  meta: MetaYear
  included: IncludedYears
}

export interface NewVsReturningUsers {
  data: NewVsReturningDatum[]
  meta: MetaYear
  included: IncludedYears
}

export interface NewVsReturningDatum {
  name: string
  new: number
  returning: number
}

export interface Datum {
  name: string
  value: number
}

export interface IncludedYears {
  years: number[]
}

export interface MetaYear {
  year: number
}

export interface IncludedYearsMonths {
  years: number[]
  months: number[]
}

export interface MetaYearMonth {
  year: number
  month: number
}
