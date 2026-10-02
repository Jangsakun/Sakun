import { NextResponse } from "next/server";
import { recordAttendance, resolveRequestedSegment } from "@/app/lib/attendanceServer";
import { toContractType } from "@/app/lib/contractType";
import { createClient } from "@supabase/supabase-js";
import { getDistanceInMeters } from "@/app/lib/geo";

const WORKPLACES = [
  {
    name: "장사꾼",
    lat: 35.85925533483926,
    lng: 127.1046071646124,
  },
  {
    name: "헤모즈",
    lat: 35.8107177466899,
    lng: 127.094791615869,
  },
  {
    name: "깨소금",
    lat: 35.8066759247072,
    lng: 127.121648527169,
  },
  {
    name: "로엔티크",
    lat: 35.8826859288948,
    lng: 127.033338413219,
  },
];

function getNearestWorkplaceDistance(parsedLat: number, parsedLng: number) {
  const distances = WORKPLACES.map((workplace) => {
    const distance = getDistanceInMeters(
      parsedLat,
      parsedLng,
      workplace.lat,
      workplace.lng
    );

    return {
      ...workplace,
      distance,
    };
  });

  return distances.reduce((nearest, current) => {
    return current.distance < nearest.distance ? current : nearest;
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // checkedAt 은 받지 않습니다. 저장 시각은 DB 시각(now())입니다.
    const { name, birthDate, phoneLast4, lat, lng, accuracy } = body;

    if (
      !name ||
      !birthDate ||
      !phoneLast4 ||
      lat === undefined ||
      lng === undefined
    ) {
      return NextResponse.json(
        { success: false, message: "필수값 누락" },
        { status: 400 }
      );
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const parsedAccuracy =
      accuracy === undefined || accuracy === null || accuracy === ""
        ? null
        : Number(accuracy);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return NextResponse.json(
        { success: false, message: "위치값 오류" },
        { status: 400 }
      );
    }

    if (parsedAccuracy !== null && Number.isNaN(parsedAccuracy)) {
      return NextResponse.json(
        { success: false, message: "GPS 정확도 오류" },
        { status: 400 }
      );
    }


    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const nearestWorkplace = getNearestWorkplaceDistance(parsedLat, parsedLng);
    const distance = nearestWorkplace.distance;

    const MAX_DISTANCE = 150;
    const BUFFER_DISTANCE = 200;
    const MAX_ACCURACY = 80;
    const BLOCK_ACCURACY = 120;

    if (parsedAccuracy !== null && parsedAccuracy > BLOCK_ACCURACY) {
      return NextResponse.json(
        {
          success: false,
          message: "GPS 정확도가 낮습니다. 다시 시도해주세요.",
        },
        { status: 400 }
      );
    }

    let ok = false;

    if (distance <= MAX_DISTANCE) {
      ok = true;
    } else if (
      distance <= BUFFER_DISTANCE &&
      parsedAccuracy !== null &&
      parsedAccuracy <= MAX_ACCURACY
    ) {
      ok = true;
    }

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsedAccuracy === null
              ? `회사 반경 밖 (${nearestWorkplace.name} 기준 ${Math.round(
                  distance
                )}m)`
              : `회사 반경 밖 (${nearestWorkplace.name} 기준 ${Math.round(
                  distance
                )}m / 정확도 ${Math.round(parsedAccuracy)}m)`,
        },
        { status: 400 }
      );
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    // 시급 구간 / 도급 구간 중 어느 퇴근인지. 값이 없으면 직원 근로형태의 기본 구간.
    const requested = resolveRequestedSegment(body.segment, employee.contract_type);
    if ("error" in requested) {
      return NextResponse.json(
        { success: false, message: requested.error },
        { status: 400 }
      );
    }
    const segment = requested.segment;

    // 저장 시각·시각 보정·퇴근 가능 시간·하루 흐름 규칙·중복 방지는 DB 함수가 한 번에 처리합니다.
    const saved = await recordAttendance(supabase, {
      employeeId: employee.id,
      recordType: "check_out",
      segment,
      lat: parsedLat,
      lng: parsedLng,
      accuracy: parsedAccuracy,
      distance: Math.round(distance),
    });

    if (!saved.ok) {
      return NextResponse.json(
        { success: false, message: saved.message },
        { status: saved.status }
      );
    }

    const normalizedCheckedAt = saved.checkedAt;

    return NextResponse.json({
      success: true,
      message: `${segment === "piece" && toContractType(employee.contract_type) === "hybrid" ? "도급 " : ""}퇴근 완료 (${nearestWorkplace.name} 기준 ${Math.round(
        distance
      )}m)`,
      distance: Math.round(distance),
      accuracy: parsedAccuracy,
      normalizedCheckedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "퇴근 API 에러",
      },
      { status: 500 }
    );
  }
}