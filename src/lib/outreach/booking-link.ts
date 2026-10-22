export function buildBookingUrl(siteUrl: string, bookingToken: string): string {
  return `${siteUrl.replace(/\/$/, "")}/services/book?lead=${encodeURIComponent(bookingToken)}`;
}
