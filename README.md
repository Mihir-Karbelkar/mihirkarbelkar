# Mihir Karbelkar — portfolio & Experimental Brain

An editorial, pastel portfolio with first-person project accounts, mathematical notes and model experiments. Built in the existing repository with **Astro, React islands, TypeScript, Tailwind 4 and shadcn-style UI primitives**, deployed using the retained Cloudflare Worker configuration.

## Run

Requires Node **22.14+** and pnpm **12.10.1** (the verified development environment uses Node 26).

```sh
pnpm install
pnpm dev
```

Open the printed local URL, normally `http://localhost:4321`. If Sharp detects an incompatible system libvips, install with `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install`.

```sh
pnpm check             # Astro diagnostics + TypeScript
pnpm test              # policy, retrieval, validation, provider/stream failure behavior
pnpm build            # static pages + Cloudflare server bundle
pnpm dry-run          # Wrangler deployment packaging, without publishing
pnpm preview          # serve the most recent build using Wrangler
```

No model download is needed to browse the site. Hosted inference, contact delivery and live video perception each remain visibly unavailable until configured. Synthetic simulation and genuine recorded V-JEPA runs work without server credentials.

## Content and visual system

- `src/data/portfolio.ts`: editable homepage copy, seven project accounts, notes and background. Superstocks, the Experimental Brain and Qwen fine-tuning are featured; earlier platform and frontend case studies remain available. See `docs/EDITORIAL-SOURCES.md` for source boundaries.
- `src/lib/content.ts`: the assistant's source corpus, shared with the published project data. It never reads private repos or visitor files.
- `src/styles/portfolio.css`: ivory, sage, lavender, dusty blue and peach tokens, responsive layouts and optional dark mode. Atkinson and Georgia are the two font families. `src/styles/lab.css` contains the subordinate lab interfaces. Main content is server-rendered and works without JS.
- `src/content/blog` and `src/content/essays`: retained writing. Existing blog URLs and RSS remain available. Technical-blog aliases and political-essay routes are wired into the existing subdomain middleware.
- `docs/CONTENT-TODO.md`: editorial details to confirm before public release.

Set public contact links at build time by copying `.env.example` to `.env`. Empty email, LinkedIn or calendar settings omit those links. GitHub remains available. Never use `PUBLIC_` variables for credentials.

## Optional hosted inference and email

Copy `.dev.vars.example` to `.dev.vars` for local Cloudflare development. In production, store secrets with Wrangler or the Cloudflare dashboard. Do not commit `.dev.vars` or actual keys.

| Setting                                        | Purpose                                       |
| ---------------------------------------------- | --------------------------------------------- |
| `GROQ_API_KEY`, `GROQ_MODEL`                   | Primary OpenAI-compatible streaming provider  |
| `INCEPTION_API_KEY`, `INCEPTION_MODEL`         | Optional secondary provider                   |
| `RESEND_API_KEY`, `CONTACT_FROM`, `CONTACT_TO` | Verified sender, recipient and email delivery |
| `BRAIN_API_URL`, `BRAIN_API_TOKEN`             | Authenticated V-JEPA service                  |

Models must be set to IDs available to the owner's account. Provider free plans and quotas can change; Inception free access is not assumed. The client cannot choose arbitrary endpoints, credentials or model IDs. Missing configuration does not break the portfolio.

Failover tries each configured provider at most once, observes quota cooldowns from `Retry-After`, and never rotates keys/accounts to bypass limits. Providers can retain requests under their own policies. The site stores no conversation history. Chat and dreams are streamed as NDJSON; malformed/truncated streams produce a visible error.

The Cloudflare `API_LIMITER` binding admits 10 requests per minute per visitor and 10 site-wide per location. It is an advisory abuse/traffic guard, not a globally consistent billing cap; provider quotas remain authoritative. The retained Wrangler version declares this binding through `unsafe.bindings`, so Wrangler reports an experimental-field warning. Production API requests fail closed if the binding is missing. POST endpoints verify Origin, body bounds and payload types. Use a distinct rate-limit namespace for an independent deployment.

Resend sends only after validation. The UI never reports delivery success for unconfigured or failed requests. Actual delivery requires a verified sender/domain and has not been tested without owner credentials.

## On-device models

The separate `/lab/guide` playground has Search, On this device and Hosted modes; it is linked from the Brain lab, not mounted on the homepage. Search uses lightweight keyword retrieval and links to the public sources. Generation is explicitly optional.

