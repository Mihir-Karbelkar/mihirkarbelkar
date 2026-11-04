import { booking } from '../config/booking.ts';

/** The quick 5-minute cost audit from "The inference bill", and the email it prefills. */
export type Answer = 'yes' | 'no' | 'unsure';

export const AUDIT_EMAIL = booking.email;

export const auditQuestions = [
  'Do you know your model cost per customer and per core action?',
  'Can you name the three pipeline steps that spend the most?',
  'Is each of those steps using the smallest model that meets your quality bar?',
  'Do you have an eval set for each high-volume step?',
  'Are repeated prompts cached, and are batchable jobs batched?',
  'Is model spend growing slower than revenue, month over month?',
  'Do you know how many months of runway model spend alone uses up at current growth?',
];

const label: Record<Answer, string> = {
  yes: 'Yes',
  no: 'No',
  unsure: "Don't know",
};

/** Answers that point at likely savings: every "no" and "don't know". */
export const openItems = (answers: (Answer | undefined)[]) =>
  answers.filter((a) => a === 'no' || a === 'unsure').length;

export function auditMailto(answers: (Answer | undefined)[]): string {
  const answered = answers.filter(Boolean).length;
  const subject = 'Cost audit for our AI pipeline';
  const lines =
    answered > 0
      ? [
          'Hi Mihir,',
          '',
          `I went through the cost audit in your post. ${openItems(answers)} of ${auditQuestions.length} came back "no" or "don't know":`,
          '',
          ...auditQuestions.map(
            (q, i) => `- ${q} ${answers[i] ? label[answers[i]!] : '(skipped)'}`,
          ),
          '',
          'About our product and pipeline:',
          '',
          '',
        ]
      : [
          'Hi Mihir,',
          '',
          "I read your post on inference costs and I'd like you to look over our pipeline.",
          '',
          'About our product and pipeline:',
          '',
          '',
        ];
  return `mailto:${AUDIT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export type Urgency = 'calm' | 'some' | 'urgent';

/**
 * The email button's label, which gets more pressing as the "no" and
 * "don't know" answers add up. Kept short enough for one line on a phone.
 */
export function auditCta(answers: (Answer | undefined)[]): {
  label: string;
  urgency: Urgency;
} {
  const answered = answers.filter(Boolean).length;
  const open = openItems(answers);
  if (open === 0)
    return {
      label:
        answered === auditQuestions.length
          ? 'Get a second opinion'
          : 'Get help with your AI costs',
      urgency: 'calm',
    };
  if (open === 1) return { label: 'Fix your 1 cost leak', urgency: 'some' };
  if (open <= 3)
    return { label: `Fix your ${open} cost leaks`, urgency: 'some' };
  if (open <= 5)
    return { label: `${open} leaks: get help now`, urgency: 'urgent' };
  return { label: `${open} leaks: let’s talk today`, urgency: 'urgent' };
}
