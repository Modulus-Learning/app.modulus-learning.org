import { createRoute } from '@modulus-learning/host-tanstack-start/routes/$lng/_admin/admin/sign-in.route'

// An admin-surface page whose server functions are admin-gated, so the
// smoke test can check deployment-mode denial.
export const Route = createRoute('/$lng/_admin/admin/sign-in')
