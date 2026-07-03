import type { CoreLogger } from '@/lib/logger.js'
import type { IncidentRecord } from './repository.js'

/**
 * Delivery seam for incident notifications. The notifier decides *when* to page
 * and all-clear (and guarantees exactly-once via DB latches); a sink decides
 * *how* a notification is delivered. Swap in an email/Slack/PagerDuty sink by
 * implementing this interface.
 */
export interface IncidentSink {
  page(incident: IncidentRecord): Promise<void>
  allClear(incident: IncidentRecord): Promise<void>
}

const activeSpanSeconds = (incident: IncidentRecord): number =>
  Math.round((incident.last_failure_at.getTime() - incident.opened_at.getTime()) / 1000)

const totalDurationSeconds = (incident: IncidentRecord): number | undefined =>
  incident.resolved_at
    ? Math.round((incident.resolved_at.getTime() - incident.opened_at.getTime()) / 1000)
    : undefined

/**
 * Default sink: emits a structured high-severity log line. Delivery here cannot
 * fail, which suits the notifier's claim-then-deliver (at-most-once) ordering;
 * a real alert channel that can fail should be added behind this same interface.
 */
export class LoggingIncidentSink implements IncidentSink {
  constructor(private readonly logger: CoreLogger) {}

  async page(incident: IncidentRecord): Promise<void> {
    this.logger.error(
      {
        incident_id: incident.id,
        platform_issuer: incident.platform_issuer,
        severity: incident.severity,
        trigger_category: incident.trigger_category,
        categories_seen: incident.categories_seen,
        failure_count: incident.failure_count,
        distinct_affected_lineitems: incident.distinct_affected_lineitems,
        opened_at: incident.opened_at,
        last_failure_at: incident.last_failure_at,
        active_span_seconds: activeSpanSeconds(incident),
      },
      'LTI score-submission incident — paging'
    )
  }

  async allClear(incident: IncidentRecord): Promise<void> {
    this.logger.warn(
      {
        incident_id: incident.id,
        platform_issuer: incident.platform_issuer,
        opened_at: incident.opened_at,
        resolved_at: incident.resolved_at,
        total_duration_seconds: totalDurationSeconds(incident),
      },
      'LTI score-submission incident resolved — all clear'
    )
  }
}
