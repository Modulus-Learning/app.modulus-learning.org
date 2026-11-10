/**
 * Server field errors describe the values that were submitted, not whatever
 * the form holds when the response arrives. An instructor can keep editing
 * while a submission is pending, so comparing against the latest response
 * alone would attach an old rejection to a corrected value -- and, where an
 * error disables Submit, block resubmitting it.
 *
 * This wraps a form's server action so every response carries the field
 * values from its own submission. A form shows a server error only while the
 * field still holds that submitted value.
 */

export type WithSubmittedValues<State, Values> = State & { submitted?: Values }

export interface SubmissionPayload<Values> {
  formData: FormData
  /** The field values as the form held them when this submission was made. */
  submitted: Values
}

export function withSubmittedValues<State extends object, Values>(
  action: (prevState: State, formData: FormData) => Promise<State>
) {
  return async (
    prevState: WithSubmittedValues<State, Values>,
    { formData, submitted }: SubmissionPayload<Values>
  ): Promise<WithSubmittedValues<State, Values>> => {
    // The tag is client state; the server action never sees it.
    const { submitted: _previous, ...state } = prevState
    return { ...(await action(state as State, formData)), submitted }
  }
}
