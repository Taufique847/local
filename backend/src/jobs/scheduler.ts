import * as cron from 'node-cron';
import { LeadRecoveryService } from '../services/lead-recovery.service';
import { ReviewReputationService } from '../services/review-reputation.service';
import { AppointmentReminderService } from '../services/appointment-reminder.service';
import { RecurrenceService } from '../services/recurrence.service';
import { BillingService } from '../services/billing.service';
import { DataRetentionService } from '../services/data-retention.service';
import { LockService } from '../services/lock.service';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'scheduler' });

interface JobDefinition {
  name: string;
  /** Standard 5-field cron expression. */
  schedule: string;
  run: () => Promise<unknown>;
  /**
   * How long the cross-instance lock is held. Must exceed the job's realistic
   * worst-case runtime, or a second instance could start a duplicate run while
   * the first is still working.
   */
  lockTtlMs: number;
}

interface JobStatus {
  name: string;
  schedule: string;
  lastRunAt?: Date;
  lastDurationMs?: number;
  lastError?: string;
  runCount: number;
  errorCount: number;
  /** True while an execution is in flight; prevents overlapping runs. */
  running: boolean;
}

/**
 * In-process job scheduler.
 *
 * This closes the single biggest functional gap in the platform: every
 * time-based automation was implemented and durable in MongoDB, but nothing ever
 * ticked. `LeadRecoveryService.processDueDrips` was reachable only from an
 * authenticated HTTP endpoint, so speed-to-lead steps 2 and 3 never fired in
 * production; `ReviewCampaign.slaDeadlineAt` was written and never read; expired
 * trials stayed active forever.
 *
 * Deliberately in-process rather than a queue: the work is low-volume, already
 * idempotent, and driven by indexed `dueAt`-style queries, so Redis/BullMQ would
 * add an operational dependency without buying anything yet. Because state lives
 * in MongoDB and not in timers, a restart loses nothing — it just resumes on the
 * next tick.
 *
 * Safe to run on every instance: each tick takes a per-job lock in MongoDB, so
 * only one replica executes a given job at a time. ENABLE_SCHEDULER=false still
 * opts an instance out entirely, but correctness no longer depends on it.
 */
export class JobScheduler {
  private static tasks: cron.ScheduledTask[] = [];
  private static statuses: Map<string, JobStatus> = new Map();
  private static started = false;

  private static readonly jobs: JobDefinition[] = [
    {
      name: 'lead_recovery_drips',
      // Every minute: speed-to-lead is a race against the caller ringing a
      // competitor, so follow-up latency matters.
      schedule: '* * * * *',
      run: () => LeadRecoveryService.processDueDrips(),
      lockTtlMs: 55_000,
    },
    {
      name: 'review_surveys',
      schedule: '*/5 * * * *',
      run: () => ReviewReputationService.processDueSurveys(),
      lockTtlMs: 4 * 60_000,
    },
    {
      name: 'review_sla_breaches',
      schedule: '*/15 * * * *',
      run: () => ReviewReputationService.processSlaBreaches(),
      lockTtlMs: 10 * 60_000,
    },
    {
      name: 'appointment_reminders',
      /**
       * Every fifteen minutes.
       *
       * Fine-grained enough that a reminder lands close to its configured lead
       * time, and coarse enough that a business whose quiet-hours window has just
       * opened does not get its whole backlog fired inside one minute. Nothing is
       * lost between ticks: due-ness is derived from `startAt` and the claim is a
       * durable field, not a timer.
       */
      schedule: '*/15 * * * *',
      run: () => AppointmentReminderService.processDueReminders(),
      // Comfortably longer than a full 500-appointment batch, so the lock cannot
      // expire mid-run and admit a second instance.
      lockTtlMs: 10 * 60_000,
    },
    {
      name: 'recurrence_topup',
      /**
       * Twice a day, off-peak.
       *
       * A series is materialised 120 days ahead, so the window only needs extending on a
       * scale of weeks — running this every minute would ask the same question thousands
       * of times for an answer that changes once a quarter. Twice rather than once so a
       * single missed run is not a whole day of drift, and off-peak because it takes the
       * per-business booking lock and should not be competing with live bookings for it.
       */
      schedule: '25 4,16 * * *',
      run: () => RecurrenceService.topUpSeries(),
      // Comfortably longer than 500 series each generating up to 60 occurrences.
      lockTtlMs: 30 * 60_000,
    },
    {
      name: 'expire_trials',
      // Hourly is enough: a trial ending is not time-critical to the minute.
      schedule: '17 * * * *',
      run: () => BillingService.expireEndedTrials(),
      lockTtlMs: 5 * 60_000,
    },
    {
      name: 'data_retention',
      // Nightly, off-peak. No-ops entirely unless DATA_RETENTION_DAYS is set.
      schedule: '40 3 * * *',
      run: () => DataRetentionService.runRetentionSweep(),
      lockTtlMs: 30 * 60_000,
    },
  ];

