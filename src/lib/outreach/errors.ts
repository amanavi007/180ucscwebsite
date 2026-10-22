/** Resend refused the outreach account itself (bad key, suspended, domain not verified), not a single email. */
export class OutreachAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutreachAccountError";
  }
}
