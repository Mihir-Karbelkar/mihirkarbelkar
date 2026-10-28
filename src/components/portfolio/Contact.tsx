import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../ui/button';
export default function Contact() {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ chat: boolean; contact: boolean }>)
      .then((c) => setReady(c.contact))
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setState('');
    const form = e.currentTarget;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(data.error || 'Unable to send. Please try again.');
      setState('Message sent. Thanks for reaching out.');
      form.reset();
    } catch (err) {
      setState(
        err instanceof Error
          ? err.message
          : 'Unable to send. Please try again.',
      );
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
            placeholder="Alex Chen"
          />
        </div>
        <div className="form-field">
          <label htmlFor="contact-email">Email address</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="alex@company.com"
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="contact-type">
          What are you working on? <span>(optional)</span>
        </label>
        <select id="contact-type" name="projectType">
          <option value="">Choose a project type</option>
          <option>AI agents & automation</option>
          <option>RAG & data pipelines</option>
          <option>Backend & cloud platforms</option>
          <option>Full-stack AI product</option>
          <option>Something else</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="contact-message">A little about your project</label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          placeholder="The problem, the constraints, the possibilities…"
        />
      </div>
      <div hidden aria-hidden="true">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button type="submit" disabled={busy || !ready}>
        {busy
          ? 'Sending…'
          : ready
            ? 'Send a project note'
            : 'Contact delivery not configured'}{' '}
      </Button>
      <p className="form-note">
        {ready
          ? 'Your details are used only to respond to this enquiry.'
          : 'The form is awaiting email setup. You can find Mihir on GitHub using the link alongside.'}
      </p>
      <p
        role="status"
        className={`status-message ${state.startsWith('Message sent') ? 'success' : 'error'}`}
      >
        {state}
      </p>
    </form>
  );
}
