/**
 * Tracking link resolver:
 * Only returns custom tracking URLs manually provided by the operator.
 * Automatic third-party tracking URL generation (e.g. trackcourier.io) is strictly removed
 * per operational requirements.
 */
export function resolveTrackingUrl(
  _courierPartner?: string | null,
  _trackingId?: string | null,
  customTrackingLink?: string | null,
  _courierPresets?: Array<{ name: string; urlName: string; trackingUrlPattern?: string | null }>
): string | null {
  if (customTrackingLink && customTrackingLink.trim().startsWith("http")) {
    return customTrackingLink.trim();
  }

  // Automatic tracking URL generation is removed
  return null;
}
