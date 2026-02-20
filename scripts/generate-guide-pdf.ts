import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'guide-screenshots');
const OUTPUT_PATH = path.join(process.cwd(), 'onboarding-guide.pdf');

function imgBase64(filename: string): string {
  const filePath = path.join(SCREENSHOT_DIR, filename);
  const data = fs.readFileSync(filePath);
  return `data:image/png;base64,${data.toString('base64')}`;
}

const sections = [
  {
    title: '1. 로그인',
    image: '01_login.png',
    description: `
      <p><strong>플랫폼 접속 및 로그인</strong></p>
      <ul>
        <li>이메일 주소와 비밀번호를 입력하여 로그인합니다.</li>
        <li>계정이 없는 경우 관리자에게 초대를 요청하세요.</li>
        <li>로그인 후 대시보드(홈)로 자동 이동합니다.</li>
        <li>보안을 위해 30일 후 자동 로그아웃됩니다.</li>
      </ul>
    `,
  },
  {
    title: '2. 홈 대시보드',
    image: '02_home.png',
    description: `
      <p><strong>핵심 지표를 한눈에 확인</strong></p>
      <ul>
        <li><strong>상단 KPI 카드:</strong> 진행 중 캠페인, 응답 대기, 확인 필요, 업로드 예정, 지급 대기 금액을 즉시 확인합니다.</li>
        <li><strong>오늘의 할 일:</strong> 우선순위 기반으로 초안 수신 확인, 업로드 예정 등 긴급 태스크를 표시합니다. [지연] 배지가 뜨면 즉시 처리가 필요합니다.</li>
        <li><strong>커뮤니케이션 요약:</strong> 새 답장과 미응답 스레드 수를 확인하고, 최근 스레드를 클릭하면 바로 대화로 이동합니다.</li>
        <li><strong>콘텐츠 진행 현황:</strong> 초안 대기 / 피드백 대기 / 업로드 예정 / 업로드 완료 건수를 카드로 요약합니다.</li>
      </ul>
    `,
  },
  {
    title: '3. 인플루언서 탐색',
    image: '03_discover.png',
    description: `
      <p><strong>인플루언서 DB 검색 및 관리</strong></p>
      <ul>
        <li><strong>검색:</strong> 이름 또는 핸들로 빠르게 검색합니다.</li>
        <li><strong>필터:</strong> 플랫폼(인스타, 유튜브 등), 팔로워 수, 컨택 여부, 최신순, 협업 상태로 필터링합니다.</li>
        <li><strong>클라이언트 필터:</strong> 상단 버튼으로 소속 클라이언트별 인플루언서를 필터링합니다.</li>
        <li><strong>대량 추가:</strong> [대량 추가] 버튼으로 엑셀/TSV에서 인플루언서를 일괄 등록합니다.</li>
        <li><strong>개별 추가:</strong> [+ 인플루언서 추가] 버튼으로 한 명씩 등록합니다.</li>
        <li>행을 클릭하면 상세 패널이 열리며, 프로필 정보 수정, 캠페인 이력 확인이 가능합니다.</li>
      </ul>
    `,
  },
  {
    title: '4. 캠페인 목록',
    image: '04_campaigns.png',
    description: `
      <p><strong>전체 캠페인 현황 관리</strong></p>
      <ul>
        <li>진행 중인 모든 캠페인을 카드 형태로 확인합니다.</li>
        <li>각 카드에 클라이언트 로고, 인플루언서 수, 예산, 상태가 표시됩니다.</li>
        <li>카드를 클릭하면 캠페인 상세 페이지로 이동합니다.</li>
        <li>[+ 새 캠페인] 버튼으로 새 캠페인을 생성합니다.</li>
        <li>캠페인별로 6단계 워크플로우(선정→컨택→계약→제작→정산→설정)를 진행합니다.</li>
      </ul>
    `,
  },
  {
    title: '5. 캠페인 상세 - 선정 탭',
    image: '05_campaign_selection.png',
    description: `
      <p><strong>인플루언서 선정 및 진행 단계 관리</strong></p>
      <ul>
        <li><strong>상단 요약:</strong> 캠페인명, 클라이언트, 인플루언서 수, 계약/지급 건수, 집행 예산을 표시합니다.</li>
        <li><strong>라인아이템 테이블:</strong> 각 인플루언서의 팔로워, 채널, 메모, 진행 단계(대기→컨택→확정→계약), 광고료, 일정을 관리합니다.</li>
        <li><strong>진행 단계 버튼:</strong> 클릭하여 단계를 변경합니다. 색상으로 현재 상태를 즉시 파악합니다.</li>
        <li><strong>[+] 버튼:</strong> 인플루언서 DB에서 바로 추가하거나 새로 등록합니다.</li>
        <li>행을 클릭하면 인플루언서 상세 패널이 열립니다.</li>
      </ul>
    `,
  },
  {
    title: '6. 캠페인 상세 - 컨택 탭',
    image: '06_campaign_contact.png',
    description: `
      <p><strong>인플루언서 커뮤니케이션 센터</strong></p>
      <ul>
        <li><strong>3-패널 레이아웃:</strong> 좌측 인플루언서 목록 / 중앙 이메일 대화 / 우측 인플루언서 정보로 구성됩니다.</li>
        <li><strong>일괄 발송:</strong> [일괄 발송] 버튼으로 여러 인플루언서에게 동시에 협업 제안 이메일을 발송합니다. 변수 치환({{인플루언서명}} 등)을 지원합니다.</li>
        <li><strong>동기화:</strong> Gmail과 실시간 동기화하여 주고받은 이메일을 자동으로 불러옵니다.</li>
        <li><strong>제출 링크:</strong> 상단 안내 배너의 제출 링크를 인플루언서에게 공유하면 콘텐츠를 업로드받을 수 있습니다.</li>
        <li>인플루언서를 클릭하면 해당 대화 스레드가 중앙에 표시됩니다.</li>
      </ul>
    `,
  },
  {
    title: '7. 캠페인 상세 - 계약 탭',
    image: '07_campaign_contract.png',
    description: `
      <p><strong>계약서 생성 및 관리</strong></p>
      <ul>
        <li>계약 템플릿을 활용하여 인플루언서별 계약서를 생성합니다.</li>
        <li>변수({{인플루언서명}}, {{캠페인명}}, {{광고료}} 등)가 자동으로 치환됩니다.</li>
        <li>DOCX 또는 PDF로 다운로드할 수 있습니다.</li>
        <li>설정 페이지에서 계약서 템플릿을 미리 등록하고 관리합니다.</li>
      </ul>
    `,
  },
  {
    title: '8. 캠페인 상세 - 제작 탭',
    image: '08_campaign_production.png',
    description: `
      <p><strong>콘텐츠 제출물 관리</strong></p>
      <ul>
        <li><strong>제출 현황:</strong> 각 인플루언서의 콘텐츠 제출 여부와 제출물 수를 확인합니다.</li>
        <li><strong>빨간 숫자 배지:</strong> 미확인 제출물이 있으면 빨간 배지로 표시됩니다. 클릭하면 제출 이력이 열립니다.</li>
        <li><strong>OneDrive 연동:</strong> 제출된 파일은 자동으로 OneDrive에 저장되며, 파일 링크를 통해 바로 열 수 있습니다.</li>
        <li><strong>리뷰 추적:</strong> 제출물 열람 시 자동으로 '확인됨'으로 표시됩니다.</li>
        <li>게시 URL, 메타 파트너십 코드 등의 정보도 이 탭에서 관리합니다.</li>
      </ul>
    `,
  },
  {
    title: '9. 캠페인 상세 - 정산 탭',
    image: '09_campaign_settlement.png',
    description: `
      <p><strong>정산 및 지급 관리</strong></p>
      <ul>
        <li><strong>정산 상태:</strong> 각 인플루언서별 정산 진행 상태를 확인합니다(정산정보미비, 지급대기, 지급완료 등).</li>
        <li><strong>정산 정보:</strong> 예금주, 은행, 계좌번호 등 정산에 필요한 정보를 관리합니다.</li>
        <li><strong>정산 요청:</strong> 업로드 완료된 인플루언서에 대해 [정산 요청] 버튼을 클릭합니다.</li>
        <li><strong>TSV 복사:</strong> 은행 이체용 데이터를 클립보드에 복사하여 엑셀에 바로 붙여넣을 수 있습니다.</li>
        <li><strong>입금 완료:</strong> 워크스페이스 오너만 최종 입금 확인을 처리할 수 있습니다.</li>
      </ul>
    `,
  },
  {
    title: '10. 캠페인 상세 - 설정 탭',
    image: '10_campaign_settings.png',
    description: `
      <p><strong>캠페인 기본 정보 설정</strong></p>
      <ul>
        <li>캠페인 이름, 설명, 클라이언트, 상태(진행중/완료/보관)를 수정합니다.</li>
        <li>캠페인 담당자를 지정하고 관리합니다.</li>
        <li>제출 페이지 링크를 확인하고 공유합니다.</li>
      </ul>
    `,
  },
  {
    title: '11. 이메일 센터',
    image: '11_email_center.png',
    description: `
      <p><strong>통합 이메일 관리</strong></p>
      <ul>
        <li>캠페인별로 인플루언서와 주고받은 모든 이메일 스레드를 확인합니다.</li>
        <li>Gmail 계정을 연동하여 실시간으로 이메일을 동기화합니다.</li>
        <li>이메일 계정은 사용자별로 개별 관리됩니다.</li>
        <li>기존 이메일 스레드를 IMAP 검색으로 찾아 연결할 수 있습니다.</li>
      </ul>
    `,
  },
  {
    title: '12. 정산 작업큐',
    image: '12_finance.png',
    description: `
      <p><strong>전체 정산 현황 모니터링</strong></p>
      <ul>
        <li><strong>KPI 카드:</strong> 정산요청, 지급대기, 정보미비, 보류, 대기금액을 한눈에 확인합니다.</li>
        <li><strong>필터:</strong> 광고주별, 캠페인별로 정산 작업을 필터링합니다.</li>
        <li><strong>작업큐:</strong> 업로드 완료된 라인아이템 중 정산이 필요한 항목을 표시합니다.</li>
        <li>CSV 다운로드로 정산 데이터를 내보낼 수 있습니다.</li>
      </ul>
    `,
  },
  {
    title: '13. 성과 추적',
    image: '13_tracking.png',
    description: `
      <p><strong>캠페인 성과 데이터 관리</strong></p>
      <ul>
        <li>인플루언서별 게시물 성과(조회수, 좋아요, 댓글 등)를 기록합니다.</li>
        <li>추적 작업을 생성하여 정기적으로 성과를 수집합니다.</li>
        <li>CSV로 성과 데이터를 내보내 리포트 작성에 활용합니다.</li>
      </ul>
    `,
  },
  {
    title: '14. 그룹 관리',
    image: '14_groups.png',
    description: `
      <p><strong>인플루언서 그룹 관리</strong></p>
      <ul>
        <li>인플루언서를 그룹으로 묶어 효율적으로 관리합니다.</li>
        <li>그룹 단위로 캠페인에 일괄 추가할 수 있습니다.</li>
        <li>카테고리별, 등급별 등 원하는 기준으로 그룹을 생성합니다.</li>
      </ul>
    `,
  },
  {
    title: '15. 설정',
    image: '15_settings.png',
    description: `
      <p><strong>워크스페이스 및 계정 설정</strong></p>
      <ul>
        <li><strong>워크스페이스 관리:</strong> 팀원 초대, 역할(오너/멤버) 관리, 클라이언트 계정 설정을 합니다.</li>
        <li><strong>이메일 계정:</strong> Gmail 연동 설정 및 관리를 합니다.</li>
        <li><strong>계약서 템플릿:</strong> 계약서 기본 서식을 등록하고 관리합니다.</li>
        <li><strong>클라이언트 관리:</strong> 광고주/클라이언트 정보와 로고를 등록합니다.</li>
        <li><strong>내 프로필:</strong> 이름, 이메일 서명 등을 설정합니다.</li>
      </ul>
    `,
  },
  {
    title: '16. 인플루언서 제출 페이지',
    image: '16_submit_page.png',
    description: `
      <p><strong>인플루언서 전용 콘텐츠 제출 페이지</strong></p>
      <ul>
        <li>로그인 없이 접근 가능한 공개 페이지입니다.</li>
        <li>인플루언서가 직접 콘텐츠 파일(이미지, 영상)을 업로드합니다.</li>
        <li>게시 URL과 메타 파트너십 코드를 입력할 수 있습니다.</li>
        <li>제출 이력을 확인하고 추가 업로드가 가능합니다.</li>
        <li>정산 정보(계좌, 사업자번호 등)를 입력하면 정산 절차가 진행됩니다.</li>
        <li>제출 링크는 캠페인 컨택 탭 상단에서 복사합니다.</li>
      </ul>
    `,
  },
];

