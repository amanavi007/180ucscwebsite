export interface AttributionDeps {
  findByToken(token: string): Promise<{ id: string } | null>;
  findByEmail(email: string): Promise<{ id: string } | null>;
  markBooked(prospectId: string): Promise<void>;
}

/**
 * After a client books an intro call, finds the outreach prospect behind it (by the link's lead token, else by email)
 * and marks them booked so no more follow-ups go out. Never throws: outreach must not be able to fail a booking.
 */
export async function attributeBooking(args: { leadToken?: string | null; email: string }, deps: AttributionDeps): Promise<void> {
  try {
    const byToken = args.leadToken ? await deps.findByToken(args.leadToken) : null;
    const prospect = byToken ?? (await deps.findByEmail(args.email.trim().toLowerCase()));
    if (prospect) await deps.markBooked(prospect.id);
  } catch (err) {
    console.error("outreach booking attribution failed:", err);
  }
}
