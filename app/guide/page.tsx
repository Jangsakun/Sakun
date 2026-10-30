import type { Metadata } from "next";
import Image from "next/image";

// 근로자용 출퇴근 사용 안내 (2026-10-30). 화면 사진은 로컬에서 예시 계정으로 찍은 것(public/guide).
export const metadata: Metadata = {
  title: "출퇴근 사용 안내",
  description: "당근 단기 근무자를 위한 sakun.kr 가입·출퇴근 안내",
};

type Shot = { src: string; w: number; h: number; alt: string; crop?: boolean };

function Phone({ shot, caption }: { shot: Shot; caption?: string }) {
  return (
    <figure className="mx-auto w-full max-w-[250px]">
      <div className="overflow-hidden rounded-[28px] border-[6px] border-gray-900 bg-gray-900 shadow-lg">
        <div className={shot.crop ? "relative aspect-[780/1000] overflow-hidden bg-[#f5f5f7]" : ""}>
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.w}
            height={shot.h}
            sizes="250px"
            className={shot.crop ? "absolute inset-0 h-full w-full object-cover object-center" : "block h-auto w-full"}
          />
        </div>
      </div>
      {caption && <figcaption className="mt-2 text-center text-xs text-gray-500">{caption}</figcaption>}
    </figure>
  );
}

function Step({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-base font-bold text-white">
          {no}
        </span>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

const SHOTS = {
  filled: { src: "/guide/02-signup-filled.png", w: 780, h: 2680, alt: "당근 단기 근무 가입 화면에 정보를 입력한 모습" },
  done: { src: "/guide/03-signup-done.png", w: 780, h: 1688, alt: "등록 완료 후 출퇴근 화면 열기 버튼", crop: true },
  link: { src: "/guide/04-link-done.png", w: 780, h: 1688, alt: "출퇴근 화면 연결 완료", crop: true },
  main: { src: "/guide/05-main.png", w: 780, h: 1688, alt: "출퇴근 화면의 출근하기 버튼" },
  reconnect: { src: "/guide/07-reconnect-done.png", w: 780, h: 1688, alt: "같은 정보로 다시 입력해 연결 완료", crop: true },
} satisfies Record<string, Shot>;

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 text-black [color-scheme:light]">
      <div className="mx-auto w-full max-w-[480px] space-y-5">
        <header className="px-1">
          <p className="text-sm font-semibold text-orange-500">당근 단기 근무자 안내</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">출퇴근 사용 방법</h1>
          <p className="mt-2 text-sm text-gray-500">화면 속 이름·번호는 예시입니다.</p>
        </header>

        <section className="rounded-3xl bg-gray-900 px-5 py-5 text-white">
          <p className="text-base font-bold">꼭 기억해 주세요</p>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
            <li>✅ 출퇴근은 휴대폰 <b className="text-orange-300">기본 브라우저</b>에서 합니다.
              <br />
              <span className="text-sm text-gray-300">안드로이드는 크롬(또는 삼성 인터넷), 아이폰은 사파리</span>
            </li>
            <li>🚫 카카오톡·네이버·당근 앱 <b>안에서</b> 열린 화면으로는 출퇴근하지 마세요.</li>
            <li>👉 한 번 연결되면, 다음부터는 기본 브라우저에서 <b className="text-orange-300">sakun.kr</b> 만 들어가면 됩니다.</li>
          </ul>
        </section>

        <Step no={1} title="당근 공고의 링크로 가입하기">
          <p>
            공고에 있는 가입 링크를 누르면 <b>&ldquo;당근 단기 근무 가입&rdquo;</b> 화면이 나옵니다.
            이름, 휴대폰번호, 주민번호, 은행, 계좌번호를 넣고 근무지를 고른 뒤 동의에 체크하고 <b>등록하기</b>를 누르세요.
          </p>
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            위에 노란 상자가 보이면 앱 안의 화면이라는 뜻입니다. <b>기본 브라우저로 열기</b>를 눌러 옮겨서 가입하거나,
            그대로 가입해도 됩니다. 가입이 끝나면 기본 브라우저로 연결해 드립니다.
          </p>
          <Phone shot={SHOTS.filled} caption="가입 화면 (정보 입력 후)" />
        </Step>

        <Step no={2} title="출퇴근 화면 열기">
          <p>
            등록이 끝나면 기본 브라우저가 자동으로 열립니다. 열리지 않으면 <b>출퇴근 화면 열기</b> 버튼을 눌러주세요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Phone shot={SHOTS.done} caption="① 버튼 누르기" />
            <Phone shot={SHOTS.link} caption="② 자동 연결" />
          </div>
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            버튼을 눌러도 안 열리면 화면 구석의 <b>⋯</b> 메뉴에서 <b>&ldquo;다른 브라우저로 열기&rdquo;</b>를 누르세요.
            이 버튼은 <b>10분 안에 한 번</b>만 쓸 수 있습니다. 시간이 지났다면 아래 &ldquo;이미 등록된 회원&rdquo; 방법으로 연결하세요.
          </p>
        </Step>

        <Step no={3} title="출근·퇴근 누르기">
          <p>
            연결되면 바로 출퇴근 화면이 나옵니다. 출근할 때 <b>출근하기</b>, 일이 끝나면 <b>퇴근하기</b>를 누르세요.
            다른 정보를 다시 넣을 필요는 없습니다.
          </p>
          <Phone shot={SHOTS.main} caption="출퇴근 화면" />
        </Step>

        <Step no={4} title="홈 화면에 추가해 두기 (추천)">
          <p>다음부터 아이콘 하나로 바로 들어올 수 있습니다. <b>기본 브라우저에서 sakun.kr 을 연 상태</b>에서 하세요.</p>
          <div className="space-y-3">
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="font-semibold text-gray-900">안드로이드 (크롬)</p>
              <p className="text-sm">오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="font-semibold text-gray-900">아이폰 (사파리)</p>
              <p className="text-sm">아래 가운데 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → <b>추가</b></p>
              <p className="mt-1 text-xs text-gray-500">
                아이폰은 홈 화면 아이콘으로 처음 열 때 가입 화면이 한 번 더 나올 수 있습니다. 아래 방법대로 같은 정보를 넣으면 바로 연결됩니다.
              </p>
            </div>
          </div>
        </Step>

        <section className="rounded-3xl bg-white px-5 py-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">❓ &ldquo;이미 등록된 회원입니다&rdquo;가 나와요</h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">
            <p>
              다른 브라우저에서 가입했을 때 생깁니다. <b>재연결 코드는 필요 없습니다.</b>
              가입 화면에 처음 가입할 때와 <b>똑같은 이름·휴대폰번호·주민번호</b>를 넣고(은행·계좌도 입력)
              <b> 등록하기</b>를 누르면 바로 연결됩니다.
            </p>
            <Phone shot={SHOTS.reconnect} caption="같은 정보로 다시 입력 → 연결 완료" />
            <p className="text-sm text-gray-500">
              그래도 안 되면 관리자에게 이름과 근무지를 알려주세요.
            </p>
          </div>
        </section>

        <p className="pb-6 text-center text-xs text-gray-400">sakun.kr 출퇴근 관리</p>
      </div>
    </main>
  );
}
