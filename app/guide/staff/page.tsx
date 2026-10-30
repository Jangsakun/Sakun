import type { Metadata } from "next";
import { Faq, Phone, Step, type Shot } from "../parts";

// 고정 직원용 처음부터 끝까지 안내 (2026-10-30). 화면 사진은 로컬에서 예시 계정으로 찍은 것(public/guide/staff-*).
export const metadata: Metadata = {
  title: "직원 출퇴근 안내",
  description: "고정 근무 직원을 위한 sakun.kr 가입부터 급여 조회까지 안내",
};

const SHOTS = {
  signup: { src: "/guide/staff-s1-signup.png", w: 780, h: 2372, alt: "직원 가입 화면에 정보를 입력한 모습" },
  contract: { src: "/guide/staff-s2-contract.png", w: 780, h: 2152, alt: "근로계약서 작성 화면" },
  main: { src: "/guide/staff-s3-main.png", w: 780, h: 1688, alt: "출퇴근 화면" },
  full: { src: "/guide/staff-s4-main-full.png", w: 780, h: 2560, alt: "다음 주 스케줄과 급여조회·내 계약서 메뉴" },
  payroll: { src: "/guide/staff-s5-payroll.png", w: 780, h: 1688, alt: "근로자 급여 조회 화면" },
} satisfies Record<string, Shot>;

