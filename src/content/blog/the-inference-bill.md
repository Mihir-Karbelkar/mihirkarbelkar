---
title: 'The inference bill: how AI costs eat startup runway'
description: 'Why model spend outgrows revenue at AI startups, three public examples, and a 30-minute audit to run on your own numbers.'
pubDate: '2026-11-04T18:00:00Z'
category: 'tech'
---

For most AI startups, the model bill is the biggest cost nobody planned for. Salaries are budgeted a year ahead. Inference grows with every user, every agent step and every retry.

It usually goes the same way. The prototype runs on the best frontier API, because quality matters and volume is tiny. Then usage grows, and the same model handles every task, simple ones included. The bill now scales with traffic rather than with value, and margins that looked like software start to look like services.

Below are companies that hit this in public, the habits that cause it, and what a founder can check this week.

## Three public examples

Each comes from press reporting or a published report:

| Company | What happened | The numbers |
|---|---|---|
| [Stability AI](https://www.theregister.com/2024/04/03/stability_ai_bills/) | Cloud bills grew faster than revenue. It reportedly fell behind on payments to AWS, Google Cloud and CoreWeave, and the CEO resigned in March 2024. | About $99M a year in compute against about $11M of projected 2023 revenue. Cash reportedly down to about $4M by October 2023 (Forbes, via The Register). |
| [GitHub Copilot](https://aibusiness.com/nlp/github-copilot-loses-20-a-month-per-user) | A flat $10 a month price, against per-query compute costs that grow with usage. | A reported average loss of about $20 per user per month, with heavy users costing up to $80 (WSJ, via AI Business, October 2023). |
| [Fast-growing AI startups](https://openlinksw.com/data/html/bessemer-ventures-ai-2025-report-claude.html) | Bessemer's State of AI 2025 report splits AI companies into hypergrowth "Supernovas" and steadier "Shooting Stars". | Supernovas often run at about 25% gross margin and Shooting Stars at about 60%, against the 75–80% typical of SaaS. |

In each case, revenue grew with the number of users, model cost grew with usage, and usage per user kept rising.

Checkr went the other way. It moved its hardest background-check classification task from GPT-4 to a fine-tuned Llama-3-8B. Accuracy on that task rose from 81.8% to 90%, inference cost fell about 5×, and response time dropped from about 15 seconds to about 0.15.

## Why the bill grows

It is usually down to how the system is built, not what the provider charges. Four habits cause most of it:

- **One model for every task.** The frontier model picked for hard reasoning also does classification, extraction and summarisation, and those make up most of the volume.
- **Agents multiply calls.** One user action turns into planning, tool calls, retries and self-checks. Each is a full model call, and the context gets longer every time.
- **No per-task cost view.** Teams see one monthly invoice, not which step of which pipeline spends the money.
- **Context bloat.** Full documents, long system prompts and chat history are resent on every call, so token counts grow faster than traffic.

## Give each task the smallest model that does it

Keep the frontier model for the steps that need it, and move the high-volume, narrow steps to small models you control.

1. **Measure per task.** Log tokens and cost for each pipeline step for two weeks. A few steps usually carry most of the spend.
2. **Build an eval set first.** Sample real inputs and current outputs for each high-volume step. That is the bar any replacement has to meet.
3. **Fine-tune a small open model.** For classification, extraction and summarisation, a fine-tuned 7–8B model often matches or beats a general frontier model on that one task, as Checkr found.
4. **Self-host where the volume justifies it.** Serve on rented GPUs with vLLM, batch aggressively and cache repeated prompts. Below a certain volume, a cheaper hosted model is the better choice.
5. **Route, don't replace.** Send easy cases to the small model, and fall back to the frontier model when its confidence is low.
6. **Gate the switch.** Nothing goes to production until it passes the eval set, and you keep monitoring after the switch.

How much you save depends on the mix. Pipelines that are mostly bulk text processing have the most room. If the spend is mostly scraping, storage or hard reasoning, there is much less.

## A 30-minute cost audit

Answer these with your own numbers. Each "no" or "don't know" is likely money you can save.

- Do you know your model cost per customer and per core action?
- Can you name the three pipeline steps that spend the most?
- Is each of those steps using the smallest model that meets your quality bar?
- Do you have an eval set for each high-volume step?
- Are repeated prompts cached, and are batchable jobs batched?
- Is model spend growing slower than revenue, month over month?
- At current growth, how many months of runway does model spend alone use up?

Model spend is the one cost that goes up every time your product succeeds. Track it per task, keep a quality bar, and give each task the smallest model that clears it.

That is the work I do: per-task cost audits, fine-tuning small open models against your own evals, and self-hosting where it pays. If you'd like someone to look over your pipeline, [email me](/#contact).

## Sources

- [The Register: Stability AI reportedly ran out of cash to pay its cloud bills](https://www.theregister.com/2024/04/03/stability_ai_bills/) (April 2024, summarising Forbes)
- [AI Business: GitHub Copilot loses $20 a month per user](https://aibusiness.com/nlp/github-copilot-loses-20-a-month-per-user) (October 2023, citing the Wall Street Journal)
- [Bessemer State of AI 2025, summary](https://openlinksw.com/data/html/bessemer-ventures-ai-2025-report-claude.html)
- [How Checkr streamlines background checks with fine-tuned small language models](https://www.rubrik.com/blog/ai/24/how-checkr-streamlines-background-checks-with-fine-tuned-small-language) (October 2024)
