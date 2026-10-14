import type { ContractKind } from "./period";
import type { WorkDay } from "./validation";

// 근로계약서 양식과 칸 위치(필드맵).
//
// ▸ 원본 양식 문구는 바꾸지 않습니다. 원본 PDF 를 그대로 배경으로 쓰고 입력값만 얹습니다.
// ▸ 좌표는 PDF 좌표계(pt, 왼쪽 아래가 0)이고 y 는 글자의 기준선입니다.
//   원본 PDF 의 인쇄된 글자("성 명", "시", "분", "(인)" …) 위치를 뽑아서 정했습니다(2026-10-14).
// ▸ 좌표를 코드 여기저기에 흩어두지 않습니다. 칸 위치를 고칠 때는 이 파일만 고칩니다.
//   좌표를 바꾸면 fieldMapVersion 을 올리고, 이미 서명된 계약서는 그때의 버전으로 남습니다.

export type TextField = {
  page: number;
  x: number;
  y: number;
  size?: number;
  /** left: x 부터 씀 / right: x 에서 끝남 / center: x 가 가운데 */
  align?: "left" | "right" | "center";
  /** 넘치면 글자를 줄입니다 */
  maxWidth?: number;
};

/** 인쇄된 연도("2026"). 실제 연도와 다를 때만 흰색으로 덮고 실제 연도를 씁니다. */
export type PrintedYearField = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  printed: number;
};

export type ImageField = {
  page: number;
  /** 가운데 위치 */
  cx: number;
  cy: number;
  width: number;
  height: number;
};

type WeekColumn = {
  /** "○시간" 칸: 숫자가 끝나는 위치 */
  hoursRight: number;
  /** "○시 ○분" 칸: 시 숫자 / 분 숫자가 끝나는 위치 */
  hourRight: number;
  minuteRight: number;
  breakHourRight: number;
  /** 휴게 끝 줄 "~ ○시": 인쇄된 "~" 가 끝나는 위치. 시 숫자가 이보다 왼쪽으로 가면 겹칩니다. */
  breakEndHourLeft: number;
  center: number;
  noteLeft: number;
};

export type WeekTable = {
  page: number;
  size: number;
  rows: {
    netHours: number;
    start: number;
    end: number;
    breakStart: number;
    breakEnd: number;
    note: number;
  };
  columns: Record<WorkDay, WeekColumn>;
};

export type ContractTemplate = {
  /** contract_templates.code 와 같은 값 */
  code: string;
  entityCode: string;
  kind: ContractKind;
  title: string;
  /** 저장소 기준 경로 */
  file: string;
  /** 원본 PDF 지문. 파일이 바뀌면 계약서 생성을 거부합니다. */
  sha256: string;
  fieldMapVersion: number;
  printedHourlyWage: number;
  text: Record<string, TextField>;
  printedYears: Record<string, PrintedYearField>;
  images: {
    signatures: ImageField[];
    seal: ImageField;
  };
  weekTable?: WeekTable;
};

