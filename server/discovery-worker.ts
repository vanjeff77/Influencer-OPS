import { db } from "./db";
import { aiSearchJobs, aiSearchCandidates, workspaces } from "@shared/schema";
import type { AiSearchJob } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  collectFollowingsFromSeeds,
  fetchProfilesForCandidates,
  type AggregatedCandidate,
  type SeedLog,
} from "./instagram-discovery";
import {
  analyzeInfluencerCandidates,
  type CandidateProfile,
} from "./ai/influencer-analyzer";

interface LogEntry {
  type: 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

interface JobProgress {
  currentStep: string;
  seedsProcessed?: number;
  seedsTotal?: number;
  candidatesFound?: number;
  profilesFetched?: number;
  profilesTotal?: number;
  analyzedCount?: number;
  totalToAnalyze?: number;
  estimatedSeconds?: number;
  startedAt?: string;
  logs?: LogEntry[];
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

const jobLogs = new Map<number, LogEntry[]>();

function addLog(jobId: number, type: 'success' | 'warning' | 'error', message: string) {
  if (!jobLogs.has(jobId)) jobLogs.set(jobId, []);
  jobLogs.get(jobId)!.push({ type, message, timestamp: new Date().toISOString() });
}

const DELAY_PER_REQUEST_SEC = 3;
const AVG_FOLLOWINGS_PER_SEED = 200;

function estimateInitialSeconds(seedCount: number, maxResults: number): number {
  const followingPhase = seedCount * 15;
  const estimatedCandidates = Math.min(seedCount * AVG_FOLLOWINGS_PER_SEED, maxResults * 3);
  const profilePhase = estimatedCandidates * DELAY_PER_REQUEST_SEC;
  const analyzePhase = 30;
  return followingPhase + profilePhase + analyzePhase;
}

function estimateRemainingSeconds(
  step: string,
  seedsTotal: number,
  seedsProcessed: number,
  candidatesFound: number,
  profilesFetched: number,
  profilesTotal: number,
  analyzedCount: number,
  totalToAnalyze: number,
): number {
  let remaining = 0;
  if (step === 'fetching_followings') {
    const seedsLeft = seedsTotal - seedsProcessed;
    remaining += seedsLeft * 15;
    const estCandidates = Math.max(candidatesFound, seedsLeft * AVG_FOLLOWINGS_PER_SEED);
    remaining += estCandidates * DELAY_PER_REQUEST_SEC;
    remaining += 30;
  } else if (step === 'fetching_profiles') {
    const profilesLeft = profilesTotal - profilesFetched;
    remaining += profilesLeft * DELAY_PER_REQUEST_SEC;
    remaining += 30;
  } else if (step === 'analyzing') {
    const left = totalToAnalyze - analyzedCount;
    remaining += Math.max(left * 0.5, 10);
  }
  return Math.max(remaining, 0);
}

function getLogs(jobId: number): LogEntry[] {
  return jobLogs.get(jobId) || [];
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

  jobLogs.set(jobId, []);
  const startedAt = new Date().toISOString();
  const initialEstimate = estimateInitialSeconds(job.seedHandles.length, job.maxResults || 50);
  const estMinutes = Math.ceil(initialEstimate / 60);
  addLog(jobId, 'success', `서칭 시작: 시드 ${job.seedHandles.length}개 (${job.seedHandles.map(h => '@' + h).join(', ')}), 예상 소요시간: 약 ${estMinutes}분`);
  (job as any)._startedAt = startedAt;
  (job as any)._initialEstimate = initialEstimate;

  try {
    await stepFetchFollowings(job);
    await stepFetchProfiles(job);
    await stepAnalyze(job);

    const aggregated: AggregatedCandidate[] = (job as any)._aggregated || [];
    const recommendedCount = aggregated.length;
    addLog(jobId, recommendedCount > 0 ? 'success' : 'warning',
      recommendedCount > 0
        ? `서칭 완료: ${recommendedCount}명의 후보를 찾았습니다.`
        : `서칭 완료: 조건에 맞는 후보를 찾지 못했습니다.`
    );

    await updateJobStatus(job.id, "completed", {
      currentStep: "completed",
      logs: getLogs(jobId),
    });
    console.log(`[DiscoveryWorker] Job ${job.id} completed successfully`);
  } catch (err: any) {
    console.error(`[DiscoveryWorker] Job ${job.id} failed:`, err);
    addLog(jobId, 'error', `작업 실패: ${err.message || '알 수 없는 오류'}`);
    await updateJobStatus(job.id, "failed", { currentStep: "failed", logs: getLogs(jobId) }, err.message || "Unknown error");
  } finally {
    jobLogs.delete(jobId);
  }
}

async function stepFetchFollowings(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: fetching_followings`);
  const startedAt = (job as any)._startedAt as string;

  const progress: JobProgress = {
    currentStep: "fetching_followings",
    seedsProcessed: 0,
    seedsTotal: job.seedHandles.length,
    candidatesFound: 0,
    startedAt,
    estimatedSeconds: (job as any)._initialEstimate,
  };
  await updateJobStatus(job.id, "fetching_followings", progress);

  const candidateMap = await collectFollowingsFromSeeds(
    job.seedHandles,
    500,
    async (seedsProcessed, seedsTotal, candidatesFound) => {
      progress.seedsProcessed = seedsProcessed;
      progress.seedsTotal = seedsTotal;
      progress.candidatesFound = candidatesFound;
      progress.estimatedSeconds = estimateRemainingSeconds('fetching_followings', seedsTotal, seedsProcessed, candidatesFound, 0, 0, 0, 0);
      await updateJobProgress(job.id, { ...progress, logs: getLogs(job.id) });
    },
    (log) => addLog(job.id, log.type, log.message)
  );

  progress.seedsProcessed = job.seedHandles.length;
  progress.candidatesFound = candidateMap.size;
  addLog(job.id, 'success', `팔로잉 수집 완료: 중복 제거 후 고유 후보 ${candidateMap.size}명`);
  await updateJobProgress(job.id, { ...progress, logs: getLogs(job.id) });

  (job as any)._candidateMap = candidateMap;
}

async function stepFetchProfiles(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: fetching_profiles`);
  const startedAt = (job as any)._startedAt as string;

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
    startedAt,
    estimatedSeconds: estimateRemainingSeconds('fetching_profiles', 0, 0, 0, 0, candidateMap.size, 0, 0),
  };
  await updateJobStatus(job.id, "fetching_profiles", progress);

