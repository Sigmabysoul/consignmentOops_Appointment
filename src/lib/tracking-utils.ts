export function resolveTrackingUrl(
  courierPartner?: string | null,
  trackingId?: string | null,
  customTrackingLink?: string | null,
  courierPresets?: Array<{ name: string; urlName: string; trackingUrlPattern?: string | null }>
): string | null {
  if (customTrackingLink && customTrackingLink.trim().startsWith("http")) {
    return customTrackingLink.trim();
  }

  if (!trackingId || !trackingId.trim()) {
    return null;
  }

  const cleanTrackingId = encodeURIComponent(trackingId.trim());

  if (!courierPartner || !courierPartner.trim()) {
    return `https://trackcourier.io/track-and-trace/${cleanTrackingId}`;
  }

  const cpName = courierPartner.trim().toLowerCase();

  if (courierPresets && courierPresets.length > 0) {
    const matched = courierPresets.find(
      (p) => p.name.toLowerCase() === cpName || p.urlName.toLowerCase() === cpName
    );
    if (matched) {
      const pattern =
        matched.trackingUrlPattern || "https://trackcourier.io/track-and-trace/{urlName}/{trackingId}";
      return pattern
        .replace("{urlName}", matched.urlName)
        .replace("{trackingId}", cleanTrackingId);
    }
  }

  // Fallback slug generation
  const slug = cpName.replace(/[^a-z0-9]+/g, "-");
  return `https://trackcourier.io/track-and-trace/${slug}/${cleanTrackingId}`;
}
