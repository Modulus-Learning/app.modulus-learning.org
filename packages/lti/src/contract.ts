/**
 * The LMS adapter contract: everything core needs from the one LMS an
 * installation is connected to, as neutral values. Core calls the adapter;
 * the adapter never calls into core.
 *
 * See specs/2026-10-25-canvas-lti-package-extraction-spec.md. Launch
 * verification, the OIDC request and token exchange still live in core; they
 * move behind the adapter in a later increment.
 */

import type { PlatformMessage } from './messages/platform-originating/platform-message.js'
import type { AccessTokenSource, LtiAgsClient, LtiLogger, LtiRegistration } from './score.js'

/** Incremented on any change to what an adapter must provide or what core assumes. */
export const LMS_CONTRACT_VERSION = 1

export type LmsCapabilities = {
  /** Course-designer content selection (LTI deep linking). */
  deepLinking: boolean
  /** Launches carry an academic term, used to scope progress. */
  termMetadata: boolean
  /** The adapter can generate the LMS-side registration configuration. */
  registrationConfig: boolean
}

/** How usable a vendor-supplied field was, for fallback diagnostics. */
export type FieldQuality = 'missing' | 'empty' | 'unexpanded' | 'malformed' | 'usable'

/** An academic term as the LMS reports it; core maps it to an opaque scope. */
export type NormalizedTerm = {
  external_id: string
  name?: string
  starts_at?: Date
  ends_at?: Date
}

export type TermInspection = {
  term?: NormalizedTerm
  quality: Record<'term_id' | 'name' | 'starts_at' | 'ends_at', FieldQuality>
}

/** What a verified launch means, in neutral terms. Core applies the policy. */
export type LaunchInterpretation = {
  /** Whether the launch's roles make the user an instructor for Modulus. */
  isInstructor: boolean
  /** The launch's academic term, with field-quality diagnostics. */
  term: TermInspection
  /**
   * The vendor's own assignment-cutoff value, consulted only when the standard
   * `ResourceLink.available.endDateTime` custom field is not usable.
   */
  cutoffFallback?: unknown
}

/** Endpoints an LMS registration needs, derived from its issuer. */
export type RegistrationEndpoints = {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  authorization_server: string
}

export type RegistrationConfigInput = {
  /** The installation's public base URL. */
  baseUrl: string
  /** The installation's host name. */
  host: string
  /** The tool's public signing key, as published at its JWKS endpoint. */
  publicJwk: unknown
  title?: string
  description?: string
  tool_id?: string
  platform?: string
}

/**
 * Concurrency pacing for one registration's score passback. Core asks for the
 * current target, never exceeds its own configured cap, and reports each
 * response's scheduling signal and each hard rate limit.
 */
export interface SchedulingPolicy {
  /** The concurrency the policy currently allows (core caps it). */
  target(): number
  /** Observe a response's scheduling signal (opaque to core). */
  record(signal: unknown): void
  /** Return to a cold start, e.g. after a rate limit or an incident. */
  reset(): void
}

/** Core's score-submission settings that a score client and its policy use. */
export type ScoreClientSettings = {
  /** Abort a platform request after this long. */
  requestTimeoutSeconds: number
  /** Core's concurrency cap for one registration. */
  maxConcurrentSubmissions: number
  /** Quota the policy keeps in reserve. */
  quotaReserveRequests: number
  /** How long quota readings stay relevant. */
  quotaWindowMs: number
  /** The minimum interval between concurrency increases. */
  quotaRampIntervalMs: number
}

export type ScoreClientDeps = {
  registration: LtiRegistration
  accessTokens: AccessTokenSource
  logger: LtiLogger
  settings: ScoreClientSettings
}

/** A registration-bound score client and its scheduling policy. */
export type LmsScoreClient = {
  client: LtiAgsClient
  scheduling: SchedulingPolicy
}

export interface LmsAdapter {
  /** Stable adapter identifier, e.g. `canvas`. */
  readonly id: string
  /** The contract version the adapter implements; core refuses a mismatch. */
  readonly contractVersion: number
  readonly capabilities: LmsCapabilities

  /** Interpret a verified launch's claims. */
  interpretLaunch(launch: PlatformMessage): LaunchInterpretation

  /**
   * Custom fields the adapter adds to every deep-link content item, typically
   * the LMS's substitution variables. Core's own `modulus_*` fields always win.
   */
  deepLinkCustomFields(): Record<string, string>

  /** The endpoints a registration for `issuer` uses. */
  registrationEndpoints(issuer: string): RegistrationEndpoints

  /** The LMS-side registration configuration, as JSON (capability `registrationConfig`). */
  registrationConfig?(input: RegistrationConfigInput): string

  /** A score client bound to one registration. */
  createScoreClient(deps: ScoreClientDeps): LmsScoreClient
}

/** Fail fast when an adapter implements a different contract version. */
export const assertLmsAdapter = (adapter: LmsAdapter): LmsAdapter => {
  if (adapter.contractVersion !== LMS_CONTRACT_VERSION) {
    throw new Error(
      `LMS adapter "${adapter.id}" implements contract version ${adapter.contractVersion}; this build requires ${LMS_CONTRACT_VERSION}`
    )
  }
  return adapter
}
