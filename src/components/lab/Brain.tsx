import Icon from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { START, TARGET, blocked, policy } from '../../lib/policy';
import type {
  Action,
  Point,
  PerceptionResult,
  Recording,
  TraceEntry,
} from '../../lib/contracts';
import { sampleFrames } from '../../lib/video';
import {
  loadLocal,
  generateLocal,
  cancelLocal,
  stopLocal,
} from '../../lib/local-engine';
import { readTokens } from '../../lib/client-stream';
type Mode = 'synthetic' | 'recorded' | 'live';
const clips = [
  { id: 'moving-right', label: 'Moving right', url: '/lab/moving-right.mp4' },
  { id: 'moving-left', label: 'Moving left', url: '/lab/moving-left.mp4' },
  { id: 'stationary', label: 'Stationary', url: '/lab/stationary.mp4' },
];
export default function Brain() {
  const [mode, setMode] = useState<Mode>('synthetic'),
    [clip, setClip] = useState(clips[0].id),
    [url, setUrl] = useState(clips[0].url),
    [camera, setCamera] = useState(false),
    [perception, setPerception] = useState(false),
    [hosted, setHosted] = useState(false),
    [recordings, setRecordings] = useState<Record<string, string>>({}),
    [result, setResult] = useState<PerceptionResult | null>(null),
    [position, setPosition] = useState<Point>(START),
    [target, setTarget] = useState<Point>(TARGET),
    [running, setRunning] = useState(false),
    [action, setAction] = useState<Action>('wait'),
    [reason, setReason] = useState(
      'Observe motion, then step through the policy.',
    ),
    [trace, setTrace] = useState<TraceEntry[]>([]),
    [notice, setNotice] = useState(
      'Synthetic mode is ready. No model is running and no video leaves your device.',
    ),
    [busy, setBusy] = useState(false),
    [dream, setDream] = useState(
      'What might happen next? Observe, act, then ask a language model to imagine.',
    ),
    [dreamMode, setDreamMode] = useState<'template' | 'local' | 'hosted'>(
      'template',
    ),
    [dreamBusy, setDreamBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    blob = useRef<string | null>(null),
    abort = useRef<AbortController | null>(null),
    started = useRef(Date.now()),
    revision = useRef(0),
    mounted = useRef(true);
  const add = (kind: TraceEntry['kind'], text: string) =>
    setTrace((old) =>
      [...old, { time: Date.now() - started.current, kind, text }].slice(-200),
    );
  useEffect(() => {
    mounted.current = true;
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ perception: boolean; chat: boolean }>)
      .then((c) => {
        setPerception(c.perception);
        setHosted(c.chat);
      })
      .catch(() => {});
    fetch('/lab/recordings.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((value) => setRecordings(value as Record<string, string>))
      .catch(() => {});
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (blob.current) URL.revokeObjectURL(blob.current);
      abort.current?.abort();
      cancelLocal();
    };
  }, []);
  useEffect(() => {
    if (camera && video.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {});
    }
  }, [camera]);
  const observation =
    mode === 'synthetic'
      ? clip
      : result?.observations[0]?.label || 'waiting for perception';
  function step() {
    const next = policy(position, target, observation);
    setPosition(next.next);
    setAction(next.action);
    setReason(next.reason);
    add('act', `${next.action}: ${next.reason}`);
    if (next.action === 'wait') setRunning(false);
  }
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(step, 600);
    return () => clearTimeout(timer);
  }, [running, position, target, observation]);
  function releaseCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    if (video.current) video.current.srcObject = null;
  }
  function chooseClip(id: string) {
    revision.current++;
    abort.current?.abort();
    releaseCamera();
    if (blob.current) {
      URL.revokeObjectURL(blob.current);
      blob.current = null;
    }
    setClip(id);
    setUrl(clips.find((c) => c.id === id)!.url);
    setResult(null);
    setRunning(false);
    setBusy(false);
    setNotice(
      'Sample selected. Synthetic labels come from the clip generator, not a perception model.',
    );
  }
  async function webcam() {
    try {
      releaseCamera();
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: 256, height: 256 },
        audio: false,
      });
      setCamera(true);
      setResult(null);
      setRunning(false);
      setMode('live');
      setNotice(
        'Camera stays on this device until you explicitly run hosted perception.',
      );
    } catch {
      setNotice(
        'Camera unavailable or permission declined. Choose a sample or upload a short video.',
      );
    }
  }
  async function observe() {
    if (busy) return;
    setRunning(false);
    if (mode === 'synthetic') {
      setNotice(
        `Synthetic observation: ${clip}. This is known sample metadata, not V-JEPA inference.`,
      );
      add('observe', `Synthetic sample label: ${clip}`);
      return;
    }
    const requestId = ++revision.current;
    setBusy(true);
    setNotice(
      mode === 'recorded'
        ? 'Loading a recorded V-JEPA run…'
        : 'Sampling 16 frames and sending them to the configured perception service…',
    );
    try {
      let output: PerceptionResult;
      if (mode === 'recorded') {
        const path = recordings[clip];
        if (!path)
          throw new Error(
            'No verified recording exists for this sample. Choose synthetic mode.',
          );
        const response = await fetch(path);
        if (!response.ok) throw new Error('Recording could not be loaded.');
        const recording = (await response.json()) as Recording;
        if (
          recording.schemaVersion !== 1 ||
          recording.result.mode !== 'recorded'
        )
          throw new Error('Recording provenance is invalid.');
        output = recording.result;
      } else {
        if (!video.current) throw new Error('Video unavailable.');
        const frames = await sampleFrames(video.current, camera);
        if (requestId !== revision.current) return;
        abort.current = new AbortController();
        const response = await fetch('/api/perceive', {
          method: 'POST',
          signal: abort.current.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames }),
        });
        const body = (await response.json()) as PerceptionResult & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Perception unavailable.');
        output = body;
      }
      if (
        !output.observations?.length ||
        !Array.isArray(output.embedding) ||
        output.embedding.some((n) => !Number.isFinite(n))
      )
        throw new Error('Perception response is incomplete.');
      if (requestId !== revision.current) return;
      setResult(output);
      add(
        'observe',
        `${output.mode}: ${output.observations[0].label} · similarity ${output.observations[0].similarity.toFixed(4)} · ${Math.round(output.elapsedMs)} ms`,
      );
      setNotice(
        `${output.mode === 'recorded' ? 'Recorded output loaded' : 'Live perception complete'}. Similarity to curated reference clips is not calibrated confidence.`,
      );
    } catch (e) {
      if (requestId === revision.current)
        setNotice(e instanceof Error ? e.message : 'Perception failed.');
    } finally {
      if (requestId === revision.current) setBusy(false);
    }
  }
  async function imagine() {
    if (dreamBusy) return;
    setDreamBusy(true);
    let text = '';
    setDream('');
    const summary = `${observation}; actor at (${position.x}, ${position.y}); target (${target.x}, ${target.y}); action ${action}`;
    const update = (token: string) => {
      text += token;
      if (mounted.current) setDream(text);
    };
    try {
      if (dreamMode === 'template') {
        text = `Perhaps the agent will ${action === 'wait' ? 'pause to gather another observation' : 'continue around the obstacle'}, then find a clearer path toward its target. This is a hand-written possibility, not a model prediction.`;
        setDream(text);
      } else if (dreamMode === 'local') {
        setNotice(
          'Loading the local chat model (approximately 400 MB plus runtime) for speculative narration…',
        );
        await loadLocal((t) => {
          if (mounted.current) setNotice(t);
        });
        await generateLocal(
          [
            {
              role: 'system',
              content:
                'Write two short sentences speculating about the next moment of a 2D agent simulation. You cannot see video or act. Explicitly use "might" or "perhaps". Never claim a real prediction.',
            },
            { role: 'user', content: summary },
          ],
          update,
        );
      } else {
        abort.current = new AbortController();
        await readTokens(
          await fetch('/api/dream', {
            method: 'POST',
            signal: abort.current.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ observation: summary, action }),
          }),
          update,
        );
      }
      add('dream', `${dreamMode}: ${text}`);
      setNotice(
        'Dream generated. It is speculative narration, not an observation or control signal.',
      );
    } catch (e) {
      setDream('No dream generated. Choose a different mode or try again.');
      setNotice(e instanceof Error ? e.message : 'Dream generation failed.');
    } finally {
      if (mounted.current) setDreamBusy(false);
    }
  }
  function download() {
    const file = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            mode,
            clip,
            perception: result,
            policy: 'rule-based-bfs-v1',
            position,
            target,
            trace,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const href = URL.createObjectURL(file),
      link = document.createElement('a');
    link.href = href;
    link.download = 'experimental-brain-run.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return (
    <>
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-number">01 / PERCEPTION</span>
              <h2>Observe.</h2>
            </div>
            <span>VIDEO / REPRESENTATION</span>
          </div>
          <div className="panel-content">
            <div className="video-stage">
              <video
                ref={video}
                key={camera ? 'camera' : url}
                src={camera ? undefined : url}
                muted
                playsInline
                controls={!camera}
                loop
                preload="metadata"
                aria-label="Perception input video"
              />
              <span className="stage-label">
                {camera
                  ? 'LOCAL CAMERA'
                  : clip === 'upload'
                    ? 'YOUR CLIP'
                    : 'GENERATED SAMPLE'}
              </span>
            </div>
            <label className="field-label">
              Input video
              <select
                className="lab-select"
                value={clip}
                disabled={busy}
                onChange={(e) => chooseClip(e.target.value)}
              >
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                {clip === 'upload' && (
                  <option value="upload">Uploaded clip</option>
                )}
              </select>
            </label>
            <div className="control-row">
              <label className="button secondary small">
                Upload a clip
                <input
                  className="sr-only"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 12 * 1024 * 1024) {
                      setNotice(
                        'Please choose a clip under 12 MB and 15 seconds.',
                      );
                      return;
                    }
                    chooseClip(clips[0].id);
                    blob.current = URL.createObjectURL(file);
                    setUrl(blob.current);
                    setClip('upload');
                    setMode('live');
                    setNotice(
                      'Clip loaded locally. Run hosted perception explicitly to send sampled frames.',
                    );
                  }}
                />
              </label>
              <button
                className="plain-button"
                disabled={busy}
                onClick={
                  camera
                    ? () => {
                        releaseCamera();
                        setNotice('Camera stopped.');
                      }
                    : webcam
                }
              >
                {camera ? 'Stop camera' : 'Use camera'}
              </button>
            </div>
            <label className="field-label">
              Perception mode
              <select
                className="lab-select"
                value={mode}
                disabled={busy}
                onChange={(e) => {
                  revision.current++;
                  setMode(e.target.value as Mode);
                  setResult(null);
                  setRunning(false);
                }}
              >
                <option
                  value="synthetic"
                  disabled={clip === 'upload' || camera}
                >
                  Synthetic labels · no model
                </option>
                <option value="recorded" disabled={!recordings[clip] || camera}>
                  Recorded V-JEPA output
                </option>
                <option value="live">Live V-JEPA · hosted</option>
              </select>
            </label>
            <p>
              {mode === 'synthetic'
                ? 'A transparent simulation using known sample labels. No V-JEPA model is running.'
                : mode === 'recorded'
                  ? 'Real embeddings computed earlier from this exact sample. No live inference.'
                  : 'Sends 16 sampled JPEG frames to a model service. The portfolio server does not retain the video; review the configured service before sending sensitive material.'}
            </p>
            <Button
              size="sm"
              onClick={observe}
              disabled={busy || (mode === 'live' && !perception)}
            >
              {busy
                ? 'Observing…'
                : mode === 'live'
                  ? 'Run hosted perception'
                  : mode === 'recorded'
                    ? 'Load recorded run'
                    : 'Observe sample'}{' '}
            </Button>
            {mode === 'live' && !perception && (
              <p className="research-note">
                Live perception awaits a configured GPU/CPU model service. Try a
                sample in recorded or synthetic mode.
              </p>
            )}
            {result && (
              <div
                className="similarity-list"
                aria-label="Reference clip similarities"
              >
                {result.observations.map((o) => (
                  <div key={o.label} className="similarity-row">
                    <span>{o.label}</span>
                    <span>{o.similarity.toFixed(4)}</span>
                    <meter
                      value={o.similarity}
                      min={-1}
                      max={1}
                      aria-label={`${o.label} similarity`}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="lab-meta">
              {result
                ? `${result.model} · ${result.mode} · ${Math.round(result.elapsedMs)} ms`
                : 'No model output yet.'}
            </p>
          </div>
        </section>
        <section className="lab-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-number">02 / POLICY</span>
              <h2>Act.</h2>
            </div>
            <span>REPRESENTATION / ACTION</span>
          </div>
          <div className="panel-content">
            <div
              className="policy-board"
              role="group"
              aria-label="Actor simulation. Change target using the controls below."
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const p = {
                  x: Math.min(
                    9,
                    Math.floor(((e.clientX - rect.left) / rect.width) * 10),
                  ),
                  y: Math.min(
                    9,
                    Math.floor(((e.clientY - rect.top) / rect.height) * 10),
                  ),
                };
                if (!blocked(p)) {
                  setTarget(p);
                  setRunning(false);
                  add('system', `Target changed to (${p.x}, ${p.y})`);
                }
              }}
            >
              <div className="board-grid" />
              <div
                className="obstacle"
                style={{ left: '40%', top: '30%', width: '20%', height: '40%' }}
              />
              <span
                className="target"
                style={{
                  left: `${target.x * 10 + 5}%`,
                  top: `${target.y * 10 + 5}%`,
                }}
              >
                ◎
              </span>
              <span
                className="actor"
                style={{
                  left: `${position.x * 10 + 5}%`,
                  top: `${position.y * 10 + 5}%`,
                }}
              >
                ·
              </span>
              <span className="board-legend">AGENT · OBSTACLE ▧ TARGET ◎</span>
            </div>
            <div className="control-row">
              <Button size="sm" onClick={() => setRunning(!running)}>
                {running ? 'Pause' : 'Run'}
                {!running && <Icon name="play" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={step}
                disabled={running}
              >
                Single step
              </Button>
              <button
                className="plain-button"
                onClick={() => {
                  setPosition(START);
                  setRunning(false);
                  setAction('wait');
                  setReason('Simulation reset.');
                  add('system', 'Actor reset.');
                }}
              >
                Reset
              </button>
            </div>
            <div className="control-row">
              <label className="field-label">
                Target X{' '}
                <input
                  aria-label="Target X coordinate"
                  className="lab-input"
                  type="number"
                  min={0}
                  max={9}
                  value={target.x}
                  onChange={(e) => {
                    const p = { ...target, x: Number(e.target.value) };
                    if (!blocked(p) && Number.isInteger(p.x)) {
                      setTarget(p);
                      setRunning(false);
                    }
                  }}
                />
              </label>
              <label className="field-label">
                Target Y{' '}
                <input
                  aria-label="Target Y coordinate"
                  className="lab-input"
                  type="number"
                  min={0}
                  max={9}
                  value={target.y}
                  onChange={(e) => {
                    const p = { ...target, y: Number(e.target.value) };
                    if (!blocked(p) && Number.isInteger(p.y)) {
                      setTarget(p);
                      setRunning(false);
                    }
                  }}
                />
              </label>
            </div>
            <div className="observation-box">
              <strong>RULE-BASED POLICY V1</strong>
              <p>
                Observation: {observation}
                <br />
                Action: {action}
                <br />
                {reason}
              </p>
            </div>
            <p>
              Motion permits movement. A shortest-path planner chooses a safe
              step around the obstacle. Stationary observations make the actor
              wait. Click the board or edit target coordinates.
            </p>
            <p className="research-note">
              This is an inspectable rule-based actor, not a trained robotics
              policy. Its only environment is this simulation.
            </p>
          </div>
        </section>
        <section className="lab-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-number">03 / IMAGINATION</span>
              <h2>Dream.</h2>
            </div>
            <span>STATE / POSSIBILITY</span>
          </div>
          <div className="panel-content">
            <div className="dream-stage">
              <span>SPECULATIVE · {dreamMode.toUpperCase()}</span>
              <p>{dream}</p>
              <small>Imagination is not evidence.</small>
            </div>
            <label className="field-label">
              Narrator
              <select
                className="lab-select"
                value={dreamMode}
                disabled={dreamBusy}
                onChange={(e) =>
                  setDreamMode(e.target.value as typeof dreamMode)
                }
              >
                <option value="template">
                  Hand-written template · no model
                </option>
                <option value="local">On-device LLM · download ~400 MB</option>
                <option value="hosted" disabled={!hosted}>
                  Hosted LLM {hosted ? '' : '· not configured'}
                </option>
              </select>
            </label>
            <p>
              {dreamMode === 'hosted'
                ? 'Sends only the textual observation and simulation state to a configured language-model provider.'
                : 'The narrator receives a compact state summary. It does not see the video and cannot control the actor.'}
            </p>
            <Button size="sm" onClick={imagine} disabled={dreamBusy}>
              {dreamBusy ? 'Imagining…' : 'Imagine a next moment'}{' '}
              <span>✳</span>
            </Button>
            {dreamBusy && (
              <button
                className="plain-button"
                onClick={() => {
                  abort.current?.abort();
                  stopLocal();
                  cancelLocal();
                  setNotice('Dream stopped.');
                }}
              >
                Stop / cancel model load
              </button>
            )}
            <a className="plain-button" href="/lab/theme">
              Explore the theme experiment <Icon name="right" />
            </a>
          </div>
        </section>
      </div>
      <div className="lab-status" role="status">
        {notice}
      </div>
      <section className="trace-section">
        <div className="trace-heading">
          <h2>Follow the thought process.</h2>
          <div className="control-row">
            <button
              className="plain-button"
              onClick={() => {
                setTrace([]);
                started.current = Date.now();
              }}
            >
              Clear trace
            </button>
            <Button variant="outline" size="sm" onClick={download}>
              Download run JSON <Icon name="download" />
            </Button>
          </div>
        </div>
        <div className="trace-list" aria-label="Research run trace">
          {trace.length ? (
            trace
              .slice()
              .reverse()
              .map((t, i) => (
                <div className="trace-item" key={`${t.time}-${i}`}>
                  <time>{(t.time / 1000).toFixed(1)}s</time>
                  <span>{t.kind.toUpperCase()}</span>
                  <span>{t.text}</span>
                </div>
              ))
          ) : (
            <p className="empty-state">
              Your observations, actions and dreams will appear here. Try
              Observe sample, then Single step.
            </p>
          )}
        </div>
        <details className="technical-details">
          <summary>Under the hood: models, provenance & limitations</summary>
          <dl>
            <dt>Perception</dt>
            <dd>
              {result?.model ||
                'V-JEPA 2 service adapter; synthetic mode currently selected'}
            </dd>
            <dt>Revision</dt>
            <dd>{result?.revision || 'No model run loaded'}</dd>
            <dt>Preprocessing</dt>
            <dd>
              {result?.preprocessing ||
                '16 uniformly sampled, center-cropped 256 × 256 JPEG frames'}
            </dd>
            <dt>Actor</dt>
            <dd>
              rule-based-bfs-v1 · 10 × 10 grid · fixed move/wait action set
            </dd>
            <dt>Dream</dt>
            <dd>
              {dreamMode === 'template'
                ? 'Hand-written template'
                : dreamMode === 'local'
                  ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
                  : 'Server-configured language model'}{' '}
              · speculative narration only
            </dd>
          </dl>
          <p>
            The encoder produces representations, not textual descriptions.
            Reference similarities label the nearest sample, not a calibrated
            understanding of arbitrary video. The policy is a demonstration of a
            connection between perception and action; it is not a learned world
            model or V-JEPA 2-AC controller.
          </p>
          <p>
            Uploaded clips and camera streams stay in browser memory until
            explicit hosted inference. Camera tracks stop when you stop the
            camera or leave this page. Run traces are session-only unless you
            download them.
          </p>
        </details>
      </section>
    </>
  );
}
