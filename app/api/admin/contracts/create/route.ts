import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ContractType = "weekly" | "freelance_11";

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function addMonthsMinusOneDay(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatKoreanDate(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatDotDate(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function buildWeeklyContractHtml({
  name,
  residentNumber,
  phone,
  address,
  contractStartDate,
  contractEndDate,
}: {
  name: string;
  residentNumber: string;
  phone: string;
  address: string;
  contractStartDate: string;
  contractEndDate: string;
}) {
  const startText = formatKoreanDate(contractStartDate);
  const endText = formatKoreanDate(contractEndDate);

  return `
<div style="font-family: Arial, sans-serif; line-height: 1.75; color: #111; max-width: 900px; margin: 0 auto; font-size: 14px;">
  <h1 style="text-align:center; font-size:28px; letter-spacing:8px; margin-bottom:8px;">근 로 계 약 서</h1>
  <h2 style="text-align:center; font-size:20px; margin-top:0;">일용직 근로계약서</h2>

  <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; margin-top:24px;">
    <tr>
      <th rowspan="3" style="width:100px; text-align:center;">사용자<br/>(갑)</th>
      <td style="width:130px;">사업체명</td>
      <td>㈜장사꾼을위한장사꾼</td>
    </tr>
    <tr>
      <td>대표자</td>
      <td>서수빈</td>
    </tr>
    <tr>
      <td>소 재 지</td>
      <td>전북특별자치도 전주시 덕진구 팔복동4가 238</td>
    </tr>

    <tr>
      <th rowspan="4" style="text-align:center;">근로자<br/>(을)</th>
      <td>성&nbsp;&nbsp;&nbsp;&nbsp;명</td>
      <td>${escapeHtml(name)}</td>
    </tr>
    <tr>
      <td>주민등록번호</td>
      <td>${escapeHtml(residentNumber)}</td>
    </tr>
    <tr>
      <td>연 락 처</td>
      <td>${escapeHtml(phone)}</td>
    </tr>
    <tr>
      <td>주&nbsp;&nbsp;&nbsp;&nbsp;소</td>
      <td>${escapeHtml(address)}</td>
    </tr>
  </table>

  <h3>제1조【계약기간】</h3>
  <p>① 계약기간 : ${escapeHtml(startText)}부터 ~ ${escapeHtml(endText)}까지</p>
  <p>② 제1항에서 근로계약기간을 정한 경우, 그 기간 만료됨과 동시에 근로관계는 당연 종료된다. 이 때 갑은 근로계약을 갱신할 의무가 없다.</p>

  <h3>제2조【근무장소 및 담당업무】</h3>
  <p>① 근무장소 : 사업장 내 &nbsp;&nbsp;&nbsp;&nbsp; ② 담당업무 : 제품 포장 등 관련 제반 업무</p>

  <h3>제3조【근로일·근로시간 및 휴게시간】</h3>
  <p>* 근로일 및 근무시간, 휴게시간 등은 갑의 사정 및 근무여건 등에 따라 변경될 수 있다.</p>

  <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; text-align:center; margin-top:12px;">
    <tr>
      <td></td>
      <td>(&nbsp;&nbsp;)요일</td>
      <td>(&nbsp;&nbsp;)요일</td>
      <td>(&nbsp;&nbsp;)요일</td>
      <td>(&nbsp;&nbsp;)요일</td>
      <td>(&nbsp;&nbsp;)요일</td>
      <td>(&nbsp;&nbsp;)요일</td>
    </tr>
    <tr>
      <td>근로시간</td>
      <td>시간</td>
      <td>시간</td>
      <td>시간</td>
      <td>시간</td>
      <td>시간</td>
      <td>시간</td>
    </tr>
    <tr>
      <td>시업</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
    </tr>
    <tr>
      <td>종업</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;&nbsp;&nbsp;분</td>
    </tr>
    <tr>
      <td>휴게 시간</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
      <td>시&nbsp;&nbsp;분<br/>~ 시&nbsp;&nbsp;분</td>
    </tr>
    <tr>
      <td>특이사항</td>
      <td colspan="6">&nbsp;</td>
    </tr>
  </table>

  <h3>제4조【휴일 등】</h3>
  <p>① 근로기준법 제55조제1항 따른 휴일과 매년 5월 1일(근로자의 날)을 유급휴일로 정한다. 주휴일은 매주 첫 번째 휴무일로 하며, 다만 근무표에 따라 변경될 수 있다.</p>
  <p>② 을이 근로기준법 제18조 제3항의 근로자에 해당하는 경우 동법 제55조를 적용하지 아니한다.</p>

  <h3>제5조【임 금]</h3>
  <p>① 임금 산정기간 및 지급일자 : 매주 월요일부터 금요일까지 근무한 대가를 매 차주의 화요일에 지급한다.</p>
  <p>② 임금지급방법 : 을이 지정하는 예금계좌로 입금한다.</p>
  <p>③ 임금의 구성 : 1시간당 10,320원</p>

  <h3>제6조【연차유급휴가】</h3>
  <p>① 연차유급휴가는 근로기준법 제60조에 따라 부여하되, 5인 미만의 사업장에 해당할 경우 부여하지 아니한다.</p>
  <p>② 을이 근로기준법 제18조 제3항의 근로자에 해당하는 경우 연차유급휴가를 부여하지 아니한다.</p>

  <h3>제7조 [기타]</h3>
  <p>① 본 계약서 명시되지 아니한 사항에 대해서는 근로기준법을 비롯한 노동관계법령에 따른다.</p>
  <p>② 이상 고용주와 근로자는 상기 계약의 내용을 성실히 이행할 것을 약정하고, 본 사실을 증명하기 위하여 계약서 2통을 작성하고 각각 1통씩 보관한다.</p>

  <h3>제8조【개인정보수집 및 이용 동의】</h3>
  <p>을은 갑이 4대보험 취득상실, 임금지급, 인사관리 등을 위해 반드시 필요한 개인정보의 수집 및 이용에 동의한다.</p>

  <br/>

  <p style="text-align:center;">${escapeHtml(startText)}</p>

  <br/>

  <p>【갑】(주)장사꾼을위한장사꾼</p>
  <p style="padding-left:28px;">대&nbsp;&nbsp;&nbsp;표&nbsp;&nbsp; 서 수 빈 &nbsp;&nbsp;&nbsp;&nbsp; (인)</p>

  <br/>

  <p>【을】 ${escapeHtml(name)} &nbsp;&nbsp;&nbsp;&nbsp; (인)</p>
</div>
`;
}

function buildFreelanceContractHtml({
  name,
  residentNumber,
  phone,
  address,
  contractStartDate,
  contractEndDate,
}: {
  name: string;
  residentNumber: string;
  phone: string;
  address: string;
  contractStartDate: string;
  contractEndDate: string;
}) {
  const startText = formatDotDate(contractStartDate);
  const endText = formatDotDate(contractEndDate);

  return `
<div style="font-family: Arial, sans-serif; line-height: 1.75; color: #111; max-width: 900px; margin: 0 auto; font-size: 14px;">
  <h2 style="text-align:center; font-size:20px; margin-bottom:0;">프리랜스</h2>
  <h1 style="text-align:center; font-size:28px; margin-top:4px;">용역계약서</h1>

  <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; margin-top:24px;">
    <tr>
      <th rowspan="3" style="width:100px; text-align:center;">갑</th>
      <td style="width:130px;">사업체명</td>
      <td>㈜장사꾼을위한장사꾼</td>
    </tr>
    <tr>
      <td>대표자</td>
      <td>서수빈</td>
    </tr>
    <tr>
      <td>소 재 지</td>
      <td>전북특별자치도 전주시 덕진구 팔복동4가 238</td>
    </tr>

    <tr>
      <th rowspan="4" style="text-align:center;">을</th>
      <td>성&nbsp;&nbsp;&nbsp;&nbsp;명</td>
      <td>${escapeHtml(name)}</td>
    </tr>
    <tr>
      <td>주민등록번호</td>
      <td>${escapeHtml(residentNumber)}</td>
    </tr>
    <tr>
      <td>연 락 처</td>
      <td>${escapeHtml(phone)}</td>
    </tr>
    <tr>
      <td>주&nbsp;&nbsp;&nbsp;&nbsp;소</td>
      <td>${escapeHtml(address)}</td>
    </tr>
  </table>

  <p>㈜장사꾼을위한장사꾼(이하“갑”이라 함)과 ${escapeHtml(name)} (이하“을”이라 함)은/는 다음과 같이 용역계약을 체결한다.</p>

  <h3>제1조【계약의 목적】</h3>
  <p>본 계약은 을이 갑의 사업목적 달성을 위한 갑과 을의 권리와 의무를 정하기 위한 것을 목적으로 한다.</p>

  <h3>제2조【계약의 기간】</h3>
  <p>①본 계약의 기간은 11개월(${escapeHtml(startText)} ~ ${escapeHtml(endText)})로 한다.</p>
  <p>②용역 업무의 수행이 불가능하게 되거나(예 : 물량 부족 등) 기타 불가피한 외부 사정이 발생한 경우, 갑과 을은 합의에 따라 계약기간 중 종료할 수 있다.</p>

  <h3>제3조【용역의 범위】</h3>
  <p>상호 합의 하에 정한 을의 용역 범위는 다음과 같다.</p>
  <p>1. 제품 조립 및 포장</p>
  <p>2. 기타 ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</p>

  <h3>제4조【용역 제공의 방식】</h3>
  <p>①을은 갑으로부터 이 계약 목적 달성을 위한 용역의 진행 상황을 대면, 전화, e-mail, 문자 등의 방법으로 보고할 것을 요청할 수 있다.</p>
  <p>②갑은 을이 제3조에서 정한 업무를 수행하는 데 필요한 장소, 기기 등을 무상으로 제공한다.</p>
  <p>③을은 이 계약의 목적 달성을 위한 장소에서 서비스를 제공하도록 한다.</p>
  <p>④출퇴근 시간, 업무수행시간, 업무수행방법 등은 을이 자율로 결정하며, 갑은 이를 지휘·감독 또는 관리하지 않는다.</p>

  <h3>제5조【용역금액】</h3>
  <p>①갑은 을에게 1시간당 10,320원의 용역대금을 지급하기로 한다.</p>
  <p>②보수는 주단위로 정산하기로 하고, 매주 월요일부터 일요일까지의 기간 동안 제1항에 따라 산정된 금액을 차주 화요일에 을이 지정하는 계좌에 입금한다. 이 때 갑에게 원천징수의무가 있는 사업소득세 및 지방세(보수액의 3.3%) 등 비용을 공제하고 지급한다.</p>

  <h3>제6조【계약 관계 및 을의 법적 지위에 대한 확인】</h3>
  <p>①갑과 을은 자유직업소득자와 사업자 간 신분으로 상호 합의하여 민법상 도급 또는 이와 유사한 성격의 계약을 체결했음을 확인한다.</p>
  <p>②을은 본인의 법적 지위가 용역을 수행하기로 한 자유직업소득자 신분임을 인정하며, 그 법적 지위에 대한 일체의 이의 제기(근로기준법상 근로자임에 해당함을 전제로 한 권리 주장을 하는 등)를 하지 않을 것을 확약한다.</p>
  <p>③을이 이러한 합의를 위반하여 근로자임을 주장하는 경우, 을이 받는 보수에는 최저임금(10,320원)을 제외한 주휴수당 금액(*해당자에 한함)이 포함되어 있음을 확약한다.</p>
  <p>[확인 및 동의자 성명 ${escapeHtml(name)} &nbsp;&nbsp;&nbsp;&nbsp; (서명)】</p>

  <h3>제7조【당사자의 성실의무】</h3>
  <p>①을은 갑의 사업목적 달성을 위하여 제2조의 계약기간 내에 성실히 수행하며 완수하여야 한다.</p>
  <p>②을은 갑 외 제3자와 계약을 체결하거나 기타 개인사정으로 인하여 법적책임이 발생하는 경우, 모든 법적책임은 을이 부담한다.</p>
  <p>③을은 본 작업과 관련된 어떠한 일체의 정보를 외부에 누설하거나 유출해서는 아니 되며, 이로 인하여 발생하는 모든 책임은 을이 부담한다.</p>

  <h3>제8조【계약변경】</h3>
  <p>본 계약의 내용에 대하여 변경 및 수정이 필요한 경우, 당사자는 합의하여 계약 내용을 변경할 수 있고, 그 경우 변경 및 수정 내용을 반영하여 계약서를 다시 작성한다.</p>

  <h3>제9조【손해배상책임】</h3>
  <p>①을의 귀책사유로 인한 본 계약의 위반, 계약해제 및 불법행위 등의 사유로 갑에게 손해를 입힌 경우 을은 갑에게 손해를 배상하여야 한다.</p>
  <p>②갑의 귀책사유로 인한 본 계약의 위반, 계약해제 및 불법행위 등의 사유로 을에게 손해를 입힌 경우 갑은 을에게 손해를 배상하여야 한다.</p>
  <p>③을은 마케팅 및 제품 판매 과정에서 발생한 사고에 대해서는 사고 1건에 1만원의 손해배상액을 부담한다.</p>

  <h3>제10조【계약의 해지】</h3>
  <p>갑과 을은 다음 각 호에 해당할 경우 본 계약을 해지할 수 있다.</p>
  <p>①을이 불성실한 태도로 갑의 사업장 운영에 지장을 초래한 경우</p>
  <p>②을이 고의로 갑의 사업에 손해를 끼치는 행위를 한 경우</p>
  <p>③갑이 월 보수의 정산을 2개월 이상 연체한 경우</p>
  <p>④을이 갑의 내부정보를 외부에 유출하거나 이를 이용한 행위를 하여 갑에게 손해를 끼친 경우</p>

  <h3>제11조【비밀준수의무】</h3>
  <p>①을은 계약기간 동안 본인이 직접 또는 간접적으로 관련되어 지득한 갑의 영업비밀 보호를 위하여 신의성실의 원칙에 입각하여 최선을 다하여야 하며, 계약기간 후에라도 갑의 영업비밀을 회사의 사전 허가 없이 사용, 복제, 누설해서는 아니 된다.</p>
  <p>②을이 고의 또는 과실로 전항을 위반하여 갑에게 손해를 입힌 경우, 관련 법령에 따라 이를 배상하여야 한다.</p>

  <h3>제12조【관할 법원】</h3>
  <p>본 계약과 관련된 소송의 관할법원은 사업장의 소재지를 관할하는 법원으로 한다.</p>

  <p>당사자 간 이의 없이 위와 같이 계약이 체결되었음을 증명하기 위하여 계약서 2부를 작성하거나 1부를 작성한 후 사본하여 갑과 을이 각 1부씩 보관한다.</p>

  <br/>

  <p style="text-align:center;">${escapeHtml(startText)}</p>

  <br/>

  <p>【갑】㈜장사꾼을위한장사꾼</p>
  <p style="padding-left:28px;">대&nbsp;&nbsp;&nbsp;표&nbsp;&nbsp; 서 수 빈 &nbsp;&nbsp;&nbsp;&nbsp; (인)</p>

  <br/>

  <p>【을】 ${escapeHtml(name)} &nbsp;&nbsp;&nbsp;&nbsp; (인)</p>
</div>
`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { employeeId, contractType, contractStartDate } = body;

    const parsedEmployeeId = Number(employeeId);

    if (!parsedEmployeeId || Number.isNaN(parsedEmployeeId)) {
      return NextResponse.json(
        { success: false, message: "employeeId 오류" },
        { status: 400 }
      );
    }

    if (!contractStartDate) {
      return NextResponse.json(
        { success: false, message: "시작일 필요" },
        { status: 400 }
      );
    }

    const type: ContractType =
      contractType === "freelance_11" ? "freelance_11" : "weekly";

    const contractEndDate =
      type === "weekly"
        ? addDays(contractStartDate, 6)
        : addMonthsMinusOneDay(contractStartDate, 11);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Supabase 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, name, resident_number, phone, address")
      .eq("id", parsedEmployeeId)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    const commonData = {
      name: employee.name || "",
      residentNumber: employee.resident_number || "",
      phone: employee.phone || "",
      address: employee.address || "",
      contractStartDate,
      contractEndDate,
    };

    const contentHtml =
      type === "weekly"
        ? buildWeeklyContractHtml(commonData)
        : buildFreelanceContractHtml(commonData);

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        employee_id: parsedEmployeeId,
        contract_type: type,
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
        content_html: contentHtml,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    await supabase
      .from("employees")
      .update({
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
      })
      .eq("id", parsedEmployeeId);

    return NextResponse.json({
      success: true,
      contract: data,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}