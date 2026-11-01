export type DeliveryOutcome = 'sent' | 'retry' | 'failed' | 'uncertain'
/** SES rejections that are permanent for alert and production-decision mail. */
export const rejectedSesErrors = ['MessageRejected','MailFromDomainNotVerifiedException','AccountSuspendedException','SendingPausedException','BadRequestException','UnverifiedRecipient','UserNotFoundException']

/** Only explicit throttling is retried. Unknown transport outcomes may already have
 * delivered the email, so they need operator review to avoid duplicates. */
export function failedOutcome(error: unknown, rejected: string[]): Exclude<DeliveryOutcome, 'sent'> {
  const name = (error as { name?: string }).name ?? ''
  return ['TooManyRequestsException','ThrottlingException','LimitExceededException'].includes(name) ? 'retry' : rejected.includes(name) ? 'failed' : 'uncertain'
}

interface LeasedDelivery<Job, Outcome extends string> {
  jobs: Job[]
  /** Sends one job and returns 'sent', or another non-failure outcome such as 'skipped'. */
  deliver: (job: Job) => Promise<Outcome>
  ack: (job: Job, outcome: Outcome | DeliveryOutcome) => Promise<{ updated?: boolean }>
  rejected: string[]
  ackError: string
}
/** Delivers claimed jobs one by one and acknowledges every lease before continuing. */
export async function deliverLeased<Job, Outcome extends string>({ jobs, deliver, ack, rejected, ackError }: LeasedDelivery<Job, Outcome>) {
  let sent = 0, failed = 0, skipped = 0
  for (const job of jobs) {
    let outcome: Outcome | DeliveryOutcome
    try { outcome = await deliver(job); if (outcome === 'sent') sent++; else skipped++ }
    catch (error) { outcome = failedOutcome(error, rejected); failed++ }
    if (!(await ack(job, outcome)).updated) throw new Error(ackError)
  }
  return { claimed: jobs.length, sent, failed, skipped }
}