// 1주 양식 요일 칸. 원본 PDF 의 "시", "분", "시간" 글자 x 좌표에서 1.5pt 앞.
const WEEK_HEADER_CENTER = [151.5, 220.5, 289.5, 358.4, 427.4, 496.4];
const WEEK_HOURS_UNIT_X = [163.6, 232.6, 301.4, 370.4, 439.4, 508.2]; // "시간"
const WEEK_HOUR_UNIT_X = [144.1, 213.1, 282.1, 351.1, 420.0, 488.9]; // 시업·종업 "시"
const WEEK_MINUTE_UNIT_X = [173.2, 242.2, 311.2, 380.0, 449.0, 517.9]; // "분"
const WEEK_BREAK_HOUR_UNIT_X = [149.0, 218.0, 286.9, 355.9, 424.9, 493.7]; // 휴게 "시"
const WEEK_BREAK_TILDE_END_X = [139.6, 208.6, 277.6, 346.5, 415.5, 484.3]; // 휴게 끝 줄 "~" 끝
const DAYS: WorkDay[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

const weekColumns = Object.fromEntries(
  DAYS.map((day, i) => [
    day,
    {
      hoursRight: WEEK_HOURS_UNIT_X[i] - 1.5,
      hourRight: WEEK_HOUR_UNIT_X[i] - 1.5,
      minuteRight: WEEK_MINUTE_UNIT_X[i] - 1.5,
      breakHourRight: WEEK_BREAK_HOUR_UNIT_X[i] - 1.5,
      breakEndHourLeft: WEEK_BREAK_TILDE_END_X[i] + 0.6,
      center: WEEK_HEADER_CENTER[i],
      noteLeft: WEEK_HEADER_CENTER[i] - 32,
    },
  ])
) as Record<WorkDay, WeekColumn>;

export const CONTRACT_TEMPLATES: Record<string, ContractTemplate> = {
  jangsakun_week_v1: {
    code: "jangsakun_week_v1",
    entityCode: "jangsakun",
    kind: "week",
    title: "장사꾼 일용직 근로계약서(1주)",
    file: "assets/contracts/templates/jangsakun_week_v1.pdf",
    sha256: "f9e98f11efe46b57278f9037757ec951de94e924f96a78cc9911323a70c92274",
    fieldMapVersion: 1,
    printedHourlyWage: 10320,
    text: {
      name: { page: 0, x: 206, y: 695.6, size: 10, maxWidth: 148 },
      residentNumber: { page: 0, x: 436, y: 695.6, size: 10, maxWidth: 100 },
      phone: { page: 0, x: 206, y: 678.9, size: 10, maxWidth: 330 },
      address: { page: 0, x: 206, y: 662.2, size: 10, maxWidth: 330 },
      // 제1조 ① 계약기간 : 2026년 [월] [일]부터 ~ 2026년 [월] [일]까지
      // 값은 인쇄된 "년"·"월"·"일" 글자 사이 빈칸의 가운데에 둡니다.
      startMonth: { page: 0, x: 163.0, y: 605.6, size: 10, align: "center", maxWidth: 15 },
      startDay: { page: 0, x: 186.8, y: 605.6, size: 9.5, align: "center", maxWidth: 11.5 },
      endMonth: { page: 0, x: 270.9, y: 605.6, size: 10, align: "center", maxWidth: 15 },
      endDay: { page: 0, x: 294.7, y: 605.6, size: 9.5, align: "center", maxWidth: 11.5 },
      // 작성일 2026년 [월] [일]
      writtenMonth: { page: 0, x: 289.5, y: 128.1, size: 10.5, align: "center", maxWidth: 22 },
      writtenDay: { page: 0, x: 325.8, y: 128.1, size: 10.5, align: "center", maxWidth: 27 },
      // 【을】 [성명] (인)
      signerName: { page: 0, x: 372, y: 90.0, size: 11, maxWidth: 110 },
    },
    printedYears: {
      startYear: { page: 0, x: 125.2, y: 605.6, width: 20.5, height: 9.5, printed: 2026 },
      endYear: { page: 0, x: 233.0, y: 605.6, width: 20.5, height: 9.5, printed: 2026 },
      writtenYear: { page: 0, x: 244.9, y: 128.1, width: 22.8, height: 10.6, printed: 2026 },
    },
    images: {
      signatures: [{ page: 0, cx: 497.5, cy: 94.0, width: 70, height: 32 }],
      // 직인 PNG(248x183)는 바깥 여백이 커서 상자를 키워야 원이 약 46pt 로 찍힙니다.
      seal: { page: 0, cx: 256.5, cy: 84.5, width: 98, height: 72 },
    },
    weekTable: {
      page: 0,
      size: 9,
      rows: { netHours: 494.0, start: 476.1, end: 458.1, breakStart: 441.0, breakEnd: 427.4, note: 411.8 },
      columns: weekColumns,
    },
  },

  jangsakun_11m_v1: {
    code: "jangsakun_11m_v1",
    entityCode: "jangsakun",
    kind: "month11",
    title: "장사꾼 근로계약서(11개월)",
    file: "assets/contracts/templates/jangsakun_11m_v1.pdf",
    sha256: "66ba744c8cadf23401147d46f7bd3dbb7d2131bc87ce196c4d0a8bbc1991a897",
    fieldMapVersion: 1,
    printedHourlyWage: 10320,
    text: {
      name: { page: 0, x: 206, y: 713.2, size: 10, maxWidth: 148 },
      residentNumber: { page: 0, x: 436, y: 713.2, size: 10, maxWidth: 100 },
      phone: { page: 0, x: 206, y: 696.5, size: 10, maxWidth: 330 },
      address: { page: 0, x: 206, y: 679.8, size: 10, maxWidth: 330 },
      // "㈜장사꾼을위한장사꾼(이하 갑)과 [성명](이하 을)은/는 …"
      introName: { page: 0, x: 302, y: 658.2, size: 10, align: "center", maxWidth: 62 },
      // 제2조 ① 11개월( [년] . [월] . [일] . ~ [년] . [월] . [일] .)
      startYear: { page: 0, x: 225.0, y: 535.4, size: 10, align: "right" },
      startMonth: { page: 0, x: 255.5, y: 535.4, size: 10, align: "right" },
      startDay: { page: 0, x: 280.5, y: 535.4, size: 10, align: "right" },
      endYear: { page: 0, x: 327.5, y: 535.4, size: 10, align: "right" },
      endMonth: { page: 0, x: 357.5, y: 535.4, size: 10, align: "right" },
      endDay: { page: 0, x: 382.5, y: 535.4, size: 10, align: "right" },
      // 제3조 2. 기타 (   )
      serviceScopeOther: { page: 0, x: 112, y: 431.4, size: 9.5, maxWidth: 150 },
      // [확인 및 동의자 성명 [성명] (서명)]
      consentName: { page: 0, x: 432, y: 59.6, size: 10, maxWidth: 72 },
      // 2쪽 작성일 2026 . [월] . [일] .
      writtenMonth: { page: 1, x: 309.5, y: 165.2, size: 11, align: "right" },
      writtenDay: { page: 1, x: 339.5, y: 165.2, size: 11, align: "right" },
      // 2쪽 【을】 [성명] (인)
      signerName: { page: 1, x: 372, y: 124.5, size: 11, maxWidth: 110 },
    },
    printedYears: {
      writtenYear: { page: 1, x: 250.6, y: 165.2, width: 25.6, height: 11, printed: 2026 },
    },
    images: {
      signatures: [
        { page: 0, cx: 518.5, cy: 63.0, width: 52, height: 26 }, // 1쪽 (서명)
        { page: 1, cx: 497.5, cy: 128.5, width: 70, height: 32 }, // 2쪽 【을】 (인)
      ],
      seal: { page: 1, cx: 256.5, cy: 119.0, width: 98, height: 72 },
    },
  },
};

export function getTemplate(code: string): ContractTemplate | null {
  return CONTRACT_TEMPLATES[code] ?? null;
}
