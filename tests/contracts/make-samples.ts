// 근로계약서 샘플 PDF 생성(1단계 확인용).
// 실행: npx tsx tests/contracts/make-samples.ts <출력폴더>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { renderContractPdf, sha256Hex } from "../../app/lib/contracts/renderPdf";
import { getTemplate } from "../../app/lib/contracts/templates";
import { validateContractInput, type ContractInput } from "../../app/lib/contracts/validation";
import { checkResidentNumber } from "../../app/lib/contracts/residentNumber";

const ROOT = path.resolve(__dirname, "../..");
const outDir = process.argv[2] || path.join(ROOT, "tmp-contract-samples");
fs.mkdirSync(outDir, { recursive: true });

// ── 가짜 서명 PNG (투명 배경 + 손글씨 같은 곡선) ──────────────────
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function fakeSignaturePng() {
  const W = 300, H = 120;
  const px = new Uint8Array(W * H * 4);
  const dot = (x: number, y: number) => {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (X < 0 || Y < 0 || X >= W || Y >= H || dx * dx + dy * dy > 5) continue;
      const i = (Y * W + X) * 4; px[i] = 20; px[i + 1] = 20; px[i + 2] = 60; px[i + 3] = 255;
    }
  };
  for (let t = 0; t < 1; t += 0.0005) {
    const x = 20 + t * 260;
    const y = 60 + Math.sin(t * 18) * 28 * (1 - t * 0.6) + Math.cos(t * 7) * 10;
    dot(x, y);
  }
  for (let t = 0; t < 1; t += 0.001) dot(40 + t * 220, 95 - t * 8);
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const font = fs.readFileSync(path.join(ROOT, "assets/contracts/fonts/NanumGothic-Regular.ttf"));
const seals: Record<string, Buffer> = {
  jangsakun: fs.readFileSync(path.join(ROOT, "assets/contracts/seals/jangsakun.png")),
  hemoz: fs.readFileSync(path.join(ROOT, "assets/contracts/seals/hemoz.png")),
};
const signature = fakeSignaturePng();

// 검증번호가 맞는 가짜 번호
function rrn(first12: string) {
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const s = w.reduce((a, v, i) => a + v * Number(first12[i]), 0);
  return first12 + ((11 - (s % 11)) % 10);
}

type Sample = { file: string; template: string; today: string; input: ContractInput };

const samples: Sample[] = [
  {
    file: "1_장사꾼_1주_샘플.pdf",
    template: "jangsakun_week_v1",
    today: "2026-10-14",
    input: {
      name: "홍길동", residentNumber: rrn("950315123456"), phone: "010-1234-5678",
      address: "전북특별자치도 전주시 덕진구 팔복로 123, 101동 1004호",
      startDate: "2026-10-14", workDays: ["mon", "tue", "wed", "thu", "fri"],
      workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00", note: "포장",
    },
  },
  {
    file: "2_장사꾼_11개월_샘플.pdf",
    template: "jangsakun_11m_v1",
    today: "2026-10-14",
    input: {
      name: "김영희", residentNumber: rrn("880722234567"), phone: "01098765432",
      address: "전북특별자치도 전주시 완산구 효자로 45",
      startDate: "2026-10-14", serviceScopeOther: "검수 및 출고 보조",
    },
  },
  {
    file: "3_장사꾼_1주_연말_다음해로_넘어가는_주.pdf",
    template: "jangsakun_week_v1",
    today: "2026-12-28",
    input: {
      name: "이민수", residentNumber: rrn("000505323456"), phone: "010-5555-6666",
      address: "전북특별자치도 전주시 덕진구 기린대로 1",
      startDate: "2026-12-28", workDays: ["mon", "wed", "fri", "sat"],
      workStart: "13:30", workEnd: "18:00", breakStart: "15:30", breakEnd: "16:00",
    },
  },
  {
    file: "4_장사꾼_11개월_2027년_작성.pdf",
    template: "jangsakun_11m_v1",
    today: "2027-01-04",
    input: {
      name: "박지성", residentNumber: rrn("920101123456"), phone: "010-2222-3333",
      address: "전북특별자치도 전주시 완산구 전주객사3길 22",
      startDate: "2027-01-04",
    },
  },
  {
    file: "5_헤모즈_1주_샘플.pdf",
    template: "hemoz_week_v1",
    today: "2026-10-14",
    input: {
      name: "최수진", residentNumber: rrn("970611234567"), phone: "010-4444-7777",
      address: "전북특별자치도 전주시 완산구 효자로 225, 302동 1201호",
      startDate: "2026-10-14", workDays: ["mon", "tue", "thu", "sat"],
      workStart: "10:00", workEnd: "17:30", breakStart: "12:30", breakEnd: "13:30", note: "포장",
    },
  },
  {
    file: "6_헤모즈_11개월_샘플.pdf",
    template: "hemoz_11m_v2",
    today: "2026-10-14",
    input: {
      name: "정다은", residentNumber: rrn("990203234567"), phone: "01033338888",
      address: "전북특별자치도 전주시 완산구 홍산로 10",
      startDate: "2026-10-14", serviceScopeOther: "검수 및 출고 보조",
    },
  },
];

async function main() {
for (const s of samples) {
  const template = getTemplate(s.template)!;
  const templateBytes = fs.readFileSync(path.join(ROOT, template.file));
  if (sha256Hex(templateBytes) !== template.sha256) throw new Error(`${s.file}: 양식 PDF 지문이 필드맵과 다릅니다`);
  const v = validateContractInput(s.input, {
    kind: template.kind,
    today: s.today,
    minimumWageForYear: (y) => (y <= 2027 ? 10320 : null),
    printedHourlyWage: template.printedHourlyWage,
    employeeHourlyWage: template.printedHourlyWage,
  });
  if (!v.ok) throw new Error(`${s.file}: 검사 실패 ${JSON.stringify(v.errors)}`);

  const pdf = await renderContractPdf({
    template,
    templateBytes,
    fontBytes: font,
    values: {
      name: s.input.name,
      residentNumberDigits: checkResidentNumber(s.input.residentNumber, s.today).digits,
      phoneDigits: s.input.phone.replace(/\D/g, ""),
      address: s.input.address,
      startDate: s.input.startDate,
      endDate: v.derived.endDate!,
      writtenDate: s.today,
      workDays: s.input.workDays,
      workStart: s.input.workStart,
      workEnd: s.input.workEnd,
      breakStart: s.input.breakStart,
      breakEnd: s.input.breakEnd,
      dailyNetMinutes: v.derived.dailyNetMinutes,
      note: s.input.note,
      serviceScopeOther: s.input.serviceScopeOther,
    },
    signaturePng: signature,
    sealPng: seals[template.entityCode],
    signedAt: new Date(`${s.today}T10:00:00+09:00`),
  });

  const out = path.join(outDir, s.file);
  fs.writeFileSync(out, pdf);
  console.log(`${s.file}  기간 ${s.input.startDate} ~ ${v.derived.endDate}  ${(pdf.length / 1024).toFixed(0)}KB  sha256 ${sha256Hex(pdf).slice(0, 16)}…`);
}
}

main().catch((e) => { console.error(e); process.exit(1); });