export default function StaffGuidePage() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-black [color-scheme:light]">
      <div className="mx-auto w-full max-w-[480px] space-y-5">
        <header className="px-1">
          <p className="text-sm font-semibold text-orange-500">직원 안내</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">출퇴근 사용 방법</h1>
          <p className="mt-2 text-sm text-gray-500">가입부터 급여 확인까지 한 번에 정리했습니다. 화면 속 이름·번호는 예시입니다.</p>
        </header>

        <section className="rounded-3xl bg-gray-900 px-5 py-5 text-white">
          <p className="text-base font-bold">한눈에 보기</p>
          <ol className="mt-3 space-y-2 text-[15px] leading-relaxed">
            <li>1. QR코드로 <b className="text-orange-300">가입</b></li>
            <li>2. <b className="text-orange-300">근로계약서</b> 작성·서명</li>
            <li>3. 매일 <b className="text-orange-300">출근하기 / 퇴근하기</b></li>
            <li>4. 매주 <b className="text-orange-300">다음 주 스케줄</b> 제출</li>
            <li>5. 언제든 <b className="text-orange-300">급여·계약서</b> 확인</li>
          </ol>
          <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm text-gray-200">
            출퇴근은 휴대폰 <b className="text-white">기본 브라우저</b>(안드로이드 크롬·삼성 인터넷 / 아이폰 사파리)에서 합니다.
            카카오톡·네이버 앱 안에서 열린 화면은 쓰지 마세요.
          </p>
        </section>

        <Step no={1} title="QR코드로 가입하기">
          <p>
            안내받은 QR코드를 <b>휴대폰 기본 카메라</b>로 찍고, 뜨는 주소를 누르면 <b>&ldquo;직원 가입&rdquo;</b> 화면이 나옵니다.
            (QR이 없으면 기본 브라우저 주소창에 <b>sakun.kr</b> 을 입력해도 됩니다.)
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>이름, 휴대폰번호, 주민번호(숫자 13자리), 은행명, 계좌번호 입력</li>
            <li><b>근무지</b>를 정확히 선택</li>
            <li>재연결 코드 칸은 <b>비워 두세요</b> (휴대폰을 바꿨을 때만 씁니다)</li>
            <li>개인정보 동의 체크 → <b>등록하기</b></li>
          </ul>
          <Phone shot={SHOTS.signup} caption="직원 가입 화면" />
        </Step>

        <Step no={2} title="근로계약서 작성·서명">
          <p>가입이 끝나면 바로 근로계약서 화면으로 넘어갑니다.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li><b>주소</b>를 입력하고 계약 시작일을 확인합니다. 주민번호는 가입 때 넣은 번호가 그대로 쓰입니다.</li>
            <li><b>계약서 미리보기</b>를 누르고, 계약서를 <b>끝까지</b> 내려 읽습니다.</li>
            <li>손가락으로 <b>서명</b>하고 동의에 체크한 뒤 완료합니다.</li>
          </ol>
          <Phone shot={SHOTS.contract} caption="근로계약서 작성 화면" />
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            &ldquo;나중에 작성하고 출퇴근 화면으로&rdquo;를 눌러도 되지만, 서명하기 전까지는 출근할 때마다 계약서 작성 안내가 나옵니다.
            가능하면 가입한 날 바로 서명해 주세요.
          </p>
        </Step>

        <Step no={3} title="출근·퇴근 누르기">
          <p>
            다음부터는 기본 브라우저에서 <b>sakun.kr</b> 만 열면 바로 이 화면이 나옵니다.
            출근할 때 <b>출근하기</b>, 일이 끝나면 <b>퇴근하기</b>를 누르세요.
          </p>
          <Phone shot={SHOTS.main} caption="출퇴근 화면" />
          <div className="space-y-3">
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
              <p className="font-semibold text-gray-900">📍 위치 허용</p>
              <p className="mt-1">출퇴근할 때 위치를 확인합니다. 위치 권한을 묻으면 <b>허용</b>을 눌러주세요. 근무지 근처에서만 기록됩니다.</p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
              <p className="font-semibold text-gray-900">⏰ 퇴근 가능 시간</p>
              <p className="mt-1">
                12시 30분 이후, <b>30분 단위(정각·30분)부터 10분 동안</b> 퇴근을 누를 수 있습니다.
                예) 18:00~18:10, 18:30~18:40
              </p>
              <p className="mt-1">12시 30분 이전 퇴근은 관리자에게 문의해 주세요. 화면에 <b>다음 퇴근 가능 시간</b>이 표시됩니다.</p>
            </div>
          </div>
        </Step>

        <Step no={4} title="다음 주 스케줄 제출">
          <p>
            출퇴근 화면 아래 <b>다음 주 스케줄</b>에서 출근 가능한 요일과 주간/야간을 고르고 <b>스케줄 제출하기</b>를 누르세요.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>공휴일은 자동으로 빠집니다.</li>
            <li>제출한 뒤에도 수정할 수 있지만, <b>다음날 스케줄은 전날에 수정할 수 없습니다.</b></li>
          </ul>
          <Phone shot={SHOTS.full} caption="출퇴근 화면 아래쪽 — 스케줄·급여·계약서" />
        </Step>

        <Step no={5} title="급여·계약서 확인">
          <p>출퇴근 화면 맨 아래에 메뉴가 있습니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>근로자 급여조회</b>: 이름과 주민번호(숫자만)를 넣고 조회합니다. 이번 주 급여, 날짜별 급여, 주급 명세서를 볼 수 있습니다.</li>
            <li><b>내 계약서</b>: 서명한 근로계약서를 언제든 다시 받을 수 있습니다.</li>
          </ul>
          <Phone shot={SHOTS.payroll} caption="근로자 급여 조회" />
        </Step>

        <Step no={6} title="홈 화면에 추가해 두기 (추천)">
          <p>기본 브라우저에서 sakun.kr 을 연 상태로 하세요. 다음부터 아이콘 하나로 바로 들어옵니다.</p>
          <div className="space-y-3">
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="font-semibold text-gray-900">안드로이드 (크롬)</p>
              <p className="text-sm">오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="font-semibold text-gray-900">아이폰 (사파리)</p>
              <p className="text-sm">아래 가운데 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
              <p className="mt-1 text-xs text-gray-500">
                아이폰은 홈 화면 아이콘으로 처음 열 때 가입 화면이 나올 수 있습니다. 그때는 관리자에게 재연결 코드를 받아 입력하세요.
              </p>
            </div>
          </div>
        </Step>

        <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">❓ 자주 묻는 질문</h2>
          <div className="mt-4 space-y-3">
            <Faq q="휴대폰을 바꿨어요 / 다른 브라우저로 들어갔더니 가입 화면이 나와요">
              <p>
                관리자에게 <b>재연결 코드</b>를 받으세요. 가입 화면 아래 <b>&ldquo;재연결 코드&rdquo;</b> 칸에 코드만 넣고
                <b> 기기 재연결하기</b>를 누르면 됩니다. 다른 칸은 비워 두셔도 됩니다.
              </p>
              <p className="text-xs text-gray-500">새로 가입하지 마세요. &ldquo;이미 등록된 회원입니다&rdquo;가 나옵니다.</p>
            </Faq>
            <Faq q="'회사 반경 밖입니다' 또는 'GPS 정확도가 낮습니다'가 나와요">
              <p>근무지 안이나 바로 앞에서 다시 눌러주세요. 휴대폰 설정에서 위치(GPS)가 켜져 있는지, 브라우저에 위치 권한을 허용했는지 확인해 주세요.</p>
            </Faq>
            <Faq q="퇴근하기가 안 눌려요">
              <p>퇴근은 정각·30분부터 10분 동안만 됩니다. 화면에 나온 <b>다음 퇴근 가능 시간</b>에 다시 눌러주세요. 일찍 퇴근해야 하면 관리자에게 말해 주세요.</p>
            </Faq>
            <Faq q="출근이나 퇴근을 깜빡했어요">
              <p>직접 고칠 수 없습니다. 관리자에게 날짜와 실제 출퇴근 시간을 알려주세요.</p>
            </Faq>
          </div>
        </section>

        <p className="pb-6 text-center text-xs text-gray-400">sakun.kr 출퇴근 관리</p>
      </div>
    </main>
  );
}
