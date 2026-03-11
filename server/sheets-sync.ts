import { db } from './db';
import { campaigns, campaignInfluencers, influencers, influencerAccounts, workspaces } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getUncachableGoogleSheetClient } from './google-sheets';

const HEADER_ROW = [
  '인플루언서명', '플랫폼', '핸들', '이메일',
  '정산유형', '사업자명/성명', '사업자번호', '주민번호', '은행', '예금주', '계좌번호',
  '공급가', 'VAT', '총액',
  '팔로워', '연락처',
  '운영단계', '커뮤니케이션', '리뷰상태',
  '제안단가', 'VAT포함', '2차활용(개월)', '2차활용메모', '갱신비용', '납기메모',
  '계약서URL', '초안마감', '업로드마감',
  '정산상태', '지급메모', '지급예정일', '지급완료일',
];

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString('ko-KR');
}

const syncTimers = new Map<string, NodeJS.Timeout>();

export function scheduleCampaignSync(workspaceId: number, campaignId: number) {
  const key = `${workspaceId}:${campaignId}`;
  const existing = syncTimers.get(key);
  if (existing) clearTimeout(existing);

  syncTimers.set(key, setTimeout(async () => {
    syncTimers.delete(key);
    try {
      await syncCampaignToSheet(workspaceId, campaignId);
    } catch (err: any) {
      console.error(`[SheetsSync] Failed to sync campaign ${campaignId}:`, err.message);
    }
  }, 5000));
}

export function scheduleInfluencerSync(workspaceId: number, influencerId: number) {
  const key = `inf:${workspaceId}:${influencerId}`;
  const existing = syncTimers.get(key);
  if (existing) clearTimeout(existing);

  syncTimers.set(key, setTimeout(async () => {
    syncTimers.delete(key);
    try {
      const items = await db.select({ campaignId: campaignInfluencers.campaignId })
        .from(campaignInfluencers)
        .where(eq(campaignInfluencers.influencerId, influencerId));
      
      const campaignIds = [...new Set(items.map(i => i.campaignId))];
      for (const cId of campaignIds) {
        await syncCampaignToSheet(workspaceId, cId);
      }
    } catch (err: any) {
      console.error(`[SheetsSync] Failed to sync influencer ${influencerId} campaigns:`, err.message);
    }
  }, 5000));
}

export async function syncCampaignToSheet(workspaceId: number, campaignId: number) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace?.sheetSpreadsheetId) return;

  const spreadsheetId = workspace.sheetSpreadsheetId;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign || campaign.workspaceId !== workspaceId) return;

  const sheetTitle = campaign.name.replace(/[\\/*?[\]:]/g, '_').substring(0, 100);

  const items = await db.select()
    .from(campaignInfluencers)
    .where(eq(campaignInfluencers.campaignId, campaignId));

  const infIds = items.map(i => i.influencerId);
  const allInfluencers = infIds.length > 0
    ? await db.select().from(influencers).where(inArray(influencers.id, infIds))
    : [];
  
  const allAccounts = infIds.length > 0
    ? await db.select().from(influencerAccounts).where(inArray(influencerAccounts.influencerId, infIds))
    : [];

  const infMap = new Map(allInfluencers.map(i => [i.id, i]));
  const accMap = new Map<number, typeof allAccounts>();
  for (const acc of allAccounts) {
    const list = accMap.get(acc.influencerId) || [];
    list.push(acc);
    accMap.set(acc.influencerId, list);
  }

  const rows: string[][] = [HEADER_ROW];
  for (const item of items) {
    const inf = infMap.get(item.influencerId);
    if (!inf) continue;
    const accounts = accMap.get(inf.id) || [];
    const primaryAccount = accounts[0];

    rows.push([
      inf.name || '',
      primaryAccount?.platform || '',
      primaryAccount?.handle || '',
      inf.email || '',
      inf.settlementType || '',
      inf.businessName || '',
      inf.businessRegNo || '',
      inf.freelancerId || '',
      inf.bankName || '',
      inf.accountHolder || '',
      inf.accountNumber || '',
      formatCurrency(item.payoutAmountSupply),
      formatCurrency(item.payoutVat),
      formatCurrency(item.payoutTotal),
      primaryAccount?.followers?.toLocaleString() || '',
      inf.contactPoint || '',
      item.stage || '',
      item.commStatus || '',
      item.reviewStatus || '',
      formatCurrency(item.offerFee),
      item.offerVatIncluded ? 'Y' : 'N',
      item.offerUsageMonths?.toString() || '',
      item.offerUsageNote || '',
      formatCurrency(item.offerUsageRenewalFee),
      item.offerDeadlineNote || '',
      item.contractUrl || '',
      formatDate(item.draftDueAt),
      formatDate(item.uploadDueAt),
      item.payoutStatus || '',
      item.payoutMemo || '',
      formatDate(item.payoutDueAt),
      formatDate(item.paidAt),
    ]);
  }

  const sheets = await getUncachableGoogleSheetClient();

  let sheetExists = false;
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets || [];
    sheetExists = existingSheets.some(s => s.properties?.title === sheetTitle);
  } catch (err: any) {
    console.error(`[SheetsSync] Cannot access spreadsheet ${spreadsheetId}:`, err.message);
    throw new Error('스프레드시트에 접근할 수 없습니다. URL과 공유 권한을 확인해주세요.');
  }

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: sheetTitle }
          }
        }]
      }
    });
  }

  const range = `'${sheetTitle}'!A1`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetTitle}'`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`[SheetsSync] Synced campaign "${campaign.name}" (${rows.length - 1} rows) to sheet`);
}

export async function syncAllCampaignsToSheet(workspaceId: number) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace?.sheetSpreadsheetId) {
    throw new Error('스프레드시트 ID가 설정되지 않았습니다.');
  }

  const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
  let synced = 0;
  const errors: string[] = [];

  for (const campaign of allCampaigns) {
    try {
      await syncCampaignToSheet(workspaceId, campaign.id);
      synced++;
    } catch (err: any) {
      errors.push(`${campaign.name}: ${err.message}`);
    }
  }

  return { synced, total: allCampaigns.length, errors };
}

export async function testSheetAccess(spreadsheetId: string): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    return { success: true, title: res.data.properties?.title || '' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
