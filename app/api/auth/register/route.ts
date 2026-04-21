import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function maskResidentNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "");

  if (digits.length !== 13) {
    return value;
  }

  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}

function getBirthDateFromResidentNumber(residentNumber: string) {
  const digits = residentNumber.replace(/[^0-9]/g, "");

  if (digits.length !== 13) {
    return null;
  }

  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const genderCode = digits[6];

  let century = "";

  if (genderCode === "1" || genderCode === "2" || genderCode === "5" || genderCode === "6") {
    century = "19";
  } else if (
    genderCode === "3" ||
    genderCode === "4" ||
    genderCode === "7" ||
    genderCode === "8"
  ) {
    century = "20";
  } else if (genderCode === "9" || genderCode === "0") {
    century = "18";
  } else {
    return null;
  }

  const birthDate = `${century}${yy}-${mm}-${dd}`;

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return birthDate;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, residentNumber, bankName, accountNumber } = body;

    const trimmedName = String(name || "").trim();
    const trimmedPhone = String(phone || "").trim();
    const trimmedResidentNumber = String(residentNumber || "").trim();
    const trimmedBankName = String(bankName || "").trim();
    const trimmedAccountNumber = String(accountNumber || "").trim();

    const phoneDigits = trimmedPhone.replace(/[^0-9]/g, "");
    const residentDigits = trimmedResidentNumber.replace(/[^0-9]/g, "");
    const accountDigits = trimmedAccountNumber.replace(/[^0-9]/g, "");

    if (
      !trimmedName ||
      !trimmedPhone ||
      !trimmedResidentNumber ||
      !trimmedBankName ||
      !trimmedAccountNumber
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "이름, 휴대폰번호, 주민번호, 은행명, 계좌번호를 모두 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (residentDigits.length !== 13) {
      return NextResponse.json(
        {
          success: false,
          message: "주민번호는 숫자 기준 13자리여야 합니다.",
        },
        { status: 400 }
      );
    }

    const birthDate = getBirthDateFromResidentNumber(residentDigits);

    if (!birthDate) {
      return NextResponse.json(
        {
          success: false,
          message: "주민번호에서 생년월일을 추출할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
      return NextResponse.json(
        {
          success: false,
          message: "환경변수 없음",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey || anonKey || ""
    );

    const { data: existingEmployee, error: findError } = await supabase
      .from("employees")
      .select("id, name, phone, resident_number, resident_number_masked")
      .eq("resident_number", residentDigits)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        {
          success: false,
          message: "기존 회원 확인 중 오류가 발생했습니다.",
          debug: {
            message: findError.message,
            details: findError.details,
            hint: findError.hint,
            code: findError.code,
          },
        },
        { status: 500 }
      );
    }

    if (existingEmployee) {
      return NextResponse.json(
        {
          success: false,
          message: "이미 등록된 회원입니다.",
          employee: {
            id: existingEmployee.id,
            name: existingEmployee.name,
            phone: existingEmployee.phone,
            residentNumberMasked: existingEmployee.resident_number_masked,
          },
        },
        { status: 409 }
      );
    }

    const maskedResidentNumber = maskResidentNumber(residentDigits);

    const { data, error } = await supabase
      .from("employees")
      .insert([
        {
          name: trimmedName,
          phone: phoneDigits,
          resident_number: residentDigits,
          resident_number_masked: maskedResidentNumber,
          birth_date: birthDate,
          bank_name: trimmedBankName,
          account_number: accountDigits,
          hourly_wage: 10320,
          weekly_allowance_status: "비대상",
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: "회원 등록 실패",
          debug: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "등록 성공",
      employee: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        residentNumberMasked: data.resident_number_masked,
        birthDate: data.birth_date,
        bankName: data.bank_name,
        accountNumber: data.account_number,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "route 전체 에러",
        debug: {
          text: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        },
      },
      { status: 500 }
    );
  }
}