export async function sampleFrames(
  video: HTMLVideoElement,
  live = false,
): Promise<string[]> {
  if (!video.videoWidth || !video.videoHeight)
    throw new Error('Wait for the video to load.');
  if (!live && (!Number.isFinite(video.duration) || video.duration > 15))
    throw new Error('Please choose a video of 15 seconds or less.');
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const frames: string[] = [];
  const original = video.currentTime;
  video.pause();
  try {
    for (let i = 0; i < 16; i++) {
      if (live) {
        await new Promise((r) => setTimeout(r, 250));
      } else {
        const t = (i / 16) * Math.max(0, video.duration - 0.05);
        if (Math.abs(video.currentTime - t) > 0.01) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              cleanup();
              reject(new Error('Video frame seeking timed out.'));
            }, 5000);
            const cleanup = () => {
              clearTimeout(timeout);
              video.removeEventListener('seeked', seeked);
              video.removeEventListener('error', failed);
            };
            const seeked = () => {
              cleanup();
              resolve();
            };
            const failed = () => {
              cleanup();
              reject(new Error('Unable to read this video.'));
            };
            video.addEventListener('seeked', seeked, { once: true });
            video.addEventListener('error', failed, { once: true });
            video.currentTime = t;
          });
        }
      }
      const side = Math.min(video.videoWidth, video.videoHeight);
      ctx.drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      frames.push(canvas.toDataURL('image/jpeg', 0.8));
    }
  } finally {
    if (!live) video.currentTime = original;
  }
  return frames;
}
