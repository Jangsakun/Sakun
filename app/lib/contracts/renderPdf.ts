import { createHash } from "crypto";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ContractTemplate, ImageField, TextField } from "./templates";
import { WORK_DAYS, formatNetHours, type WorkDay } from "./validation";
import { formatResidentNumber } from "./residentNumber";

// 서버 전용. 원본 양식 PDF 위에 입력값·서명·직인을 얹어 새 PDF 를 만듭니다.
// 원본 양식의 내용(글자·선)은 건드리지 않습니다. 예외는 인쇄된 연도 하나뿐이며,
// 실제 연도와 다를 때만 그 숫자 위를 흰색으로 덮고 실제 연도를 씁니다(2026-10-14 결정).

export type RenderValues = {
  name: string;
  /** 숫자 13자리(원본). 계약서에는 전체 번호가 들어갑니다. */
  residentNumberDigits: string;
  /** 숫자만 */
  phoneDigits: string;
  address: string;
  startDate: string;
  endDate: string;
  /** 작성일(서명일) */
  writtenDate: string;
  workDays?: WorkDay[];
  workStart?: string;
  workEnd?: string;
  breakStart?: string;
  breakEnd?: string;
  dailyNetMinutes?: number | null;
  note?: string;
  serviceScopeOther?: string;
};

export type RenderInput = {
  template: ContractTemplate;
  templateBytes: Uint8Array;
  fontBytes: Uint8Array;
  values: RenderValues;
  /** 근로자 서명 PNG. 미리보기에서는 없음. */
  signaturePng?: Uint8Array | null;
  sealPng?: Uint8Array | null;
  /** PDF 메타데이터 날짜(서명 시각) */
  signedAt?: Date;
};

const INK = rgb(0, 0, 0);

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatPhone(digits: string) {
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : digits;
}

function drawText(pages: PDFPage[], font: PDFFont, field: TextField | undefined, text: string) {
  if (!field || !text) return;

  const page = pages[field.page];
  let size = field.size ?? 10;

  // 칸보다 길면 글자를 줄입니다(최소 6pt).
  if (field.maxWidth) {
    while (size > 6 && font.widthOfTextAtSize(text, size) > field.maxWidth) size -= 0.25;
  }

  const width = font.widthOfTextAtSize(text, size);
  const x =
    field.align === "right" ? field.x - width : field.align === "center" ? field.x - width / 2 : field.x;

  page.drawText(text, { x, y: field.y, size, font, color: INK });
}

async function drawImage(doc: PDFDocument, pages: PDFPage[], field: ImageField, png: Uint8Array) {
  const image = await doc.embedPng(png);
  const scale = Math.min(field.width / image.width, field.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;

  pages[field.page].drawImage(image, { x: field.cx - w / 2, y: field.cy - h / 2, width: w, height: h });
}

const pad2 = (n: string | number) => String(n).padStart(2, "0");
const parts = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-");
  return { y: Number(y), m: String(Number(m)), d: String(Number(d)) };
};