const permissionSection = `
  <div class="section-box">
    <h2>권한 구조</h2>
    <table>
      <thead>
        <tr>
          <th>역할</th>
          <th>설명</th>
          <th>주요 권한</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>워크스페이스 오너</strong></td>
          <td>워크스페이스 최고 관리자</td>
          <td>모든 기능 접근, 팀원 관리, 입금 완료 처리, 설정 변경</td>
        </tr>
        <tr>
          <td><strong>멤버</strong></td>
          <td>팀원</td>
          <td>캠페인 관리, 인플루언서 관리, 이메일 발송, 정산 요청(입금 확인 제외)</td>
        </tr>
        <tr>
          <td><strong>클라이언트</strong></td>
          <td>외부 광고주</td>
          <td>배정된 캠페인 조회만 가능, 정산/이메일 기능 접근 불가</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

const tipsSection = `
  <div class="section-box">
    <h2>실무 팁</h2>
    <div class="tips-grid">
      <div class="tip-card">
        <h3>1. 매일 확인</h3>
        <p>홈 대시보드의 [오늘의 할 일]과 [커뮤니케이션 요약]을 매일 아침 확인하세요. [지연] 배지가 뜨면 즉시 처리합니다.</p>
      </div>
      <div class="tip-card">
        <h3>2. 일괄 발송 활용</h3>
        <p>캠페인 초기에 [일괄 발송]으로 한 번에 제안 이메일을 보내세요. 변수 치환으로 개인화된 메시지를 대량 발송할 수 있습니다.</p>
      </div>
      <div class="tip-card">
        <h3>3. 제출 링크 공유</h3>
        <p>컨택 탭 상단의 제출 링크를 인플루언서에게 공유하면 콘텐츠 수집부터 정산 정보 입력까지 자동화됩니다.</p>
      </div>
      <div class="tip-card">
        <h3>4. 정산 프로세스</h3>
        <p>업로드 완료 → 정산 요청 → 정보 확인 → 지급 대기 → 입금 완료 순서로 진행합니다. 정산정보가 미비하면 인플루언서에게 제출 페이지 링크를 다시 안내하세요.</p>
      </div>
    </div>
  </div>
