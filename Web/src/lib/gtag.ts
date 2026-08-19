export const GA_MEASUREMENT_ID = "G-Q9C8LN40T5";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function sendGAEvent({
  action,
  category,
  label,
  value,
  params,
}: {
  action: string;
  category?: string;
  label?: string;
  value?: number;
  params?: Record<string, unknown>;
}) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
      value,
      ...params,
    });
  }
}
