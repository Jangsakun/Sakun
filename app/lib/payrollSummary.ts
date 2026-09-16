// 직원별 기간 합산 — 단일 기준.
//
// /api/admin/payroll 은 "주 단위" 급여를 돌려줍니다. 화면에서 조회 기간 전체를
// 직원 1인 1행으로 합치는 계산이 이 파일입니다.
//
// 급여 금액을 여기서 새로 계산하지 않습니다. API 가 준 basePay/weeklyAllowance/
// grossPay/netPay 를 그대로 더하기만 합니다. 과거에 근무시간 계산이 3곳에
// 중복 구현돼 값이 갈렸던 적이 있어서, 합산도 한 곳에만 둡니다.

export type PayrollWeekRow = {
  employeeId: string;
  employeeName: string;
  workplaceName?: string | null;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  hourlyWage: number;
  basePay: number;
  weeklyAllowance: number;
  grossPay: number;
  netPay: number;
};

export type EmployeeLookup = {
  workplace_name?: string | null;
  resident_number?: string;
  resident_number_masked?: string;
  bank_name?: string;
  account_number?: string;
};

export type PayrollEmployeeSummary = {
  employeeId: string;
  employeeName: string;
  workplaceName: string;
  residentNumber: string;
  bankName: string;
  accountNumber: string;
  period: string;
  totalHours: number;
  hourlyWage: number;
  basePay: number;
  weeklyAllowance: number;
  grossPay: number;
  /** 세후 급여 합계. 은행 이체금액도 이 값을 씁니다. */
  netPay: number;
};

/**
 * 주 단위 급여 행들을 직원 1인 1행으로 합칩니다.
 *
 * 기존 "직원별 합산 다운로드" 에 인라인으로 있던 로직을 그대로 옮긴 것입니다.
 * 은행제출용 다건이체 파일도 같은 함수를 써서 금액이 갈리지 않게 합니다.
 */
export function summarizePayrollByEmployee({
  rows,
  getEmployee,
  startDate,
  endDate,
}: {
  rows: PayrollWeekRow[];
  getEmployee: (employeeId: number) => EmployeeLookup | undefined;
  startDate: string;
  endDate: string;
}): PayrollEmployeeSummary[] {
  const grouped = new Map<string, PayrollEmployeeSummary>();

  rows.forEach((row) => {
    const employee = getEmployee(Number(row.employeeId));
    const workplaceName =
      row.workplaceName || employee?.workplace_name || "장사꾼";
    const key = row.employeeId;

    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        workplaceName,
        residentNumber: employee?.resident_number || "-",
        bankName: employee?.bank_name || "-",
        accountNumber: employee?.account_number || "-",
        period: `${startDate} ~ ${endDate}`,
        totalHours: 0,
        hourlyWage: row.hourlyWage,
        basePay: 0,
        weeklyAllowance: 0,
        grossPay: 0,
        netPay: 0,
      });
    }

    const target = grouped.get(key);

    if (!target) return;

    target.totalHours += row.totalHours || 0;
    target.basePay += row.basePay || 0;
    target.weeklyAllowance += row.weeklyAllowance || 0;
    target.grossPay += row.grossPay || 0;
    target.netPay += row.netPay || 0;
  });

  return Array.from(grouped.values());
}
