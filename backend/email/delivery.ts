type DeliveryOutcome = 'sent' | 'retry' | 'failed' | 'uncertain'
/** SES rejections that are permanent for alert and production-decision mail. */
export const rejectedSesErrors = ['MessageRejected','MailFromDomainNotVerifiedException','AccountSuspendedException','SendingPausedException','BadRequestException','UnverifiedRecipient','UserNotFoundException']

/** Preparation can be retried because it has no provider send side effects. */
export async function prepareDelivery<T>(operation:()=>Promise<T>,rejected=rejectedSesErrors):Promise<T> {
  try { return await operation() }
  catch(error) {
    if(error instanceof Error&&rejected.includes(error.name))throw error
    throw Object.assign(new Error('Delivery preparation failed',{cause:error}),{name:'DeliveryPreparationError'})
  }
}

/** Only explicit throttling is retried. Unknown transport outcomes may already have
 * delivered the email, so they need operator review to avoid duplicates. */
function failedOutcome(error: unknown, rejected: string[]): Exclude<DeliveryOutcome, 'sent'> {
  const name = (error as { name?: string }).name ?? ''
  return ['TooManyRequestsException','ThrottlingException','LimitExceededException','DeliveryPreparationError'].includes(name) ? 'retry' : rejected.includes(name) ? 'failed' : 'uncertain'
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
  const acknowledgmentErrors:unknown[] = []
  for (const job of jobs) {
    let outcome: Outcome | DeliveryOutcome
    try { outcome = await deliver(job); if (outcome === 'sent') sent++; else skipped++ }
    catch (error) { outcome = failedOutcome(error, rejected); failed++ }
    try {
      if (!(await ack(job, outcome)).updated) acknowledgmentErrors.push(new Error(ackError))
    } catch (error) { acknowledgmentErrors.push(error) }
  }
  if(acknowledgmentErrors.length)throw new AggregateError(acknowledgmentErrors,ackError)
  return { claimed: jobs.length, sent, failed, skipped }
}