  public static start(): void {
    if (this.started) return;

    if (!config.enableScheduler) {
      log.warn('scheduler_disabled', {
        reason: 'ENABLE_SCHEDULER is false — drip follow-ups, review surveys and trial expiry will not run on this instance',
      });
      return;
    }

    for (const job of this.jobs) {
      this.statuses.set(job.name, {
        name: job.name,
        schedule: job.schedule,
        runCount: 0,
        errorCount: 0,
        running: false,
      });

      const task = cron.schedule(job.schedule, () => {
        void this.execute(job);
      });

      this.tasks.push(task);
    }

    this.started = true;
    log.info('scheduler_started', {
      jobs: this.jobs.map((j) => ({ name: j.name, schedule: j.schedule })),
    });
  }

  /**
   * Runs one job with overlap protection, cross-instance exclusion and error
   * isolation.
   *
   * Two separate guards, because they stop different things:
   *
   *  - `status.running` stops a slow run stacking up behind itself in this
   *    process.
   *  - The distributed lock stops a second replica running the same job at the
   *    same time. That used to be a comment asking operators to set
   *    ENABLE_SCHEDULER=false everywhere but one host; a single misconfigured
   *    deploy meant every lead got two follow-up texts.
   */
  private static async execute(job: JobDefinition): Promise<void> {
    const status = this.statuses.get(job.name);
    if (!status) return;

    if (status.running) {
      log.warn('job_skipped_still_running', { job: job.name });
      return;
    }

    const lockKey = `job:${job.name}`;
    let lockOwner: string | null = null;

    try {
      lockOwner = await LockService.tryAcquire(lockKey, job.lockTtlMs);
    } catch (err: any) {
      // A lock store failure must not silently turn exclusion off.
      log.error('job_lock_error', { job: job.name, reason: err?.message });
      return;
    }

    if (!lockOwner) {
      log.debug('job_skipped_locked_elsewhere', { job: job.name });
      return;
    }

    status.running = true;
    const startedAt = Date.now();

    try {
      const result = await job.run();
      status.lastError = undefined;
      status.runCount++;

      // Only log when the job actually did something, so a per-minute job does
      // not bury the logs in no-op lines.
      const didWork =
        typeof result === 'number'
          ? result > 0
          : result && typeof result === 'object'
            ? Object.values(result as Record<string, unknown>).some(
                (v) => typeof v === 'number' && v > 0
              )
            : false;

      if (didWork) {
        log.info('job_completed', {
          job: job.name,
          durationMs: Date.now() - startedAt,
          result,
        });
      }
    } catch (err: any) {
      status.errorCount++;
      status.lastError = err?.message || 'unknown error';
      log.error('job_failed', { job: job.name, durationMs: Date.now() - startedAt, err });
    } finally {
      status.running = false;
      status.lastRunAt = new Date();
      status.lastDurationMs = Date.now() - startedAt;
      await LockService.release(lockKey, lockOwner);
    }
  }

  public static stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    this.started = false;
    log.info('scheduler_stopped');
  }

  /** Exposed on the health endpoint so a stalled job is visible. */
  public static getStatus(): {
    enabled: boolean;
    started: boolean;
    jobs: Array<Omit<JobStatus, 'running'> & { running: boolean }>;
  } {
    return {
      enabled: config.enableScheduler,
      started: this.started,
      jobs: Array.from(this.statuses.values()),
    };
  }

  /**
   * Runs a single job on demand, bypassing its cron schedule.
   * Used by the authenticated admin trigger endpoints.
   */
  public static async runNow(name: string): Promise<boolean> {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) return false;

    if (!this.statuses.has(name)) {
      this.statuses.set(name, {
        name,
        schedule: job.schedule,
        runCount: 0,
        errorCount: 0,
        running: false,
      });
    }

    await this.execute(job);
    return true;
  }

  public static jobNames(): string[] {
    return this.jobs.map((j) => j.name);
  }
}
