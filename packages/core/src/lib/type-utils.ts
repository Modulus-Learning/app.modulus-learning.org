export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type WithRequired<T, K extends keyof T> = Prettify<T & { [P in K]-?: NonNullable<T[P]> }>
export type WithOptional<T, K extends keyof T> = Prettify<Omit<T, K> & Partial<Pick<T, K>>>
