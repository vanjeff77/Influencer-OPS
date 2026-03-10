import { db } from "./db";
import { aiSearchJobs, aiSearchCandidates, workspaces } from "@shared/schema";
import type { AiSearchJob } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  collectFollowingsFromSeeds,
  fetchProfilesForCandidates,
  type AggregatedCandidate,
} from "./instagram-discovery";
import {
  analyzeInfluencerCandidates,
  type CandidateProfile,
} from "./ai/influencer-analyzer";

interface JobProgress {
  currentStep: string;
  seedsProcessed?: number;
  seedsTotal?: number;
  candidatesFound?: number;
  profilesFetched?: number;
  profilesTotal?: number;
  analyzedCount?: number;
  totalToAnalyze?: number;
}

async function updateJobStatus(jobId: number, status: string, progress?: JobProgress, errorMessage?: string) {
  const updateData: Partial<AiSearchJob> = { status };
  if (progress !== undefined) updateData.progress = progress;
  if (errorMessage !== undefined) updateData.errorMessage = errorMessage;
  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }
  await db.update(aiSearchJobs).set(updateData).where(eq(aiSearchJobs.id, jobId));
}

async function updateJobProgress(jobId: number, progress: JobProgress) {
  await db.update(aiSearchJobs).set({ progress }).where(eq(aiSearchJobs.id, jobId));
}

export async function processAiSearchJob(jobId: number): Promise<void> {
  console.log(`[DiscoveryWorker] Starting job ${jobId}`);

  const [job] = await db.select().from(aiSearchJobs).where(eq(aiSearchJobs.id, jobId));
  if (!job) {
    console.error(`[DiscoveryWorker] Job ${jobId} not found`);
    return;
  }

  if (job.status !== "pending") {
    console.log(`[DiscoveryWorker] Job ${jobId} is not pending (status: ${job.status}), skipping`);
    return;
  }

  try {
    await stepFetchFollowings(job);
    await stepFetchProfiles(job);
    await stepAnalyze(job);

    await updateJobStatus(job.id, "completed", {
      currentStep: "completed",
    });
    console.log(`[DiscoveryWorker] Job ${job.id} completed successfully`);
  } catch (err: any) {
    console.error(`[DiscoveryWorker] Job ${job.id} failed:`, err);
    await updateJobStatus(job.id, "failed", undefined, err.message || "Unknown error");
  }
}

async function stepFetchFollowings(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: fetching_followings`);

  const progress: JobProgress = {
    currentStep: "fetching_followings",
    seedsProcessed: 0,
    seedsTotal: job.seedHandles.length,
    candidatesFound: 0,
  };
  await updateJobStatus(job.id, "fetching_followings", progress);

  const candidateMap = await collectFollowingsFromSeeds(
    job.seedHandles,
    500,
    async (seedsProcessed, seedsTotal, candidatesFound) => {
      progress.seedsProcessed = seedsProcessed;
      progress.seedsTotal = seedsTotal;
      progress.candidatesFound = candidatesFound;
      await updateJobProgress(job.id, { ...progress });
    }
  );

  progress.seedsProcessed = job.seedHandles.length;
  progress.candidatesFound = candidateMap.size;
  await updateJobProgress(job.id, progress);

  (job as any)._candidateMap = candidateMap;
}

async function stepFetchProfiles(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: fetching_profiles`);

  const candidateMap = (job as any)._candidateMap as Map<string, { followingUser: any; sourceSeeds: string[] }>;
  if (!candidateMap || candidateMap.size === 0) {
    console.log(`[DiscoveryWorker] Job ${job.id}: no candidates to fetch profiles for`);
    (job as any)._aggregated = [];
    return;
  }

  const progress: JobProgress = {
    currentStep: "fetching_profiles",
    seedsProcessed: job.seedHandles.length,
    seedsTotal: job.seedHandles.length,
    candidatesFound: candidateMap.size,
    profilesFetched: 0,
    profilesTotal: candidateMap.size,
  };
  await updateJobStatus(job.id, "fetching_profiles", progress);

  const aggregated = await fetchProfilesForCandidates(
    candidateMap,
    job.followerMin,
    job.followerMax,
    async (profilesFetched, totalCandidates) => {
      progress.profilesFetched = profilesFetched;
      progress.profilesTotal = totalCandidates;
      await updateJobProgress(job.id, { ...progress });
    }
  );

  const maxResults = job.maxResults || 50;
  const sorted = aggregated.sort((a, b) => b.sourceSeeds.length - a.sourceSeeds.length);
  const trimmed = sorted.slice(0, maxResults);

  (job as any)._aggregated = trimmed;
  progress.profilesFetched = candidateMap.size;
  await updateJobProgress(job.id, progress);
}

async function stepAnalyze(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: analyzing`);

  const aggregated: AggregatedCandidate[] = (job as any)._aggregated || [];
  if (aggregated.length === 0) {
    console.log(`[DiscoveryWorker] Job ${job.id}: no candidates to analyze`);
    return;
  }

  const progress: JobProgress = {
    currentStep: "analyzing",
    seedsProcessed: job.seedHandles.length,
    seedsTotal: job.seedHandles.length,
    candidatesFound: aggregated.length,
    profilesFetched: aggregated.length,
    analyzedCount: 0,
    totalToAnalyze: aggregated.length,
  };
  await updateJobStatus(job.id, "analyzing", progress);

  const candidateProfiles: CandidateProfile[] = aggregated.map((c) => ({
    handle: c.handle,
    followers: c.profileData.followers,
    bio: c.profileData.bio,
    category: c.profileData.category,
    verified: c.profileData.isVerified,
    profileImageUrl: c.profileData.profilePicUrl,
    sourceSeeds: c.sourceSeeds,
  }));

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, job.workspaceId));

  const aiConfig = {
    aiProvider: workspace?.aiProvider || null,
    aiApiKey: workspace?.aiApiKey || null,
    aiModel: workspace?.aiModel || null,
  };

  const results = await analyzeInfluencerCandidates(
    candidateProfiles,
    job.seedHandles,
    job.criteria,
    aiConfig
  );

  const resultMap = new Map(results.map((r) => [r.handle.toLowerCase(), r]));

  const candidateRows = aggregated.map((c) => {
    const result = resultMap.get(c.handle.toLowerCase());
    return {
      jobId: job.id,
      handle: c.handle,
      platform: job.platform || "instagram",
      profileData: c.profileData as any,
      sourceSeeds: c.sourceSeeds,
      aiScore: result?.score ?? null,
      aiReason: result?.reason ?? null,
      status: result && result.score >= 50 ? "recommended" : "pending",
    };
  });

  if (candidateRows.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < candidateRows.length; i += BATCH_SIZE) {
      const batch = candidateRows.slice(i, i + BATCH_SIZE);
      await db.insert(aiSearchCandidates).values(batch);

      progress.analyzedCount = Math.min(i + BATCH_SIZE, candidateRows.length);
      await updateJobProgress(job.id, { ...progress });
    }
  }

  progress.analyzedCount = candidateRows.length;
  await updateJobProgress(job.id, progress);
  console.log(`[DiscoveryWorker] Job ${job.id}: inserted ${candidateRows.length} candidates`);
}
