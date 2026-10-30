import type { Metadata } from "next";
import { Faq, Phone, Step, type Shot } from "../parts";

// 출퇴근 시스템 전체 안내 (2026-10-30). 현장 직원이 알바(당근·고정)에게 폰으로 보여주며 설명하는 용도.
// 화면 사진은 로컬에서 예시 계정으로 찍은 것(public/guide). 관리자 화면 사용법은 넣지 않습니다(사장님만 사용).
export const metadata: Metadata = {
  title: "출퇴근 사용 안내",
  description: "sakun.kr 가입부터 출퇴근·계약서·급여 확인까지 전체 안내",
};

const SHOTS = {
  signup: { src: "/guide/02-signup-filled.png", w: 780, h: 2680, alt: "가입 화면에 정보를 입력한 모습" },
  signupDone: { src: "/guide/03-signup-done.png", w: 780, h: 1688, alt: "등록 완료 후 출퇴근 화면 열기 버튼", crop: true },
  linkDone: { src: "/guide/04-link-done.png", w: 780, h: 1688, alt: "출퇴근 화면 연결 완료", crop: true },
  contract: { src: "/guide/staff-s2-contract.png", w: 780, h: 2152, alt: "근로계약서 작성 화면" },
  convertPin: { src: "/guide/convert-1-pin.png", w: 780, h: 1688, alt: "1주 계약서 아래 현장 직원 PIN 입력" },
  convertDone: { src: "/guide/convert-2-done.png", w: 780, h: 1688, alt: "11개월 근로계약서로 바뀐 화면" },
  main: { src: "/guide/staff-s3-main.png", w: 780, h: 1688, alt: "출퇴근 화면" },
  full: { src: "/guide/staff-s4-main-full.png", w: 780, h: 2560, alt: "다음 주 스케줄과 급여조회·내 계약서 메뉴" },
  payroll: { src: "/guide/staff-s5-payroll.png", w: 780, h: 1688, alt: "근로자 급여 조회 화면" },
  reconnect: { src: "/guide/07-reconnect-done.png", w: 780, h: 1688, alt: "같은 정보로 다시 입력해 연결 완료", crop: true },
} satisfies Record<string, Shot>;

const TOC = [
  ["signup", "가입"],
  ["contract", "계약서"],
  ["convert", "당근→고정 전환"],
  ["attendance", "출근·퇴근"],
  ["schedule", "스케줄"],
  ["payroll", "급여·계약서 확인"],
  ["home", "홈 화면 추가"],
  ["faq", "자주 묻는 질문"],
  ["links", "링크 모음"],
] as const;

// 근로자·현장 직원이 쓰는 주소 모음(2026-10-30). 관리자 주소는 넣지 않습니다(사장님만 사용).
const LINKS: { label: string; path: string; note: string; tag?: "carrot" | "fixed" }[] = [
  { label: "출퇴근", path: "/", note: "매일 출근·퇴근, 스케줄 제출" },
  { label: "당근 가입", path: "/register-device?type=carrot", note: "당근 QR에 넣는 주소", tag: "carrot" },
  { label: "고정 직원 가입", path: "/register-device", note: "고정 QR에 넣는 주소 · 재연결 코드 입력도 여기서", tag: "fixed" },
  { label: "근로계약서 작성", path: "/contract", note: "서명할 계약서가 있을 때 · 당근→고정 전환도 여기서" },
  { label: "내 계약서", path: "/contract/mine", note: "서명한 계약서 다시 받기" },
  { label: "급여 조회", path: "/worker/payroll", note: "이름·주민번호로 이번 주 급여, 날짜별, 주급 명세서" },
  { label: "전체 안내 (이 페이지)", path: "/guide/all", note: "가입부터 급여까지 전체 설명" },
  { label: "당근 안내", path: "/guide", note: "당근 근무자용 짧은 안내", tag: "carrot" },
];

function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-4">
      {children}
    </div>
  );
}

function Tag({ kind }: { kind: "carrot" | "fixed" | "staff" }) {
  const map = {
    carrot: ["당근", "bg-orange-100 text-orange-700"],
    fixed: ["고정", "bg-green-100 text-green-700"],
    staff: ["현장 직원용", "bg-gray-900 text-white"],
  } as const;
  const [label, cls] = map[kind];

  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}

