import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
export default function Theme() {
  const [prompt, setPrompt] = useState('A quiet garden after the rain'),
    [colors, setColors] = useState(['#e9e4f4', '#e1eee4']),
    [status, setStatus] = useState(
      'Ready when you are. No model has been downloaded.',
    ),
    [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setStatus('Cancelled. You can retry at any time.');
  }
  function generate() {
    setBusy(true);
    setStatus('Loading MiniLM and the original theme weights…');
    if (!worker.current) {
      worker.current = new Worker(
        new URL('../../workers/theme.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current.onmessage = (e) => {
        if (e.data.type === 'result') {
          setColors(e.data.colors);
          setStatus(
            `Generated locally from a ${e.data.dimensions}-dimension embedding and the original learned colour weights. Pastel constraint applied.`,
          );
          setBusy(false);
        } else {
          setStatus(e.data.text);
          if (e.data.type === 'error') setBusy(false);
        }
      };
      worker.current.onerror = () => {
        setStatus('The model could not start. Retry in a supported browser.');
        setBusy(false);
      };
    }
    worker.current.postMessage({ prompt });
  }
  return (
    <>
      <label className="field-label" htmlFor="theme-prompt">
        Describe a feeling, place or idea
      </label>
      <input
        className="lab-input"
        id="theme-prompt"
        maxLength={300}
        value={prompt}
        disabled={busy}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="control-row">
        <Button onClick={generate} disabled={busy || !prompt.trim()}>
          {busy ? 'Generating…' : 'Load model & generate'} <span>✳</span>
        </Button>
        {busy && (
          <button className="plain-button" onClick={cancel}>
            Cancel
          </button>
        )}
        <button
          className="plain-button"
          disabled={busy}
          onClick={async () => {
            worker.current?.terminate();
            worker.current = null;
            try {
              for (const key of await caches.keys())
                if (key.includes('transformers')) await caches.delete(key);
              setStatus('Transformers model cache cleared.');
            } catch {
              setStatus(
                'Cache clearing unavailable. Use browser storage settings.',
              );
            }
          }}
        >
          Clear model cache
        </button>
      </div>
      <p className="lab-meta" style={{ marginTop: 15 }}>
        MiniLM-L6-v2 · quantized · approximately 25 MB plus runtime. Runs in a
        worker using your browser’s CPU. The download starts only on Generate.
      </p>
      <div className="theme-preview" aria-label="Generated pastel palette">
        {colors.map((c, i) => (
          <div key={i} className="theme-swatch" style={{ background: c }} />
        ))}
      </div>
      <p className="status-message" role="status">
        {status}
      </p>
      <p className="research-note" style={{ marginTop: 20 }}>
        The original site mapped embeddings to RGBA values. This version
        preserves those weights and constrains the colours to a pastel range. It
        is an aesthetic experiment, not a validated model of colour meaning.
      </p>
    </>
  );
}