  const { results: aggregated } = await fetchProfilesForCandidates(
    candidateMap,
    job.followerMin,
    job.followerMax,
    async (profilesFetched, totalCandidates) => {
      progress.profilesFetched = profilesFetched;
      progress.profilesTotal = totalCandidates;
      progress.estimatedSeconds = estimateRemainingSeconds('fetching_profiles', 0, 0, 0, profilesFetched, totalCandidates, 0, 0);
      await updateJobProgress(job.id, { ...progress, logs: getLogs(job.id) });
    },
    (log) => addLog(job.id, log.type, log.message)
  );

  const maxResults = job.maxResults || 50;
  const sorted = aggregated.sort((a, b) => b.sourceSeeds.length - a.sourceSeeds.length);
  const trimmed = sorted.slice(0, maxResults);

  if (trimmed.length < aggregated.length) {
    addLog(job.id, 'success', `최대 결과 수(${maxResults}명) 제한 적용: ${aggregated.length}명 → ${trimmed.length}명`);
  }

  (job as any)._aggregated = trimmed;
  progress.profilesFetched = candidateMap.size;
  await updateJobProgress(job.id, { ...progress, logs: getLogs(job.id) });
}

async function stepAnalyze(job: AiSearchJob): Promise<void> {
  console.log(`[DiscoveryWorker] Job ${job.id}: analyzing`);
  const startedAt = (job as any)._startedAt as string;

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
    startedAt,
    estimatedSeconds: estimateRemainingSeconds('analyzing', 0, 0, 0, 0, 0, 0, aggregated.length),
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

  const recommendedCount = candidateRows.filter(c => c.status === 'recommended').length;
  addLog(job.id, 'success', `AI 분석 완료: ${candidateRows.length}명 중 ${recommendedCount}명 추천 (점수 50점 이상)`);

  await updateJobProgress(job.id, { ...progress, logs: getLogs(job.id) });
  console.log(`[DiscoveryWorker] Job ${job.id}: inserted ${candidateRows.length} candidates`);
}