`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: 'Noto Sans KR', sans-serif;
    color: #1a1a2e;
    background: #fff;
    font-size: 11px;
    line-height: 1.6;
  }

  .cover {
    page-break-after: always;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #4a90d9 100%);
    color: white;
    text-align: center;
    padding: 60px;
  }

  .cover h1 {
    font-size: 36px;
    font-weight: 700;
    margin-bottom: 16px;
    letter-spacing: -0.5px;
  }

  .cover .subtitle {
    font-size: 18px;
    font-weight: 300;
    opacity: 0.9;
    margin-bottom: 40px;
  }

  .cover .info {
    font-size: 13px;
    opacity: 0.7;
    margin-top: 40px;
  }

  .cover .divider {
    width: 80px;
    height: 3px;
    background: rgba(255,255,255,0.4);
    margin: 20px auto;
  }

  .toc {
    page-break-after: always;
    padding: 50px 60px;
  }

  .toc h2 {
    font-size: 22px;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 30px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e0e7ef;
  }

  .toc ul {
    list-style: none;
    padding: 0;
  }

  .toc li {
    padding: 8px 0;
    font-size: 13px;
    border-bottom: 1px solid #f0f4f8;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toc li .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #1e3a5f;
    color: white;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .page {
    page-break-after: always;
    padding: 40px 50px;
  }

  .page-title {
    font-size: 18px;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 24px;
    padding-bottom: 8px;
    border-bottom: 2px solid #4a90d9;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-title .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #1e3a5f;
    color: white;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .side-by-side {
    display: flex;
    gap: 28px;
    align-items: flex-start;
  }

  .screenshot-col {
    flex: 0 0 58%;
    max-width: 58%;
  }

  .screenshot-col img {
    width: 100%;
    border: 1px solid #e0e7ef;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .text-col {
    flex: 1;
    padding-top: 4px;
  }

  .text-col p {
    margin-bottom: 10px;
    font-size: 12px;
    font-weight: 600;
    color: #1e3a5f;
  }

  .text-col ul {
    padding-left: 16px;
    margin: 0;
  }

  .text-col li {
    margin-bottom: 6px;
    font-size: 10.5px;
    line-height: 1.6;
    color: #333;
  }

  .text-col li strong {
    color: #1e3a5f;
  }

  .section-box {
    page-break-after: always;
    padding: 40px 50px;
  }

  .section-box h2 {
    font-size: 20px;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 24px;
    padding-bottom: 8px;
    border-bottom: 2px solid #4a90d9;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
    font-size: 11px;
  }

  th {
    background: #1e3a5f;
    color: white;
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid #e8ecf0;
    vertical-align: top;
  }

  tr:nth-child(even) td {
    background: #f7f9fc;
  }

  .tips-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 16px;
  }

  .tip-card {
    background: #f7f9fc;
    border: 1px solid #e0e7ef;
    border-radius: 8px;
    padding: 16px;
  }

  .tip-card h3 {
    font-size: 13px;
    font-weight: 600;
    color: #1e3a5f;
    margin-bottom: 8px;
  }

  .tip-card p {
    font-size: 10.5px;
    line-height: 1.6;
    color: #444;
  }

  .workflow-section {
    page-break-after: always;
    padding: 40px 50px;
  }

  .workflow-section h2 {
    font-size: 20px;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 2px solid #4a90d9;
  }

  .workflow-steps {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 20px 0 30px;
    padding: 16px;
    background: #f7f9fc;
    border-radius: 8px;
  }

  .workflow-step {
    text-align: center;
    flex: 1;
  }

  .workflow-step .circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #1e3a5f;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .workflow-step .label {
    font-size: 11px;
    font-weight: 600;
    color: #1e3a5f;
  }

  .workflow-arrow {
    color: #4a90d9;
    font-size: 20px;
    flex-shrink: 0;
    padding: 0 4px;
  }

  .workflow-detail {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .workflow-card {
    border: 1px solid #e0e7ef;
    border-radius: 8px;
    padding: 14px;
    background: white;
  }

  .workflow-card h4 {
    font-size: 12px;
    font-weight: 600;
    color: #1e3a5f;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .workflow-card h4 .wf-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #4a90d9;
    color: white;
    font-size: 10px;
    flex-shrink: 0;
  }

  .workflow-card p {
    font-size: 10px;
    line-height: 1.5;
    color: #555;
  }
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <h1>인플루언서 운영 플랫폼</h1>
  <div class="divider"></div>
  <div class="subtitle">팀 온보딩 가이드</div>
  <div class="info">
    내부 운영 매뉴얼 | v1.0
  </div>
</div>

<!-- Table of Contents -->
<div class="toc">
  <h2>목차</h2>
  <ul>
    ${sections.map((s, i) => `<li><span class="num">${i + 1}</span> ${s.title.replace(/^\d+\.\s*/, '')}</li>`).join('')}
    <li><span class="num">+</span> 캠페인 6단계 워크플로우</li>
    <li><span class="num">+</span> 권한 구조</li>
    <li><span class="num">+</span> 실무 팁</li>
  </ul>
</div>

<!-- Screenshot + Description Pages -->
${sections.map((s, i) => `
<div class="page">
  <div class="page-title">
    <span class="step-num">${i + 1}</span>
    ${s.title.replace(/^\d+\.\s*/, '')}
  </div>
  <div class="side-by-side">
    <div class="screenshot-col">
      <img src="${imgBase64(s.image)}" />
    </div>
    <div class="text-col">
      ${s.description}
    </div>
  </div>
