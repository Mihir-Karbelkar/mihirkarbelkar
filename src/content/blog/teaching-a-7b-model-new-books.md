---
title: 'Teaching a 7B model new books without breaking it'
description: 'What I learned fine-tuning Qwen2.5-7B on a series of fact books for a client: the levers that kept its general skills, the ones that did not, and the bugs that nearly fooled me.'
pubDate: '2026-11-04'
category: 'tech'
---

A client asked for something that sounds simple: teach Qwen2.5-7B-Instruct a series of fact books, one at a time, so it answers questions from them. The hard part was everything else in the brief:

- **One plain set of weights per book.** Same shapes, same tokenizer. No retrieval, no files and no adapter switching at answer time.
- **Knowledge.** An exam per book of direct and indirect questions, plus false-premise "traps" the model must reject and true "twin" questions it must not refuse.
- **General skills.** After every book, IFEval, GSM8K and MMLU had to stay within 1 point of the clean base, with the drops summing to at most 1.5.
- **Budget.** At most 8 GPU-hours per book on one 48 GB card, including data generation.
- **Reproducibility.** A frozen package that the client runs with their own seeds, twice.

I kept a ledger of every arm, with every number measured, so these notes come from it. Most experiments ran on 140 units of the first book, and the promising ones were then run on the whole book.

## How much the weights move matters more than where they move

My first instinct was to protect the base model by restricting where the update could go. Attention-only LoRA, middle layers only and orthogonal fine-tuning (OFT) each protected the benchmarks, and each cost 13–14 points of knowledge: 61–62% on my proxy exam, against 75% for full LoRA. MLP-only kept the knowledge but hurt IFEval about three times as much as simply lowering the rank.

Restricting how much the weights move worked better. Rank 16 instead of 64, or a learning rate of 1e-4 instead of 2e-4, kept knowledge at 76%. IFEval fell 1.1 to 1.5 points instead of 10. The book fits in a small update spread over all layers, so restricting how far the weights move protects the model better than restricting where they move.

That held at 140 units. On the whole book, rank 16 ran out of room: the rank-16 runs scored 64–69% on the exam, against 71–78% for rank 64. The final recipe went back to rank 64 with a much lower learning rate. At 5e-5 it passed the general-skills line on book 1: IFEval 74.12, GSM8K 81.58 and MMLU 73.20, against a base of 70.61, 80.44 and 73.85.

## Most of the damage was to the interface, not the ability

The worst benchmark drop looked like the model getting worse at maths: GSM8K strict fell 17 points. GSM8K's flexible score, which accepts the number wherever it appears, fell only 4.5. The model could still do the arithmetic. It had stopped ending answers with `#### N`.

I came to think of book learning as changing three things:

- **The address:** which passage a question points to.
- **The content:** the passage's facts.
- **The interface:** how any answer is shaped.

The client wants the first two and none of the third. Several levers turned out to fix the interface:

- About 2% of training rows were the base model's own answers ending in `#### N`. They brought GSM8K strict from −17 to −3.
- On the whole book, a per-sample diagnosis showed something new. The arithmetic was fine (wrong-number failures went *down*), but 50 more answers never reached `####`. Chat-style markdown, "**Step 3:**" and LaTeX, was leaking into GSM8K's plain prompt format, and the answers hit the generation cap first. 600 plain-text, 5-shot maths rows, trained to match the base model's own completions, took GSM8K from −2.73 to +0.91.
- Everyday questions were being answered with sentences recited from the book. Mixing in rows of the base model's own replies to general prompts restored the boundary (4/15 good answers → 13/15).

## A KL anchor beats copying the base model's answers

The usual way to stop forgetting is to mix in general data with the base model's replies as targets. I compared that against a KL penalty to the base model's full next-token distribution on the same general rows. The base here is the same weights with the adapter disabled, so it needs no second model in memory.

Same trainer, same data, only the loss on general rows changed: knowledge was **78% with the KL anchor against 70%** with plain cross-entropy, and the summed benchmark drop was 7.1 against 9.6. Copying a sampled reply token by token spends capacity imitating it. KL only says "stay where you were", which costs less and leaves capacity for the book.

## The form of the target decides what gets learned

Two experiments pulled in opposite directions:

- **Distilled targets.** The base model answered each question with the passage in front of it. That kept the interface almost perfect: GSM8K flexible equal to base, with no format rows at all. But knowledge collapsed to 24%. The answers were fluent, in the model's own style, and often wrong.
- **Verbatim targets.** Reciting the passage wrote the facts into the weights, but dragged the interface with it.

How a trap is answered matters the same way. A single fixed rejection sentence, repeated over thousands of rows, became a cheap trigger: "trap-shaped question → this string". It leaked onto 4 of 30 true questions in the client's test. What helped was **near-miss traps**: false premises built from the same unit, its neighbours and its presuppositions, paired with true twins. They cut answers an outside-family judge called made-up from 15 to 8 of 146 and *added* 12 knowledge points. A second seed reproduced it (7 of 146).

## Scale changes the answer

Several things that passed at 140 units failed on the whole book:

- the rank question above;
- MMLU dropping on the whole book (−1.4) when no 140-unit run had dropped it;
- a per-scenario MMLU slip (moral scenarios, 62% → 42%) that turned out to be a verdict bias learned from trap training.

The 140-unit runs were good for ranking ideas. Only whole-book runs could approve one.

## Chaining books

Each later book trains a fresh LoRA on top of the previous book's merged weights, with the KL anchor pointing at the previous model and a little replay of earlier books. Across four chained variants, book-1 retention after books 2 and 3 stayed between **0.94 and 0.99**. The best held 0.979 after book 2 and 0.989 after book 3. My earlier recipe managed 0.86–0.89.

One caveat from the ledger: in those rehearsal chains, books 2 and 3 came from the same source as book 1. They show retention under more training, but they understate the cost of a genuinely new book.

General skills were the harder half of chaining. The drops accumulated by roughly 0.4–1.7 points per axis per book. Anchoring KL to the clean base instead of the previous model did not help. Fewer epochs did not help either: drift was not proportional to steps. That stayed the open problem.

## The bugs that nearly fooled me

- **A faster trainer that trained on garbage.** An optimised training stack ran 1.76× faster, but it mishandled the per-row attention mask in packed sequences. Knowledge fell to 42% against 78%, which the end losses gave away. Without that mask it matched plain PyTorch at 75%, still 1.76× faster.
- **A contamination guard that checked nothing.** My benchmark-overlap guard reported "0 dropped". It had silently failed to load the test set. A re-check against the pinned test files found 274 of 600 generated rows sharing an 8-gram with MMLU test items. They never went into the package, and the guard now uses the pinned files.
- **No gradient clipping.** A rank-64 run diverged mid-training (loss 0.21 → 7.2) because my trainer, unlike the library it replaced, did not clip gradients.
- **Judges disagree.** One judge model was about 3× harsher than another on the same answers, and labelled verbatim recitals as made up. I ended up using a judge from outside the teacher's model family, with checks by hand.

## Delivery

The package runs end to end with one command: data generation with open-weight teachers on vLLM, deduplication, benchmark-contamination checks, training and merging. Book 1 ran in 7.1 hours on a single A40 against the 8-hour cap. Each freeze is a commit plus a SHA-256 manifest of every file. The merged weights keep the base model's config and tokenizer byte for byte, so the client loads them like any Qwen2.5-7B and re-runs everything on their own GPUs.

If you have a model that needs to learn your material without losing what it already does, [I'd like to hear about it](/#contact).