export default function AllGuidePage() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-black [color-scheme:light]">
      <div className="mx-auto w-full max-w-[480px] space-y-5">
        <header className="px-1">
          <p className="text-sm font-semibold text-orange-500">sakun.kr 출퇴근 안내</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">가입부터 급여 확인까지</h1>
          <p className="mt-2 text-sm text-gray-500">
            당근 단기 근무자와 고정 근무자 모두 이 안내를 보면 됩니다. 다른 부분에는 <Tag kind="carrot" /> <Tag kind="fixed" /> 표시를 했습니다.
            화면 속 이름·번호는 예시입니다.
          </p>
        </header>

        <section className="rounded-3xl bg-gray-900 px-5 py-5 text-white">
          <p className="text-base font-bold">꼭 기억해 주세요</p>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
            <li>
              ✅ 출퇴근은 휴대폰 <b className="text-orange-300">기본 브라우저</b>에서 합니다.
              <br />
              <span className="text-sm text-gray-300">안드로이드는 크롬(또는 삼성 인터넷), 아이폰은 사파리</span>
            </li>
            <li>🚫 카카오톡·네이버·당근 앱 <b>안에서</b> 열린 화면으로는 출퇴근하지 마세요.</li>
            <li>👉 한 번 연결되면 다음부터는 <b className="text-orange-300">sakun.kr</b> 만 열면 됩니다.</li>
          </ul>
        </section>

        <nav className="rounded-3xl bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-bold text-gray-900">바로 가기</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOC.map(([id, label], i) => (
              <a key={id} href={`#${id}`} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800">
                {i + 1}. {label}
              </a>
            ))}
          </div>
        </nav>

        <Anchor id="signup">
          <Step no={1} title="QR코드로 가입하기">
            <p>
              QR코드를 <b>휴대폰 기본 카메라</b>로 찍고, 뜨는 주소를 누르면 가입 화면이 나옵니다.
              (카카오톡·네이버 앱의 QR 스캐너 말고 기본 카메라를 써 주세요.)
            </p>
            <div className="space-y-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
              <p><Tag kind="carrot" /> 당근 QR → <b>&ldquo;당근 단기 근무 가입&rdquo;</b> 화면</p>
              <p><Tag kind="fixed" /> 고정 QR → <b>&ldquo;직원 가입&rdquo;</b> 화면</p>
              <p className="text-xs text-gray-500">QR을 잘못 찍으면 고용형태가 다르게 등록됩니다. 화면 아래 &ldquo;고용 형태&rdquo;를 꼭 확인해 주세요.</p>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>이름, 휴대폰번호, 주민번호(숫자 13자리), 은행명, 계좌번호</li>
              <li><b>근무지</b> 선택</li>
              <li>재연결 코드 칸은 <b>비워 두기</b> (휴대폰을 바꿨을 때만 씀)</li>
              <li>개인정보 동의 체크 → <b>등록하기</b></li>
            </ul>
            <Phone shot={SHOTS.signup} caption="가입 화면 (당근 QR로 들어온 경우)" />
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">노란 상자가 보이면?</p>
              <p className="mt-1">
                카톡·네이버·당근 앱 안에서 열렸다는 뜻입니다. <b>기본 브라우저로 열기</b>를 누르거나, 그대로 가입해도 됩니다.
                가입이 끝나면 <b>출퇴근 화면 열기</b> 버튼이 나오고, 누르면 기본 브라우저로 바로 연결됩니다(다시 입력 없음, 10분 안에 한 번).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Phone shot={SHOTS.signupDone} caption="① 출퇴근 화면 열기" />
              <Phone shot={SHOTS.linkDone} caption="② 자동 연결" />
            </div>
          </Step>
        </Anchor>

        <Anchor id="contract">
          <Step no={2} title="근로계약서 작성·서명">
            <p>가입이 끝나면 바로 근로계약서 화면이 나옵니다.</p>
            <div className="space-y-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
              <p><Tag kind="carrot" /> <b>1주 근로계약서</b> — 근무 요일, 시업·종업, 휴게시간을 입력</p>
              <p><Tag kind="fixed" /> <b>11개월 근로계약서</b> — 주소와 계약 시작일을 입력</p>
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>빈칸을 채웁니다. 주민번호는 가입 때 넣은 번호가 그대로 쓰입니다.</li>
              <li><b>계약서 미리보기</b>를 누르고 계약서를 <b>끝까지</b> 내려 읽습니다.</li>
              <li>손가락으로 <b>서명</b>하고 동의에 체크한 뒤 완료합니다.</li>
            </ol>
            <Phone shot={SHOTS.contract} caption="11개월 근로계약서 작성 화면" />
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>근무시간을 <b>09:30~18:00</b>으로 넣으면 휴게 <b>12:30~13:30</b>이 자동으로 들어갑니다.</li>
              <li>휴게가 없는 근무면 휴게 칸을 <b>비워 두면</b> 됩니다. 비우면 근무시간 전체가 근로시간이 됩니다.</li>
              <li>&ldquo;나중에 작성하고 출퇴근 화면으로&rdquo;를 눌러도 되지만, 서명 전까지 출근할 때마다 계약서 안내가 나옵니다.</li>
              <li><Tag kind="carrot" /> 1주 계약이 끝나면 출근할 때 새 1주 계약서 안내가 나옵니다.</li>
            </ul>
          </Step>
        </Anchor>

        <Anchor id="convert">
          <Step no={3} title="당근 → 고정(11개월) 전환">
            <p><Tag kind="staff" /> 근로자 혼자서는 할 수 없고, <b>현장 직원이 PIN</b>을 넣어야 바뀝니다.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>근로자 폰에 <b>1주 근로계약서 작성 화면</b>을 띄웁니다. (가입 직후, 또는 출근할 때 새 1주 계약서 안내가 뜰 때)</li>
              <li>화면 맨 아래 <b>&ldquo;고정(11개월)으로 전환 — 현장 직원용&rdquo;</b>을 누릅니다.</li>
              <li>현장 직원이 직접 <b>PIN</b>을 넣고 <b>전환</b>을 누릅니다.</li>
              <li>계약서가 <b>11개월 근로계약서</b>로 바뀝니다. 근로자가 주소를 넣고 미리보기 → 서명하면 끝입니다.</li>
            </ol>
            <div className="grid grid-cols-2 gap-3">
              <Phone shot={SHOTS.convertPin} caption="① PIN 입력 후 전환" />
              <Phone shot={SHOTS.convertDone} caption="② 11개월 계약서로 바뀜" />
            </div>
            <div className="space-y-1 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900">
              <p>• PIN은 근로자에게 알려주지 말고 <b>직원이 직접</b> 입력하세요.</p>
              <p>• 5번 틀리면 <b>15분 동안</b> 전환할 수 없습니다.</p>
              <p>• 이번 주 1주 계약서에 <b>이미 서명했다면</b> 전환 버튼이 안 보입니다. 다음 1주 계약서 안내가 뜰 때 전환하거나 사장님께 말씀해 주세요.</p>
              <p>• 고정으로 바뀌면 그때부터 출퇴근할 때 <b>위치 확인</b>을 합니다.</p>
            </div>
          </Step>
        </Anchor>

        <Anchor id="attendance">
          <Step no={4} title="출근·퇴근 누르기">
            <p>
              기본 브라우저에서 <b>sakun.kr</b> 을 열면 바로 이 화면이 나옵니다. 출근할 때 <b>출근하기</b>, 일이 끝나면 <b>퇴근하기</b>.
            </p>
            <Phone shot={SHOTS.main} caption="출퇴근 화면" />
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">📍 위치 확인</p>
                <p className="mt-1"><Tag kind="fixed" /> 출퇴근할 때 위치를 확인합니다. 위치 권한을 물으면 <b>허용</b>. 근무지 근처에서만 기록됩니다.</p>
                <p className="mt-1"><Tag kind="carrot" /> 위치 확인 없이 기록됩니다.</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">⏰ 퇴근 가능 시간</p>
                <p className="mt-1">12시 30분 이후, <b>정각·30분부터 10분 동안</b> 퇴근을 누를 수 있습니다. 예) 18:00~18:10, 18:30~18:40</p>
                <p className="mt-1">12시 30분 이전 퇴근은 관리자에게 문의. 화면에 <b>다음 퇴근 가능 시간</b>이 나옵니다.</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">🌙 야간 근무</p>
                <p className="mt-1">밤 10시 이후, 새벽 6시 전 퇴근은 언제든 누를 수 있고 <b>10분 단위</b>로 기록됩니다.</p>
                <p className="mt-1">예) 19일 21:00 출근 → 20일 02:00 퇴근은 <b>19일 근무</b>로 기록됩니다.</p>
              </div>
            </div>
          </Step>
        </Anchor>

        <Anchor id="schedule">
          <Step no={5} title="다음 주 스케줄 제출">
            <p>출퇴근 화면 아래 <b>다음 주 스케줄</b>에서 출근 가능한 요일과 주간/야간을 고르고 <b>스케줄 제출하기</b>.</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>공휴일은 자동으로 빠집니다.</li>
              <li>제출 후에도 고칠 수 있지만, <b>다음날 스케줄은 전날에 고칠 수 없습니다.</b></li>
            </ul>
            <Phone shot={SHOTS.full} caption="출퇴근 화면 아래쪽 — 스케줄·급여·계약서" />
          </Step>
        </Anchor>

        <Anchor id="payroll">
          <Step no={6} title="급여·계약서 확인">
            <p>출퇴근 화면 맨 아래 메뉴입니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>근로자 급여조회</b>: 이름과 주민번호(숫자만)로 조회. 이번 주 급여, 날짜별 급여, 주급 명세서를 볼 수 있습니다.</li>
              <li><b>내 계약서</b>: 서명한 근로계약서를 언제든 다시 받을 수 있습니다.</li>
            </ul>
            <Phone shot={SHOTS.payroll} caption="근로자 급여 조회" />
          </Step>
        </Anchor>

        <Anchor id="home">
          <Step no={7} title="홈 화면에 추가해 두기 (추천)">
            <p>기본 브라우저에서 sakun.kr 을 연 상태로 하세요. 다음부터 아이콘 하나로 바로 들어옵니다.</p>
            <div className="space-y-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">안드로이드 (크롬)</p>
                <p className="text-sm">오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">아이폰 (사파리)</p>
                <p className="text-sm">아래 가운데 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
                <p className="mt-1 text-xs text-gray-500">아이폰은 아이콘으로 처음 열 때 가입 화면이 나올 수 있습니다. 아래 &ldquo;이미 등록된 회원&rdquo; 방법대로 하세요.</p>
              </div>
            </div>
          </Step>
        </Anchor>

        <Anchor id="faq">
          <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">❓ 자주 묻는 질문</h2>
            <div className="mt-4 space-y-3">
              <Faq q="sakun.kr 에 들어갔더니 가입 화면이 나오고 '이미 등록된 회원입니다'가 떠요">
                <p>다른 브라우저(카톡·당근 앱 안 등)에서 가입했거나 휴대폰을 바꿨을 때 생깁니다.</p>
                <p>
                  <Tag kind="carrot" /> 가입 화면에 처음과 <b>똑같은 이름·휴대폰번호·주민번호</b>만 넣고 <b>등록하기</b> → 바로 연결됩니다.
                  은행·계좌는 비워도 됩니다. 재연결 코드 필요 없음.
                </p>
                <Phone shot={SHOTS.reconnect} caption="같은 정보로 다시 입력 → 연결" />
                <p>
                  <Tag kind="fixed" /> 사장님께 <b>재연결 코드</b>를 받아, 가입 화면 아래 <b>재연결 코드</b> 칸에 코드만 넣고 <b>기기 재연결하기</b>.
                </p>
              </Faq>
              <Faq q="'회사 반경 밖입니다' / 'GPS 정확도가 낮습니다'가 나와요">
                <p>근무지 안이나 바로 앞에서 다시 눌러주세요. 휴대폰 위치(GPS)가 켜져 있는지, 브라우저 위치 권한을 허용했는지 확인하세요.</p>
              </Faq>
              <Faq q="퇴근하기가 안 눌려요">
                <p>정각·30분부터 10분 동안만 됩니다. 화면의 <b>다음 퇴근 가능 시간</b>에 다시 누르세요. 일찍 퇴근해야 하면 관리자에게 말해 주세요.</p>
              </Faq>
              <Faq q="출근이나 퇴근을 깜빡했어요">
                <p>근로자가 직접 고칠 수 없습니다. 날짜와 실제 출퇴근 시간을 사장님께 알려주세요.</p>
              </Faq>
              <Faq q="당근으로 가입했는데 고정으로 일하게 됐어요">
                <p>위 <a href="#convert" className="font-semibold text-orange-600 underline">3. 당근→고정 전환</a>을 현장 직원과 함께 하세요.</p>
              </Faq>
            </div>
          </section>
        </Anchor>

        <Anchor id="links">
          <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">🔗 링크 모음</h2>
            <p className="mt-1 text-sm text-gray-500">누르면 바로 열립니다. 길게 누르면 주소를 복사할 수 있습니다.</p>
            <ul className="mt-4 divide-y divide-gray-100">
              {LINKS.map((link) => (
                <li key={link.path} className="py-3">
                  <a href={link.path} className="block">
                    <p className="flex items-center gap-2 font-semibold text-gray-900">
                      {link.label} {link.tag && <Tag kind={link.tag} />}
                    </p>
                    <p className="mt-0.5 break-all text-sm font-medium text-orange-600 underline">sakun.kr{link.path === "/" ? "" : link.path}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{link.note}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </Anchor>

        <p className="pb-6 text-center text-xs text-gray-400">sakun.kr 출퇴근 관리</p>
      </div>
    </main>
  );
}
