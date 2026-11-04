---
title: 'A 15M-parameter model that answers from a website, in the browser'
description: 'Notes from training tiny question-answering models from scratch for a site assistant: what set the size, what the architecture search showed, and why they are not on the site yet.'
pubDate: '2026-11-04'
category: 'tech'
---

I've been building a chat assistant for this site that answers only from the site's own pages. Larger in-browser models need WebGPU, and without it the assistant could only show search results. I wanted a model small enough to run anywhere, even on a phone's CPU, that reads the retrieved passages and either answers from them or says they don't cover the question.

The result is two models on Hugging Face: [Tiny 30M](https://huggingface.co/Mihir-Karbelkar/tiny-30m-site-qa) and [Ant 15M](https://huggingface.co/Mihir-Karbelkar/ant-15m-site-qa). Both are trained from scratch and run as a single int8 ONNX file on onnxruntime-web's WASM backend. These are the notes from the ledger I kept while building them.

## Latency set the size, not download

Before training anything worth keeping, I timed random-weight models of each size in the browser:

- **int8 beat fp32**, at a quarter of the size.
- **4-bit was slower than int8** in onnxruntime-web 1.22 WASM.
- **WebGPU lost at every size I tried.** Per-op dispatch dominated decoding, at 9–11 tokens/s on the phone. int8 has no WebGPU kernels, so it bounced between CPU and GPU at 3–4 tokens/s.
- **Prompt length mattered more than linearly.** Going from 512 to 1,024 tokens cost 2.5–3× the time, so the assistant sends about 2,000 characters of passages, not more.

On a mid-range Android phone, the 30M with int8 and 4 threads read a 512-token prompt in 576 ms and generated 43 tokens/s. Fast enough. On phones the real cost is the one-time download, not speed.

## Without pretraining, nothing worked

My first models were about 10M parameters, trained only on question-answering data. I compared a plain decoder with a JEPA-style latent predictor. The decoder won on every quality measure. The JEPA's predictor was the bottleneck: its decoder rebuilt answers well from the *true* answer embedding and badly from the predicted one. A hybrid that added a JEPA loss to the decoder was worse at every weight I tried.

The bigger problem was that neither could tell answerable questions from unanswerable ones: refusal AUROC was about 0.64, where 0.5 is chance. With roughly 40 tokens of training per parameter, the models were learning English and the task at the same time.

So I pretrained. The 30M saw 2.5B tokens of FineWeb-Edu and FineWeb (ODC-By), with the general share biased towards structured pages like the ones websites are made of: lists, prices, hours, FAQs. Then I fine-tuned it on question-answering data generated with Qwen3-8B (Apache-2.0) over FineWeb pages.

Every dataset went through a licence audit first. Two popular RAG datasets were out because their answers were GPT-4-generated or their generator was undocumented. Refusal AUROC went from about 0.64 to **0.967**.

## Quote first, then answer

Live testing exposed odd behaviour:

- "Hello" produced a letter addressed to me, written from the passages.
- Vague questions came back as lists.
- The chat data's identity leaked through ("I am Open Assistant").

The third round changed the output format to **evidence first**:

```
Source 2: "an exact span copied from source 2"
Answer: one or two plain sentences.
```

`Source: none` means refuse, and `Chat:` is a reply to small talk that states no facts. A copied quote is easy for a small model, and the browser can verify that it really occurs in the cited passage before showing anything. I rejected free-form chain-of-thought: at 30M parameters it adds wrong steps and latency.

Refusal AUROC rose to 0.990. On this site's own questions the model answered 8 of 24 correctly, and 10 wrong answers got past the checks.

The site questions also showed what is left. In an oracle test, I removed every distractor and gave the model only the passage that holds the answer, and accuracy barely moved (33% → 34.5%). **Reading the answer out of the passage, not finding the passage, is the bottleneck.** 72% of wrong answers cited the right passage. Targeted extraction training moved errors between answer types without raising the ceiling, which pointed to capacity.

## Ant 15M: an architecture search on a budget

For a smaller, faster model, I screened eight 15M layer patterns at equal size and data. Each got 0.5B tokens of pretraining, then the identical fine-tune and evaluations. The patterns were all attention, and attention at the ends around GRU, Mamba2, Gated DeltaNet or RWKV-7 layers, plus mixes:

- **Mamba2 in the middle had the better pretraining loss** (3.621 against 3.681 for all attention), **and the lead did not carry over to the QA task.** After the same fine-tune, the two tied. Pretraining loss did not predict this task at 15M.
- **The GRU model always cited Source 1.** It never learned which passage says what.
- **RWKV-7 garbled its quotes**, so 82% of its answers failed the quote check. A fixed-size recurrent state struggles to copy a 15-word span.
- **Picking the right passage is attention work.** Ablations showed it happening in the attention layers, while the answer-or-refuse decision formed in the middle layers. Alternating attention and Mamba2 (`AMAMAMAM`) balanced the two best.

The winner got 2.9B tokens on one H100: 2 h 38 min and $5.79 end to end. At half the parameters of the 30M, it matched or beat it on the site's questions (9 right / 9 wrong shown, against 8 / 10). It also refused near misses better.

Quantisation almost undid it:

- **Plain per-tensor int8:** 3 of 24 site answers right, against 8 in fp32.
- **SmoothQuant** (an exact rewrite that moves activation outliers into the weights) **plus per-channel int8:** matched fp32, in a 21 MB file.

## A narrow model against a general one

For a reference point, I gave SmolLM2-360M-Instruct the same format with two worked examples and scored it the same way:

| | Ant 15M | SmolLM2-360M |
|---|---|---|
| Refusal AUROC | 0.986 | 0.50 |
| Near-miss questions answered wrongly | 2% | 50% |
| Site questions right / wrong shown | 9 / 9 | 8 / 11 |

SmolLM2 is far ahead on general benchmarks: 24× the parameters and about 1,400× the tokens. On this narrow task, though, the fine-tuned 15M knows when the pages don't answer, and the prompted 360M answers nearly everything.

## What didn't work

- **Reinforcement learning on 150 questions.** Training reward rose from +0.31 to +0.70, and held-out scores did not move. The policy shifted the refuse/answer boundary rather than reading better.
- **Depth.** A 28-layer version at the same size was equal on balance, and half as fast in the browser.
- **Input-conditioned low-rank gate deltas.** The model used them, but they did not beat simply adding the same capacity.
- **More pretraining.** 9.9B tokens instead of 2.9B was better on held-out pages and *worse* on this site's questions (4 right / 14 wrong shown).

## Why they're not on the site yet

On a personal site, every passage is about the same person, and that's exactly where these models are weakest. Ant answers well under half of factual questions correctly. It can also quote a real but irrelevant sentence and answer from it, which no quote check can catch. Showing the matching pages is never wrong. So the assistant and these models stay off the site until a bigger model or a better teacher closes that gap.

Both model cards on Hugging Face list the training data, decoding rules and limitations.
