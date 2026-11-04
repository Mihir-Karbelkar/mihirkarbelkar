export interface Enquiry {
  name: string;
  email: string;
  projectType?: string;
  message: string;
}
/** The enquiry as a prefilled email, used when server delivery isn't configured or fails. */
export function mailtoHref(to: string, f: Enquiry) {
  const subject = `Project enquiry${f.projectType ? `: ${f.projectType}` : ''}`;
  const body = `${f.message}\n\n${f.name}\n${f.email}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
