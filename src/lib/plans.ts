import { ApiError } from './errors';

export type PlanId = 'free' | 'creator' | 'pro' | 'agency';

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceMonthly: number;
  clipsPerMonth: number;
  maxProjectsPerMonth: number;
  maxSourceMinutes: number;
  maxUploadMb: number;
  exportMaxHeight: number; // 1920 = 1080x1920 full HD vertical
  watermark: boolean;
  priorityQueue: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    clipsPerMonth: 5,
    maxProjectsPerMonth: 3,
    maxSourceMinutes: 10,
    maxUploadMb: 500,
    exportMaxHeight: 1280,
    watermark: true,
    priorityQueue: false,
    features: [
      '5 clips / month',
      'Videos up to 10 minutes',
      '720p vertical exports',
      'Auto captions & smart crop',
      'ClipGenius watermark',
    ],
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    priceMonthly: 19,
    clipsPerMonth: 50,
    maxProjectsPerMonth: 30,
    maxSourceMinutes: 30,
    maxUploadMb: 2048,
    exportMaxHeight: 1920,
    watermark: false,
    priorityQueue: false,
    features: [
      '50 clips / month',
      'Videos up to 30 minutes',
      '1080x1920 exports',
      'Animated captions & face tracking',
      'No watermark',
      'Thumbnail & metadata generation',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 49,
    clipsPerMonth: 200,
    maxProjectsPerMonth: 120,
    maxSourceMinutes: 120,
    maxUploadMb: 4096,
    exportMaxHeight: 1920,
    watermark: false,
    priorityQueue: true,
    features: [
      '200 clips / month',
      'Videos up to 2 hours',
      '1080x1920 exports',
      'Priority processing queue',
      'Filler-word & silence removal',
      'Advanced caption styles',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceMonthly: 99,
    clipsPerMonth: 1000,
    maxProjectsPerMonth: 500,
    maxSourceMinutes: 240,
    maxUploadMb: 8192,
    exportMaxHeight: 1920,
    watermark: false,
    priorityQueue: true,
    features: [
      '1,000 clips / month',
      'Videos up to 4 hours',
      '1080x1920 exports',
      'Highest priority queue',
      'Bulk workflows',
      'Priority support',
    ],
  },
};

export interface UsageSnapshot {
  clips_generated: number;
  minutes_processed: number;
  renders: number;
  storage_bytes: number;
  projects_this_month: number;
}

export function getPlan(plan: string): PlanLimits {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'free'];
}

/** Server-side enforcement of subscription limits. */
export function assertUploadAllowed(plan: PlanLimits, sizeBytes: number): void {
  const maxBytes = plan.maxUploadMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new ApiError(
      413,
      `File is ${formatMb(sizeBytes)} MB — the ${plan.name} plan allows up to ${plan.maxUploadMb} MB. Upgrade to upload larger videos.`,
      'plan_limit',
    );
  }
}

export function assertDurationAllowed(plan: PlanLimits, seconds: number): void {
  if (seconds > plan.maxSourceMinutes * 60) {
    throw new ApiError(
      422,
      `Video is ${Math.round(seconds / 60)} minutes — the ${plan.name} plan allows up to ${plan.maxSourceMinutes} minutes. Upgrade to process longer videos.`,
      'plan_limit',
    );
  }
}

export function assertClipQuota(plan: PlanLimits, usage: UsageSnapshot, requestedClips: number): void {
  const remaining = plan.clipsPerMonth - usage.clips_generated;
  if (requestedClips > remaining) {
    throw new ApiError(
      402,
      `This job would generate ${requestedClips} clips but only ${Math.max(0, remaining)} of ${plan.clipsPerMonth} remain this month on the ${plan.name} plan.`,
      'plan_limit',
    );
  }
}

export function assertProjectQuota(plan: PlanLimits, usage: UsageSnapshot): void {
  if (usage.projects_this_month >= plan.maxProjectsPerMonth) {
    throw new ApiError(
      402,
      `You reached the ${plan.name} plan limit of ${plan.maxProjectsPerMonth} projects this month.`,
      'plan_limit',
    );
  }
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
