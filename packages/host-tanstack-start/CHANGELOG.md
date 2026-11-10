# @modulus-learning/host-tanstack-start

## 0.11.3

### Patch Changes

- fixed **`@modulus-learning/host-tanstack-start`** so a Response thrown from a gated server function keeps its 400/401/409 status under Nitro 3.0.261029-rc and later, by turning off Nitro's `fastResponse` polyfill in `modulusNitroOptions()`
- Updated dependencies
  - @modulus-learning/core@0.11.3
  - @modulus-learning/lti@0.11.3

## 0.11.2

### Patch Changes

- 431da36: changed the server packages to mpl-2.0 and removed project-specific ownership claims; retained mit for the browser agent and demos
- Updated dependencies [431da36]
  - @modulus-learning/core@0.11.2
  - @modulus-learning/lti@0.11.2

## 0.11.1

### Patch Changes

- first publish of **`@modulus-learning/core`**, **`@modulus-learning/host-tanstack-start`**, **`@modulus-learning/lti`** and **`@modulus-learning/lms-canvas`**, with release-script schema commands and a non-destructive bootstrap
  hardened lti identity linking, token caching and registration binding
- Updated dependencies
  - @modulus-learning/core@0.11.1
  - @modulus-learning/lti@0.11.1
