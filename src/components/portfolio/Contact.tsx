import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../ui/button';
import { mailtoHref } from '../../lib/enquiry';
export interface ContactProps {
  email: string;
  topics: string[];
}
export default function Contact({ email, topics }: ContactProps) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  // Server delivery (Resend) when configured; otherwise the visitor's email app.
  const [delivery, setDelivery] = useState<'server' | 'mail'>('mail');
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ contact: boolean }>)
      .then((c) => c.contact && setDelivery('server'))
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form)) as Record<
      string,
      string
    >;
    if (fields.website) return;
    const enquiry = {
      name: fields.name.trim(),
      email: fields.email.trim(),
      projectType: fields.projectType || undefined,
      message: fields.message.trim(),
    };
    if (delivery === 'mail') {
      location.href = mailtoHref(email, enquiry);
      setState({
        ok: true,
        text: `Your email app should open with the enquiry ready to send. If it doesn’t, email ${email}.`,
      });
      return;
    }
    setBusy(true);
    setState(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...enquiry, website: '' }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error);
      setState({ ok: true, text: 'Thanks, your enquiry is on its way.' });
      form.reset();
    } catch {
      // Fall back to the email app rather than losing the message.
      location.href = mailtoHref(email, enquiry);
      setState({
        ok: false,
        text: `Sending failed, so your email app should open instead. You can also email ${email}.`,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="contact-name">Your name</label>
          <input
            id="contact-name"
            name="name"
            required
            maxLength={100}
            autoComplete="name"
          />
        </div>
        <div className="form-field">
          <label htmlFor="contact-email">Work email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="contact-type">
          What do you need? <span>(optional)</span>
        </label>
        <select id="contact-type" name="projectType">
          <option value="">Choose one</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="contact-message">Your project</label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          placeholder="The model, the data, the timeline, and what good looks like."
        />
      </div>
      <div hidden aria-hidden="true">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send enquiry'}
      </Button>
      <p className="form-note">
        {delivery === 'server'
          ? 'Your details are used only to reply to this enquiry.'
          : 'This opens your email app with the enquiry filled in.'}
      </p>
      {state && (
        <p
          role="status"
          className={`status-message ${state.ok ? 'success' : 'error'}`}
        >
          {state.text}
        </p>
      )}
    </form>
  );
}
