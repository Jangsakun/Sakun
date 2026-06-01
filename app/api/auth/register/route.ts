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

  if (
    genderCode === "1" ||
    genderCode === "2" ||
    genderCode === "5" ||
    genderCode === "6"
  ) {
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

function getGenderFromResidentNumber(residentNumber: string) {
  const digits = residentNumber.replace(/[^0-9]/g, "");

  if (digits.length !== 13) {
    return null;
  }

  const genderCode = digits[6];

  if (
    genderCode === "1" ||
    genderCode === "3" ||
    genderCode === "5" ||
    genderCode === "7" ||
    genderCode === "9"
  ) {
    return "남성";
  }

  if (
    genderCode === "2" ||
    genderCode === "4" ||
    genderCode === "6" ||
    genderCode === "8" ||
    genderCode === "0"
  ) {
    return "여성";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      phone,
      residentNumber,
      bankName,
      accountNumber,
      workplaceName,
      employmentType,
      reconnectCode,
      deviceId,
    } = body;

    const trimmedName = String(name || "").trim();
    const trimmedPhone = String(phone || "").trim();
    const trimmedResidentNumber = String(residentNumber || "").trim();
    const trimmedBankName = String(bankName || "").trim();
    const trimmedAccountNumber = String(accountNumber || "").trim();

    const trimmedWorkplaceName = String(
      workplaceName || "장사꾼"
    ).trim();

    const trimmedEmploymentType = String(
      employmentType || "fixed"
    ).trim();

    const trimmedReconnectCode = String(reconnectCode || "")
      .trim()
      .toUpperCase();

    const trimmedDeviceId = String(deviceId || "").trim();

    const phoneDigits = trimmedPhone.replace(/[^0-9]/g, "");
    const residentDigits = trimmedResidentNumber.replace(/[^0-9]/g, "");
    const accountDigits = trimmedAccountNumber.replace(/[^0-9]/g, "");
    const phoneLast4 = phoneDigits.slice(-4);

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
          message:
            "이름, 휴대폰번호, 주민번호, 은행명, 계좌번호를 모두 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!trimmedDeviceId) {
      return NextResponse.json(
        {
          success: false,
          message: "기기 정보가 없습니다. 다시 시도해주세요.",
        },
        { status: 400 }
      );
    }

    if (phoneDigits.length < 4) {
      return NextResponse.json(
        {
          success: false,
          message: "휴대폰번호는 최소 4자리 이상이어야 합니다.",
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
    const gender = getGenderFromResidentNumber(residentDigits);

    if (!birthDate) {
      return NextResponse.json(
        {
          success: false,
          message: "주민번호에서 생년월일을 추출할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    if (!gender) {
      return NextResponse.json(
        {
          success: false,
          message: "주민번호에서 성별을 추출할 수 없습니다.",
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
      .select(
        `
        id,
        name,
        phone,
        resident_number,
        resident_number_masked,
        reconnect_code,
        reconnect_expires_at,
        is_active
        `
      )
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

    const maskedResidentNumber = maskResidentNumber(residentDigits);

    if (existingEmployee) {
      if (existingEmployee.is_active === false) {
        return NextResponse.json(
          {
            success: false,
            message: "비활성화된 직원은 등록할 수 없습니다.",
          },
          { status: 403 }
        );
      }

      if (!trimmedReconnectCode) {
        return NextResponse.json(
          {
            success: false,
            message: "이미 등록된 회원입니다.",
            employee: {
              id: existingEmployee.id,
              name: existingEmployee.name,
              phone: existingEmployee.phone,
              residentNumberMasked:
                existingEmployee.resident_number_masked,
            },
          },
          { status: 409 }
        );
      }

      if (!existingEmployee.reconnect_code) {
        return NextResponse.json(
          {
            success: false,
            message:
              "발급된 재연결 코드가 없습니다. 관리자에게 요청해주세요.",
          },
          { status: 400 }
        );
      }

      if (existingEmployee.reconnect_code !== trimmedReconnectCode) {
        return NextResponse.json(
          {
            success: false,
            message: "재연결 코드가 일치하지 않습니다.",
          },
          { status: 400 }
        );
      }

      if (!existingEmployee.reconnect_expires_at) {
        return NextResponse.json(
          {
            success: false,
            message:
              "재연결 코드 만료시간이 없습니다. 다시 발급해주세요.",
          },
          { status: 400 }
        );
      }

      const expiresAtTime = new Date(
        existingEmployee.reconnect_expires_at
      ).getTime();

      if (Number.isNaN(expiresAtTime) || expiresAtTime < Date.now()) {
        return NextResponse.json(
          {
            success: false,
            message:
              "재연결 코드가 만료되었습니다. 관리자에게 다시 요청해주세요.",
          },
          { status: 400 }
        );
      }

      const { data: updatedEmployee, error: updateError } = await supabase
        .from("employees")
        .update({
          name: trimmedName,
          phone: phoneDigits,
          phone_last4: phoneLast4,
          resident_number: residentDigits,
          resident_number_masked: maskedResidentNumber,
          birth_date: birthDate,
          gender,
          bank_name: trimmedBankName,
          account_number: accountDigits,
          workplace_name: trimmedWorkplaceName,
          employment_type: trimmedEmploymentType,
          reconnect_code: null,
          reconnect_expires_at: null,
        })
        .eq("id", existingEmployee.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            message: "재연결 처리 실패",
            debug: {
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              code: updateError.code,
            },
          },
          { status: 500 }
        );
      }

      const { error: deleteDeviceError } = await supabase
        .from("employee_devices")
        .delete()
        .eq("employee_id", existingEmployee.id);

      if (deleteDeviceError) {
        return NextResponse.json(
          {
            success: false,
            message: "기존 기기 정보 삭제 중 오류가 발생했습니다.",
            debug: {
              message: deleteDeviceError.message,
              details: deleteDeviceError.details,
              hint: deleteDeviceError.hint,
              code: deleteDeviceError.code,
            },
          },
          { status: 500 }
        );
      }

      const { error: insertDeviceError } = await supabase
        .from("employee_devices")
        .insert([
          {
            employee_id: existingEmployee.id,
            device_id: trimmedDeviceId,
          },
        ]);

      if (insertDeviceError) {
        return NextResponse.json(
          {
            success: false,
            message: "새 기기 정보 저장 중 오류가 발생했습니다.",
            debug: {
              message: insertDeviceError.message,
              details: insertDeviceError.details,
              hint: insertDeviceError.hint,
              code: insertDeviceError.code,
            },
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "기기 재연결이 완료되었습니다.",
        employee: {
          id: updatedEmployee.id,
          name: updatedEmployee.name,
          phone: updatedEmployee.phone,
          phoneLast4: updatedEmployee.phone_last4,
          residentNumberMasked:
            updatedEmployee.resident_number_masked,
          birthDate: updatedEmployee.birth_date,
          gender: updatedEmployee.gender,
          bankName: updatedEmployee.bank_name,
          accountNumber: updatedEmployee.account_number,
          workplaceName: updatedEmployee.workplace_name,
          employmentType: updatedEmployee.employment_type,
        },
        reconnected: true,
      });
    }

    if (trimmedReconnectCode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "재연결 대상 직원을 찾을 수 없습니다. 주민번호 또는 직원 정보를 다시 확인해주세요.",
        },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("employees")
      .insert([
        {
          name: trimmedName,
          phone: phoneDigits,
          phone_last4: phoneLast4,
          resident_number: residentDigits,
          resident_number_masked: maskedResidentNumber,
          birth_date: birthDate,
          gender,
          bank_name: trimmedBankName,
          account_number: accountDigits,
          workplace_name: trimmedWorkplaceName,
          employment_type: trimmedEmploymentType,
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

    const { error: deviceInsertError } = await supabase
      .from("employee_devices")
      .insert([
        {
          employee_id: data.id,
          device_id: trimmedDeviceId,
        },
      ]);

    if (deviceInsertError) {
      return NextResponse.json(
        {
          success: false,
          message: "기기 정보 저장 실패",
          debug: {
            message: deviceInsertError.message,
            details: deviceInsertError.details,
            hint: deviceInsertError.hint,
            code: deviceInsertError.code,
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
        phoneLast4: data.phone_last4,
        residentNumberMasked: data.resident_number_masked,
        birthDate: data.birth_date,
        gender: data.gender,
        bankName: data.bank_name,
        accountNumber: data.account_number,
        workplaceName: data.workplace_name,
        employmentType: data.employment_type,
      },
      reconnected: false,
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