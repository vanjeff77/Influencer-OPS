import { chromium } from 'playwright';
import path from 'path';

const BASE_URL = 'http://localhost:5000';
const SCREENSHOT_DIR = path.join(process.cwd(), 'guide-screenshots');

async function main() {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // 1. Login page capture (before logging in)
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login.png'), fullPage: false });
  console.log('Captured: 01_login');

  // Login by filling the form
  await page.waitForSelector('[data-testid="input-username"]', { timeout: 5000 });
  await page.fill('[data-testid="input-username"]', 'demo@example.com');
  await page.fill('[data-testid="input-password"]', 'password');
  await page.click('[data-testid="button-login"]');
  await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 2. Home / Dashboard
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_home.png'), fullPage: false });
  console.log('Captured: 02_home');

  // 3. Discover (Influencer search)
  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_discover.png'), fullPage: false });
  console.log('Captured: 03_discover');

  // 4. Campaigns list
  await page.goto(`${BASE_URL}/campaigns`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_campaigns.png'), fullPage: false });
  console.log('Captured: 04_campaigns');

  const campaignId = 4;

  // 5-10: Campaign detail tabs
  const tabs = [
    { name: '05_campaign_selection', tab: 'influencers' },
    { name: '06_campaign_contact', tab: 'communication' },
    { name: '07_campaign_contract', tab: 'operations' },
    { name: '08_campaign_production', tab: 'content' },
    { name: '09_campaign_settlement', tab: 'finance' },
    { name: '10_campaign_settings', tab: 'settings' },
  ];

  for (const t of tabs) {
    await page.goto(`${BASE_URL}/campaigns/${campaignId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    if (t.tab !== 'influencers') {
      const tabButton = page.locator(`button[role="tab"][value="${t.tab}"]`);
      if (await tabButton.count() > 0) {
        await tabButton.click();
      } else {
        // Try text-based matching
        const tabLabels: Record<string, string> = {
          'communication': '컨택',
          'operations': '계약',
          'content': '제작',
          'finance': '정산',
          'settings': '설정',
        };
        const label = tabLabels[t.tab];
        if (label) {
          const textTab = page.getByRole('tab', { name: new RegExp(label) });
          if (await textTab.count() > 0) {
            await textTab.click();
          }
        }
      }
      await page.waitForTimeout(3000);
    }
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${t.name}.png`), fullPage: false });
    console.log(`Captured: ${t.name}`);
  }

  // 11. Email Center
  await page.goto(`${BASE_URL}/email`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_email_center.png'), fullPage: false });
  console.log('Captured: 11_email_center');

  // 12. Finance
  await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_finance.png'), fullPage: false });
  console.log('Captured: 12_finance');

  // 13. Tracking
  await page.goto(`${BASE_URL}/tracking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_tracking.png'), fullPage: false });
  console.log('Captured: 13_tracking');

  // 14. Groups
  await page.goto(`${BASE_URL}/groups`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_groups.png'), fullPage: false });
  console.log('Captured: 14_groups');

  // 15. Settings
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_settings.png'), fullPage: false });
  console.log('Captured: 15_settings');

  // 16. Submit page
  await page.goto(`${BASE_URL}/submit/${campaignId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_submit_page.png'), fullPage: false });
  console.log('Captured: 16_submit_page');

  await browser.close();
  console.log('\nAll screenshots captured successfully!');
}

main().catch(console.error);
