import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
let extractor: any;
self.onmessage = async (e: MessageEvent<{ prompt: string }>) => {
  try {
    if (!extractor)
      extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          dtype: 'q8',
          progress_callback: (p: any) => {
            self.postMessage({
              type: 'progress',
              text:
                p.status === 'progress'
                  ? `Loading MiniLM: ${Math.round(p.progress || 0)}% of ${p.file}`
                  : `Model: ${p.status}`,
            });
          },
        },
      );
    const weights = (await fetch('/theme-weights.json').then((r) => {
      if (!r.ok) throw new Error('Theme weights unavailable.');
      return r.json();
    })) as { weights: number[][]; bias: number[] };
    const output = await extractor(e.data.prompt, {
      pooling: 'mean',
      normalize: true,
    });
    const embedding = Array.from(output.data) as number[];
    if (
      weights.weights.length !== 4 ||
      weights.bias.length !== 4 ||
      weights.weights.some((row) => row.length !== embedding.length)
    )
      throw new Error('Theme weights do not match embedding dimensions.');
    const rgb = weights.weights.slice(0, 3).map((row, i) => {
      const sum = row.reduce(
        (s, w, j) => s + w * embedding[j],
        weights.bias[i],
      );
      return Math.round(190 + 55 / (1 + Math.exp(-sum)));
    });
    const second = rgb.map((_, i) => rgb[(i + 1) % 3]);
    self.postMessage({
      type: 'result',
      colors: [`rgb(${rgb.join(',')})`, `rgb(${second.join(',')})`],
      dimensions: embedding.length,
    });
  } catch (e) {
    self.postMessage({
      type: 'error',
      text: e instanceof Error ? e.message : 'Theme generation failed.',
    });
  }
};