- Chat: `@mlc-ai/web-llm@0.2.85` with `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, 2,048-token context, at most 384 generated tokens, in a dedicated worker. Local questions use the current query plus retrieved sources to keep the small context bounded. Conversations remain visible in session memory.
- Model weights and runtime load only after the visitor chooses Load. The approximate download is shown; GPU memory use is higher. Browser caches may be evicted, so offline reuse is best-effort.
- Unsupported WebGPU/adapters, cancellation and failed loads return a clear error. The guide does not silently send a local question to a hosted service.
- `/lab/theme` preserves the original MiniLM + learned colour weights experiment. It runs in a separate worker and constrains colours to a pastel range. It does not alter body-text contrast.

The verification browser has no compatible WebGPU adapter. Its fallback behavior was checked, but actual local Qwen generation needs an additional smoke test on supported hardware. The runtime/model pairing exists in the pinned WebLLM catalog. Small-model answers can still be wrong; source links are shown alongside generated text.

## Experimental Brain

`/lab/brain` exposes **Observe → Act → Dream**, session traces and downloadable JSON.

- **Synthetic**: known sample metadata drives a rule-based simulation; no model is running.
- **Recorded**: genuine V-JEPA 2 embeddings from the exact bundled original sample clips. Each JSON includes the model revision, preprocessing, clip SHA256 and generation time.
- **Live**: samples 16 JPEG frames from a short uploaded clip or a camera stream, then sends them only after an explicit hosted-perception action. Live perception runs in a separate Python service, not in the Cloudflare Worker or visitor browser.
- **Actor**: a transparent rule-based policy gates motion from the observation and uses BFS to avoid a fixed obstacle. It acts only in a 10×10 simulation; it is not a trained V-JEPA 2-AC or RL policy.
- **Dream**: explicitly speculative narration from a local/hosted LLM, or a labelled hand-written template. It cannot see the video or control the actor.

Reference scores are cosine similarities, not calibrated confidence. The tiny synthetic reference bank is illustrative, not an arbitrary-video action recognition benchmark. The three sample MP4s were generated specifically for this repo by `services/brain/samples.py`; no third-party video rights are needed. Pretrained model redistribution/use remains subject to its model license; weights are downloaded from the upstream source and not committed.

## V-JEPA service and reproducibility

Use Python 3.12. Install PyTorch for your hardware first; the verified CPU environment used PyTorch 2.14.1+cpu and torchvision 0.29.1+cpu.

```sh
uv venv --python 3.12 services/brain/.venv
uv pip install --python services/brain/.venv/bin/python torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv pip install --python services/brain/.venv/bin/python -r services/brain/requirements.txt
services/brain/.venv/bin/python services/brain/samples.py
services/brain/.venv/bin/python services/brain/record.py
```

Default checkpoint: `facebook/vjepa2-vitl-fpc64-256` at revision `b3c1679b7c34d3255ef3547f27c7b226aefab26f`. `VJEPA_REVISION` can select another explicit revision; regenerate all references and recordings when changing it. The model cache stays under `services/brain/.cache` (ignored). First use downloads over 1 GB of weights. The encoder mean-pools and L2-normalizes its 1,024-dimensional output. Warm CPU processing of 16 frames took approximately 5–6 seconds here; other devices and cold starts will differ.

`record.py` writes public recordings and private service reference vectors. To restore service references without re-running inference, use `services/brain/restore_references.py`; it validates public recordings share the same model and revision.

Set `BRAIN_API_TOKEN` in the service environment, then run one process:

```sh
services/brain/.venv/bin/uvicorn app:app --app-dir services/brain --host 127.0.0.1 --port 8765
```

Set the matching token and `BRAIN_API_URL=http://127.0.0.1:8765` in local `.dev.vars`. Restart Astro after changing runtime settings. In production, run behind HTTPS, set proxy body limits (1.5 MB) and a 90-second timeout, disable request-body logging and keep model assets cached. The service admits one encoding at a time and returns 429 when busy; it holds frames only in memory during the request. The site accepts HTTP loopback perception endpoints only in development.

```sh
services/brain/.venv/bin/python services/brain/test_service.py
services/brain/.venv/bin/python scripts/smoke-api.py
```

The second check targets the running Astro dev server at `127.0.0.1:4321`, validates representative routes and API guards, and exercises real perception if configured. It never sends email or calls paid LLM services.

## Deployment

The existing Cloudflare Worker name/configuration is retained. No production domain or provider account has been changed. Build, run `pnpm dry-run`, then preview the production build with Wrangler before publishing using `pnpm deploy` under the owner's authenticated Cloudflare account.

Blog routes, public metadata, canonical URLs, RSS, sitemap and social image use `mihirkarbelkar.com`. Unknown preview hostnames are not rewritten as subdomains. No account/session features are used; the configured memory session driver avoids requiring an unused KV namespace.

Before public launch, complete the editorial checklist and validate contact delivery, live service hosting and WebGPU generation on supported hardware. A mobile Lighthouse score is a target, not an asserted result; measure against a production preview. AI worker bundles and weights are intentionally large but deferred until explicit use.
