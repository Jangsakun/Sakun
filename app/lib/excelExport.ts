// 관리자 엑셀 다운로드 공통 모듈.
//
// 왜 CSV 가 아니라 xlsx 인가:
// 이전에는 "엑셀 다운로드" 버튼이 실제로는 .csv 를 만들었습니다. CSV 는 값만 있고
// 셀 서식이라는 개념 자체가 없어서, 엑셀이 파일을 열 때 "숫자로 보이는 문자열"을
// 제멋대로 숫자로 바꿉니다. 그 과정에서
//   - 주민번호 0502151234567 → 502151234567  (앞자리 0 소실)
//   - 계좌번호 00123456789012 → 123456789012 (앞자리 00 소실)
// 가 발생했습니다. 실제 데이터 기준 주민번호 20명, 계좌번호 2명이 해당됩니다.
//
// CSV 로는 이 문제를 제대로 막을 수 없습니다(어퍼스트로피나 ="..." 는 엑셀 버전·
// 다른 프로그램에서 깨짐). 그래서 진짜 xlsx 를 만들고 해당 셀에 텍스트 서식(@)을
// 명시적으로 지정합니다.

/**
 * 텍스트로 고정할 셀에 붙입니다.
 *
 *   type: String  → 셀 자체가 문자열 타입(t="s")이라 엑셀이 숫자로 바꾸지 않습니다.
 *   format: "@"   → 셀 서식을 "텍스트"로 지정합니다(numFmtId 가 formatCode="@" 를 가리킴).
 *
 * 둘을 같이 쓰는 이유: 타입만으로도 값은 보존되지만, 서식까지 텍스트여야
 * 사용자가 셀을 편집하거나 다시 저장할 때도 숫자로 바뀌지 않습니다.
 */
export const TEXT_CELL = { type: String, format: "@" } as const;

/** 앞자리 0 이 사라지면 안 되는 컬럼들. 새 컬럼을 추가할 때 여기 판단 기준을 보세요. */
export const LEADING_ZERO_COLUMNS = [
  "주민번호",
  "계좌번호",
  "전화번호",
  "휴대폰번호",
] as const;

export type ExcelCell = {
  value: string | number | null;
  /** true 면 텍스트 서식으로 고정합니다(앞자리 0·하이픈 보존). */
  text?: boolean;
};

export type ExcelColumn = {
  header: string;
  width?: number;
};

/** 문자열 셀(앞자리 0 보존). */
export function textCell(value: unknown): ExcelCell {
  return { value: value === null || value === undefined ? "" : String(value), text: true };
}

/** 일반 셀. 숫자는 숫자로 남겨 엑셀에서 합계를 낼 수 있게 합니다. */
export function cell(value: unknown): ExcelCell {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value };
  }

  return { value: value === null || value === undefined ? "" : String(value) };
}

function toSheetRow(cells: ExcelCell[]) {
  return cells.map((item) => {
    if (item.text) {
      return { value: String(item.value ?? ""), ...TEXT_CELL };
    }

    if (typeof item.value === "number") {
      return { value: item.value, type: Number };
    }

    return { value: String(item.value ?? ""), type: String };
  });
}

/**
 * xlsx 파일을 만들어 브라우저에서 다운로드합니다.
 *
 * write-excel-file 은 클릭 시점에만 불러옵니다(동적 import).
 * 관리자 화면 첫 로딩에 이 라이브러리 용량이 실리지 않게 하기 위함입니다.
 */
export async function downloadXlsx({
  fileName,
  columns,
  rows,
}: {
  fileName: string;
  columns: ExcelColumn[];
  rows: ExcelCell[][];
}) {
  // 이 패키지는 exports 맵에 "." 진입점이 없어 서브경로로 불러와야 합니다.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const headerRow = columns.map((column) => ({
    value: column.header,
    type: String,
    fontWeight: "bold" as const,
  }));

  const sheetData = [headerRow, ...rows.map(toSheetRow)];

  // 브라우저 빌드는 { toBlob, toFile } 을 돌려줍니다. toFile 이 다운로드까지 처리합니다.
  const file = await writeXlsxFile(sheetData as never, {
    columns: columns.map((column) => ({ width: column.width ?? 16 })),
  });

  await file.toFile(fileName);
}

/**
 * 헤더 행 없이 데이터만 있는 xlsx 를 다운로드합니다.
 *
 * 은행 다건이체 양식처럼 1행부터 바로 데이터가 시작해야 하는 경우에 씁니다.
 * downloadXlsx 와 셀 처리 규칙(TEXT_CELL)은 동일합니다.
 */
export async function downloadXlsxNoHeader({
  fileName,
  rows,
  columnWidths,
}: {
  fileName: string;
  rows: ExcelCell[][];
  columnWidths?: number[];
}) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const sheetData = rows.map(toSheetRow);

  const file = await writeXlsxFile(sheetData as never, {
    columns: (columnWidths ?? []).map((width) => ({ width })),
  });

  await file.toFile(fileName);
}