</div>
`).join('')}

<!-- Workflow Section -->
<div class="workflow-section">
  <h2>캠페인 6단계 워크플로우</h2>
  <div class="workflow-steps">
    <div class="workflow-step"><div class="circle">1</div><div class="label">선정</div></div>
    <div class="workflow-arrow">&rarr;</div>
    <div class="workflow-step"><div class="circle">2</div><div class="label">컨택</div></div>
    <div class="workflow-arrow">&rarr;</div>
    <div class="workflow-step"><div class="circle">3</div><div class="label">계약</div></div>
    <div class="workflow-arrow">&rarr;</div>
    <div class="workflow-step"><div class="circle">4</div><div class="label">제작</div></div>
    <div class="workflow-arrow">&rarr;</div>
    <div class="workflow-step"><div class="circle">5</div><div class="label">정산</div></div>
    <div class="workflow-arrow">&rarr;</div>
    <div class="workflow-step"><div class="circle">6</div><div class="label">설정</div></div>
  </div>
  <div class="workflow-detail">
    <div class="workflow-card">
      <h4><span class="wf-num">1</span> 선정</h4>
      <p>인플루언서 DB에서 캠페인에 적합한 인플루언서를 선정합니다. 진행 단계를 대기→컨택→확정→계약 순으로 관리합니다.</p>
    </div>
    <div class="workflow-card">
      <h4><span class="wf-num">2</span> 컨택</h4>
      <p>선정된 인플루언서에게 이메일을 발송합니다. 일괄 발송, Gmail 동기화, 3-패널 메신저로 효율적으로 소통합니다.</p>
    </div>
    <div class="workflow-card">
      <h4><span class="wf-num">3</span> 계약</h4>
      <p>확정된 인플루언서와 계약서를 작성합니다. 템플릿의 변수가 자동 치환되어 DOCX/PDF로 생성됩니다.</p>
    </div>
    <div class="workflow-card">
      <h4><span class="wf-num">4</span> 제작</h4>
      <p>인플루언서가 제출 페이지를 통해 콘텐츠를 업로드합니다. OneDrive에 자동 저장되며 리뷰 상태를 추적합니다.</p>
    </div>
    <div class="workflow-card">
      <h4><span class="wf-num">5</span> 정산</h4>
      <p>업로드 완료 후 정산을 진행합니다. 정산 정보 확인 → 지급 대기 → 입금 완료 순서로 처리합니다.</p>
    </div>
    <div class="workflow-card">
      <h4><span class="wf-num">6</span> 설정</h4>
      <p>캠페인 기본 정보, 담당자, 상태 등을 관리합니다. 캠페인 완료 후 상태를 '완료'로 변경합니다.</p>
    </div>
  </div>
</div>

<!-- Permission Section -->
${permissionSection}

<!-- Tips Section -->
${tipsSection}

</body>
</html>`;

async function main() {
  console.log('Generating PDF...');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

  await page.pdf({
    path: OUTPUT_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });

  await browser.close();
  console.log(`PDF generated: ${OUTPUT_PATH}`);

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
