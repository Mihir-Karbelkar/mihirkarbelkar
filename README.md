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

- `src/data/*.json`: all site copy and data. `site.json` holds the profile, navigation, footer, every homepage heading and label, the about page, the chat greeting and suggestions, the chat's section keywords and the tour steps. `projects.json` holds the project accounts (with their artwork) and the featured/archive order; `notes.json` and `skills.json` hold the rest. Edit these and rebuild; no code changes are needed. `src/data/schema.ts` validates them with zod, and the build fails on a malformed file or an unknown featured slug. `src/data/portfolio.ts` re-exports the parsed data. See `docs/EDITORIAL-SOURCES.md` for source boundaries.
- `src/lib/content.ts`: the keyword-searchable source documents built from the JSON (used by `/api/chat`). It never reads private repos or visitor files.
- `src/styles/portfolio.css`: theme tokens, responsive layouts and dark mode. Light is warm cream paper with sakura reds; dark is a plum night with lavender pastels. The theme follows the system setting unless the visitor picks one. Atkinson and Georgia are the two font families. `chat.css` styles the chat bar, `fx.css` the sakura branch, petals, reveal animations and mascot, and `lab.css` the lab interfaces. Main content is server-rendered and works without JS; animations stop under reduced motion.
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

## The chat bar and on-device models

Every portfolio page has a chat bar fixed at the bottom (`src/components/chat/ChatBar.tsx`). It starts open, collapses to a pill when you scroll, and `/` focuses it.

- **One pipeline per message** (`src/lib/chat/pipeline.ts`). Each stage has a time budget and falls through to the next, so a message always ends with something useful and never hangs on "Thinking…":
  1. Instant rules (`src/lib/intent.ts`) handle navigation and theme commands.
  2. The MiniLM router (`src/lib/router.ts`) matches site actions from the `chat.actions` examples in `site.json`. It is only used once it is warm.
  3. Hybrid search runs with a 6 s budget, then falls back to keyword search. Short follow-ups are searched together with the previous question.
  4. The model writes the answer, with a watchdog on the first token and on gaps between tokens.
  5. A grounding check (`src/lib/chat/answer.ts`) runs on the result. An answer that isn't supported by its sources, or that claims to have done something, is replaced by result cards with an honest intro.

  Answers cite numbered sources, and the `[n]` markers become links to the pages. Models sit behind the `AnswerEngine` interface (`src/lib/chat/engine.ts`), the seam for a future local-model SDK.
- **No model UI for visitors.**
  - Auto picks a tier from device memory and GPU limits. Phones with less than 6 GB, and phones with small GPU buffers, get no generative model, only result cards.
  - A download that needs consent shows "Enable smarter answers (≈ size)"; while downloading, a progress line with Pause is shown.
  - `?assistant-debug` shows the model picker for testing.
  - Errors in the chat use short, friendly copy; the details go to the console.
- **Navigation first.** `src/lib/intent.ts` turns "show me Superstocks", "contact" or "take me to your notes" into a scroll-and-highlight, with no model involved. Section keywords live in `site.json` (`chat.sections`); project titles come from `projects.json`.
- **Search.** At build time `/search-index.json` (prerendered by `src/pages/search-index.json.ts`) chunks the JSON data, the blog and the essays. A post can opt out with `index: false` in its frontmatter; the Lorem-ipsum template posts do. In the browser, MiniLM (`Xenova/all-MiniLM-L6-v2`, about 23 MB, in `src/workers/embed.worker.ts`) embeds the chunks once. The vectors are cached in the Cache API, keyed by a hash of the content, so they rebuild automatically whenever content changes. Retrieval fuses vector and keyword rankings (`src/lib/retrieval.ts`). If the embedding model can't load, search falls back to keywords.
- **Downloads** (`src/lib/weights.ts`) stream the weight shards into WebLLM's own cache with byte-level progress, a storage check and stall retries. WebLLM then loads from cache. Its own downloader reports nothing until whole ~30 MB shards land.
- **GPU loss.** If the GPU drops a model mid-answer (WebGPU `mapAsync … unmapped`, usually out of memory), the answer falls back to search results and Auto moves to a smaller model. That device is also capped below the failed tier on later visits.
- **Generation.** `src/lib/models.ts` defines three WebLLM 0.2.85 tiers: Qwen2.5 1.5B, Qwen2.5 0.5B and SmolLM2 360M. Each uses its q4f16 build when the adapter supports `shader-f16`, otherwise q4f32. `src/lib/model-manager.ts` works out the device's WebGPU adapter, memory and connection, then picks a tier:
  - On an unmetered desktop it downloads that tier straight away.
  - On mobile or a metered/Save-Data connection it shows a "Load the AI (size)" button first.
  - When the page is idle, desktops also prefetch the next smaller tier.
  - **Auto** uses the largest model that's ready, and steps down a tier if a load fails.
  - Only one model is kept in GPU memory.
  - The picker shows each tier's size and download status, and lets the visitor pause a download.
- **Answers** open a scroll-locked panel over the blurred page. The model receives only the retrieved sources (`src/lib/prompt.ts`), and source links are shown with every answer. Without a ready model, the panel shows the matching sources. The hosted provider is used only on devices without WebGPU, and only when it is configured (`HOSTED_FALLBACK` in `ChatBar.tsx`).
- **Tour.** "Show me around" (or `/#tour`) starts the computer-use gimmick (`src/components/fx/Mascot.tsx`). An original chibi mascot takes the cursor, flies it to each step in `site.json`'s `tour` list and narrates. Moving the mouse, clicking, scrolling or pressing a key hands the cursor back.

Download sizes in the picker are approximate; VRAM figures come from WebLLM's catalog. Browser caches may be evicted, so offline reuse is best-effort. Small-model answers can be wrong.

The verification browser has no WebGPU adapter and couldn't reach Hugging Face. Only the fallback path, keyword search, has been exercised end to end. Before launch, smoke-test semantic search and local generation on supported hardware.

`/lab/guide` keeps the original single-model playground (Search / On this device / Hosted).

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