export async function renderContractPdf(input: RenderInput): Promise<Uint8Array> {
  const { template, values } = input;

  // 원본 양식이 바뀌었으면 칸 위치가 맞지 않으므로 만들지 않습니다.
  const templateHash = sha256Hex(input.templateBytes);

  if (templateHash !== template.sha256) {
    throw new Error(`양식 파일이 등록된 원본과 다릅니다(${template.code}).`);
  }

  const doc = await PDFDocument.load(input.templateBytes);
  doc.registerFontkit(fontkit);

  // ⚠️ subset: false 필수. 나눔고딕을 "쓴 글자만 잘라 넣기"로 넣으면 pdf-lib 의 글꼴 처리
  //    (@pdf-lib/fontkit)가 한글 대부분을 빈칸으로 만듭니다(2026-10-14 실측: 글자 데이터는
  //    들어가지만 화면에는 안 그려짐). 통째로 넣으면 정상이고 PDF 가 약 0.7MB 늘어납니다.
  const font = await doc.embedFont(input.fontBytes, { subset: false });
  const pages = doc.getPages();
  const t = template.text;

  const start = parts(values.startDate);
  const end = parts(values.endDate);
  const written = parts(values.writtenDate);

  drawText(pages, font, t.name, values.name);
  drawText(pages, font, t.residentNumber, formatResidentNumber(values.residentNumberDigits));
  drawText(pages, font, t.phone, formatPhone(values.phoneDigits));
  drawText(pages, font, t.address, values.address);
  drawText(pages, font, t.introName, values.name);
  drawText(pages, font, t.consentName, values.name);
  drawText(pages, font, t.signerName, values.name);

  drawText(pages, font, t.startYear, String(start.y));
  drawText(pages, font, t.startMonth, start.m);
  drawText(pages, font, t.startDay, start.d);
  drawText(pages, font, t.endYear, String(end.y));
  drawText(pages, font, t.endMonth, end.m);
  drawText(pages, font, t.endDay, end.d);
  drawText(pages, font, t.writtenMonth, written.m);
  drawText(pages, font, t.writtenDay, written.d);
  drawText(pages, font, t.serviceScopeOther, values.serviceScopeOther ?? "");

  // 인쇄된 연도: 실제와 같으면 그대로 두고, 다르면 덮어 씁니다.
  const actualYears: Record<string, number> = {
    startYear: start.y,
    endYear: end.y,
    writtenYear: written.y,
  };

  for (const [key, field] of Object.entries(template.printedYears)) {
    const actual = actualYears[key];

    if (!actual || actual === field.printed) continue;

    const page = pages[field.page];
    page.drawRectangle({
      // 아래쪽은 기준선 바로 밑까지만 덮습니다. 더 내리면 인쇄된 밑줄이 지워집니다.
      x: field.x - 0.6,
      y: field.y - 0.8,
      width: field.width + 1.2,
      height: field.height,
      color: rgb(1, 1, 1),
    });

    const size = field.height;
    const text = String(actual);
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: field.x + (field.width - width) / 2, y: field.y, size, font, color: INK });
  }

  // 1주 양식 근무표: 한 번 입력한 시간을 체크한 요일 칸에 똑같이 채웁니다.
  if (template.weekTable) {
    const table = template.weekTable;
    const page = pages[table.page];
    const chosen = new Set(values.workDays ?? []);
    const [sh, sm] = String(values.workStart ?? "").split(":");
    const [eh, em] = String(values.workEnd ?? "").split(":");
    const [bsh, bsm] = String(values.breakStart ?? "").split(":");
    const [beh, bem] = String(values.breakEnd ?? "").split(":");
    const hasBreak = Boolean(values.breakStart && values.breakEnd);
    const netText =
      values.dailyNetMinutes !== null && values.dailyNetMinutes !== undefined
        ? formatNetHours(values.dailyNetMinutes)
        : "";

    const put = (text: string, right: number, y: number) => {
      const w = font.widthOfTextAtSize(text, table.size);
      page.drawText(text, { x: right - w, y, size: table.size, font, color: INK });
    };

    for (const day of WORK_DAYS) {
      const col = table.columns[day];

      if (!chosen.has(day)) {
        // "○시간" 칸에 "휴무"를 쓰면 인쇄된 "시간"과 붙어 "휴무 시간"으로 읽힙니다.
        // 근로시간은 "-", 특이사항 칸에 "휴무"를 씁니다.
        put("-", col.hoursRight, table.rows.netHours);
        page.drawText("휴무", { x: col.noteLeft, y: table.rows.note, size: 7, font, color: INK });
        continue;
      }

      put(netText, col.hoursRight, table.rows.netHours);
      put(String(Number(sh)), col.hourRight, table.rows.start);
      put(pad2(Number(sm)), col.minuteRight, table.rows.start);
      put(String(Number(eh)), col.hourRight, table.rows.end);
      put(pad2(Number(em)), col.minuteRight, table.rows.end);

      if (hasBreak) {
        put(String(Number(bsh)), col.breakHourRight, table.rows.breakStart);
        put(pad2(Number(bsm)), col.minuteRight, table.rows.breakStart);
        // 휴게 끝 줄은 인쇄된 "~" 와 "시" 사이 공간이 9pt 남짓이라 두 자리면 글자를 줄여 맞춥니다.
        const endHour = String(Number(beh));
        let endSize = table.size;
        while (endSize > 6 && font.widthOfTextAtSize(endHour, endSize) > col.breakHourRight - col.breakEndHourLeft) endSize -= 0.25;
        const endW = font.widthOfTextAtSize(endHour, endSize);
        page.drawText(endHour, { x: col.breakHourRight - endW, y: table.rows.breakEnd, size: endSize, font, color: INK });
        put(pad2(Number(bem)), col.minuteRight, table.rows.breakEnd);
      }

      if (values.note) {
        let size = 7;
        while (size > 5 && font.widthOfTextAtSize(values.note, size) > 64) size -= 0.25;
        page.drawText(values.note, { x: col.noteLeft, y: table.rows.note, size, font, color: INK });
      }
    }
  }

  if (input.sealPng) await drawImage(doc, pages, template.images.seal, input.sealPng);

  if (input.signaturePng) {
    for (const field of template.images.signatures) {
      await drawImage(doc, pages, field, input.signaturePng);
    }
  }

  const stamp = input.signedAt ?? new Date();
  doc.setTitle(template.title);
  doc.setCreator("attendance-saas");
  doc.setProducer("attendance-saas");
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);

  return doc.save();
}
