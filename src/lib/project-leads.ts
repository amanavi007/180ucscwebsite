/**
 * The single-select PM/SC dropdowns only ever show a project's *primary* lead
 * (the oldest 'pm'/'sc' membership), so they can't express "leave the other
 * leads alone". This works out what a save of that dropdown should change:
 * nothing if the pick matches the current primary, otherwise swap just the
 * old primary for the new pick.
 */
export interface LeadChange {
  /** Primary lead to drop back to 'member', if any. */
  demote: string | null;
  /** Person to make a lead, if any. */
  promote: string | null;
}

export function planLeadChange(
  currentPrimaryId: string | null | undefined,
  requestedId: string | null | undefined,
): LeadChange | null {
  const current = currentPrimaryId || null;
  const requested = requestedId || null;
  if (current === requested) return null;
  return { demote: current, promote: requested };
}
