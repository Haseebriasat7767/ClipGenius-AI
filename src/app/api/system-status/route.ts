import { apiHandler, jsonOk } from '@/lib/api';
import { getIntegrationStatus } from '@/lib/env';
import { getFfmpegCapabilities } from '@/lib/video/ffmpeg';
import { getQueueDepth } from '@/lib/queue';

export const GET = apiHandler('system-status', async () => {
  let ffmpeg = { ok: false, version: '', captions: 'unavailable' };
  try {
    const caps = await getFfmpegCapabilities();
    ffmpeg = {
      ok: true,
      version: caps.version,
      captions: caps.hasAss ? 'libass' : caps.hasDrawtext ? 'drawtext' : 'unavailable',
    };
  } catch (err) {
    ffmpeg = { ok: false, version: String(err), captions: 'unavailable' };
  }

  let queueDepth = 0;
  try {
    queueDepth = await getQueueDepth();
  } catch {
    /* database may not be up yet */
  }

  return jsonOk({
    integrations: getIntegrationStatus(),
    ffmpeg,
    queueDepth,
    node: process.version,
  });
});
