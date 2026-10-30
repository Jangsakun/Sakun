import { redirect } from "next/navigation";

// 고정 직원 안내는 전체 안내(/guide/all)로 합쳤습니다(2026-10-30). 예전 주소로 들어와도 열리게 남겨 둡니다.
export default function StaffGuidePage() {
  redirect("/guide/all");
}
