import { z } from 'zod';
import { 
  insertUserSchema, insertWorkspaceSchema, insertInfluencerSchema, 
  insertInfluencerAccountSchema, insertGroupSchema, insertCampaignSchema,
  insertEmailAccountSchema, insertTrackingJobSchema, insertContractTemplateSchema,
  influencers, groups, campaigns, campaignInfluencers, emailAccounts, emailThreads, emailMessages, trackingJobs, contractTemplates
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

// Common response shapes
const influencerWithAccounts = z.custom<typeof influencers.$inferSelect & { accounts: (typeof insertInfluencerAccountSchema)[] }>();

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.object({ id: z.number(), email: z.string(), name: z.string() }),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: { 200: z.void() },
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me',
      responses: {
        200: z.object({ 
          id: z.number(), 
          email: z.string(), 
          name: z.string(),
          isPlatformAdmin: z.boolean().optional()
        }).nullable(),
      },
    },
  },
  workspaces: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces',
      responses: { 200: z.array(z.custom<typeof insertWorkspaceSchema & { id: number }>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces',
      input: insertWorkspaceSchema,
      responses: { 201: z.custom<typeof insertWorkspaceSchema & { id: number }>() },
    },
  },
  influencers: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/influencers',
      input: z.object({
        search: z.string().optional(),
        tags: z.string().optional(),
      }).optional(),
      responses: { 200: z.array(influencerWithAccounts) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/influencers',
      input: insertInfluencerSchema.extend({
        accounts: z.array(insertInfluencerAccountSchema.omit({ influencerId: true })).optional(),
      }),
      responses: { 201: influencerWithAccounts },
    },
    get: {
      method: 'GET' as const,
      path: '/api/influencers/:id',
      responses: { 200: influencerWithAccounts, 404: errorSchemas.notFound },
    },
  },
  groups: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/groups',
      responses: { 200: z.array(z.custom<typeof groups.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/groups',
      input: insertGroupSchema,
      responses: { 201: z.custom<typeof groups.$inferSelect>() },
    },
    addInfluencers: {
      method: 'POST' as const,
      path: '/api/groups/:id/influencers',
      input: z.object({ influencerIds: z.array(z.number()) }),
      responses: { 200: z.void() },
    },
  },
  campaigns: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/campaigns',
      responses: { 200: z.array(z.custom<typeof campaigns.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/campaigns',
      input: insertCampaignSchema,
      responses: { 201: z.custom<typeof campaigns.$inferSelect>() },
    },
    get: {
      method: 'GET' as const,
      path: '/api/campaigns/:id',
      responses: { 200: z.custom<typeof campaigns.$inferSelect & { items: (typeof campaignInfluencers.$inferSelect)[] }>() },
    },
    updateItem: {
      method: 'PATCH' as const,
      path: '/api/campaigns/items/:id',
      input: z.object({
        status: z.string().optional(),
        contractStatus: z.string().optional(),
        paymentStatus: z.string().optional(),
        payAmount: z.number().optional(),
      }),
      responses: { 200: z.custom<typeof campaignInfluencers.$inferSelect>() },
    },
  },
  email: {
    listAccounts: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/email-accounts',
      responses: { 200: z.array(z.custom<typeof emailAccounts.$inferSelect>()) },
    },
    sync: {
      method: 'POST' as const,
      path: '/api/email/accounts/:id/sync',
      responses: { 200: z.object({ syncedCount: z.number() }) },
    },
    threads: {
      method: 'GET' as const,
      path: '/api/email/accounts/:accountId/threads',
      responses: { 200: z.array(z.custom<typeof emailThreads.$inferSelect>()) },
    },
    threadDetails: {
      method: 'GET' as const,
      path: '/api/email/threads/:threadId',
      responses: { 200: z.custom<typeof emailThreads.$inferSelect & { messages: (typeof emailMessages.$inferSelect)[] }>() },
    },
    sendBulk: {
      method: 'POST' as const,
      path: '/api/email/send-bulk',
      input: z.object({
        accountId: z.number(),
        to: z.array(z.string()), // or influencer IDs
        subject: z.string(),
        bodyTemplate: z.string(), // "Hello {name}, ..."
      }),
      responses: { 200: z.object({ sent: z.number(), failed: z.number() }) },
    },
  },
  tracking: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/tracking-jobs',
      responses: { 200: z.array(z.custom<typeof trackingJobs.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/tracking-jobs',
      input: insertTrackingJobSchema,
      responses: { 201: z.custom<typeof trackingJobs.$inferSelect>() },
    },
    mockUpdate: {
      method: 'POST' as const,
      path: '/api/tracking/jobs/:id/mock-update',
      responses: { 200: z.void() },
    },
    getMetrics: {
      method: 'GET' as const,
      path: '/api/tracking/jobs/:id/metrics',
      responses: { 200: z.array(z.object({ date: z.string(), value: z.number() })) },
    },
  },
  contractTemplates: {
    list: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/contract-templates',
      responses: { 200: z.array(z.custom<typeof contractTemplates.$inferSelect>()) },
    },
    get: {
      method: 'GET' as const,
      path: '/api/workspaces/:workspaceId/contract-templates/:id',
      responses: { 200: z.custom<typeof contractTemplates.$inferSelect>(), 404: errorSchemas.notFound },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/contract-templates',
      input: insertContractTemplateSchema,
      responses: { 201: z.custom<typeof contractTemplates.$inferSelect>() },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/workspaces/:workspaceId/contract-templates/:id',
      input: insertContractTemplateSchema.partial(),
      responses: { 200: z.custom<typeof contractTemplates.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/workspaces/:workspaceId/contract-templates/:id',
      responses: { 200: z.object({ success: z.boolean() }), 404: errorSchemas.notFound },
    },
    generateDocx: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/contract-templates/:id/generate-docx',
      input: z.object({
        lineItemId: z.number(),
        variables: z.record(z.string()).optional(),
      }),
      responses: { 200: z.any() },
    },
    generatePdf: {
      method: 'POST' as const,
      path: '/api/workspaces/:workspaceId/contract-templates/:id/generate-pdf',
      input: z.object({
        lineItemId: z.number(),
        variables: z.record(z.string()).optional(),
      }),
      responses: { 200: z.any() },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
