import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { contractRequirement } from "@/app/lib/contracts/worker";

/**
 * 서명할 계약서가 있는지.
 * POST { name, birthDate, phoneLast4, onCheckIn? }
 *   onCheckIn: 출근 버튼을 눌렀을 때. 당근 근로자의 1주 계약이 끝났으면 새 서명대기를 만듭니다.
 *
 * 출근 자체를 막지는 않습니다(2026-10-14 결정). 앱은 이 값을 보고 계약서 화면을 먼저 보여 줍니다.
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const result = await contractRequirement(supabase, request, employee, { onCheckIn: body.onCheckIn === true });

    return NextResponse.json({ success: true, ...result });
  });
}
