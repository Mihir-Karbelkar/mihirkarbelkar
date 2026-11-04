const introUrl =
  import.meta.env?.PUBLIC_GOOGLE_CALENDAR_BOOKING_URL ||
  'https://calendar.google.com/calendar/appointments/schedules/AcZssZ0OlgwZzSNI5mQh_q6XAPT8fz1-1MvC6F5wmTuHtJ2LavDe9NclkvnFuxSnGNv28Ol-Nx0TIqpo';

export const booking = {
  email: import.meta.env?.PUBLIC_CONTACT_EMAIL || 'mihirkarbelkar@gmail.com',
  intro: {
    label: '15-min intro call',
    url: introUrl,
    embedUrl: `${introUrl}${introUrl.includes('?') ? '&' : '?'}gv=true`,
  },
  costAudit: {
    label: '30-min cost audit call',
    url: import.meta.env?.PUBLIC_GOOGLE_COST_AUDIT_BOOKING_URL || '',
  },
} as const;
