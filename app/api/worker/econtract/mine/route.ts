import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { todayKst } from "@/app/lib/contracts/worker";

/**
 * 내 계약서 목록(본인 것만). 근로계약서 교부 의무 — 언제든 다시 받을 수 있어야 합니다.
 * 주민번호·서명 이미지 경로는 보내지 않습니다.
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee }) => {
    const { data, error } = await supabase
      .from("employment_contracts")
      .select("id, kind, status, start_date, end_date, signed_at, signed_pdf_sha256, entity:contract_entities(business_name)")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: "계약서 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const today = todayKst();

    return NextResponse.json({
      success: true,
      contracts: (data ?? []).map((c) => ({
        id: c.id,
        kind: c.kind,
        status: c.status,
        startDate: c.start_date,
        endDate: c.end_date,
        signedAt: c.signed_at,
        hasPdf: Boolean(c.signed_pdf_sha256),
        isCurrent: c.status === "signed" && !!c.start_date && !!c.end_date && c.start_date <= today && today <= c.end_date,
        entity: (c.entity as unknown as { business_name: string } | null)?.business_name ?? null,
      })),
    });
  });
}
