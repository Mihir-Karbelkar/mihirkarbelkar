const introUrl =
  import.meta.env?.PUBLIC_GOOGLE_CALENDAR_BOOKING_URL ||
  'https://calendar.google.com/calendar/appointments/schedules/AcZssZ38wGSTIVLCNgV_i9oJAPDfvozRjh1bqfKVp-1uC6BAZzMlg0-3EGm3S4Zoq10dfBt6fQfmaeq_';

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
