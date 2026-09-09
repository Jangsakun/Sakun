# 근태 SaaS — 미처리 작업 목록

세션이 바뀌어도 남아야 하는 항목만 적는다. 처리하면 이 파일에서 지운다.
최종 갱신: 2026-09-09

---

## ⚠️ 지금 당장 해야 하는 것

### 마이그레이션 실행 대기
`supabase/migrations/20260909100000_attendance_record_audit.sql` 을
Supabase SQL Editor(근태 SaaS 프로젝트 `weaydriyldnfuotzigzh`)에서 실행해야 한다.

실행 전까지는 감사 기록이 남지 않는다. 단 코드는 감사 실패를 비치명적으로 처리하므로
출퇴근 수정/추가/삭제 기능 자체는 정상 동작한다(실측 확인).

---

## 다음 단계 후보

### 1. 시급 스냅샷 UPDATE 감사 (이번 D 작업에서 의도적으로 제외)
`attendance_records.hourly_wage_snapshot` 을 변경하는 경로 2곳이 감사에 남지 않는다.
**급여 금액에 직접 영향을 주는 변경인데 이력이 없다.**

| 위치 | 상황 |
|---|---|
| `app/api/admin/payroll/route.ts:156` `freezeMissingWageSnapshots()` | 급여 조회 시 스냅샷 없는 과거 기록에 현재 시급을 일괄 고정. 한 번에 수백 건 UPDATE |
| `app/api/admin/employees/[id]/route.ts:251,270` | 직원 시급 변경 시 과거 기록에 전파 |

제외한 이유: 대량 일괄 UPDATE라 감사 행이 폭증한다(1회 조회로 수백 행).
포함하려면 행 단위가 아니라 **배치 단위 요약 기록**(변경 건수 + 시급 전/후 + 대상 직원)으로
설계해야 한다. 지금 구조를 그대로 쓰면 감사 테이블이 본 테이블보다 커진다.

### 2. A. 중복 퇴근 시 급여 누락 (실측 2건, 각 1시간)
같은 계산을 3곳이 다르게 구현하고 있다.

| 위치 | 퇴근 선택 |
|---|---|
| `app/admin/page.tsx:471` 출퇴근 기록 표 | **마지막** 퇴근 |
| `app/api/admin/payroll/route.ts:186-204` `pairSessions` | **첫** 퇴근만, 이후 무시 |
| `app/api/worker/payroll/route.ts:352` 근로자 급여조회 | **마지막** 퇴근 |

실측 사례: 김다정 2026-05-30(표 360분 / 급여 300분), 최두나 2026-07-13(표 510분 / 급여 450분).
→ 근무시간 계산을 `app/lib/` 단일 모듈로 통합하고 3곳이 모두 호출.

### 3. B. 점심 차감 경계값 불일치 (실측 1건)
`app/admin/page.tsx:489-490` 은 `<=` / `>=`, `app/api/worker/payroll/route.ts:397` 은 `<` / `>`.
퇴근이 정확히 13:30이면 관리자는 차감, 근로자 화면은 미차감.
실측 사례: 하윤원 2026-08-20(표 180분 / 근로자화면 240분). → A와 같은 모듈로 해결.

### 4. `/api/admin/*` 무인증 노출 (보안, 미해결)
`middleware.ts:36` 이 `/api/admin/*` 을 인증에서 통째로 제외한다.
실측: 11개 엔드포인트 중 **10개가 비로그인으로 통과**, `/api/admin/employees` 는
주민번호·계좌번호를 포함해 반환. anon 키로 `employees.resident_number` 직접 조회도 가능.

⚠️ 순서 주의: `check-in`/`check-out`/`today` 3개 라우트가 anon 키로 `employees` 를
`select("*")` 조회한다. **DB 권한을 먼저 회수하면 배포된 프로덕션이 즉시 깨진다.**
반드시 ① 서버 라우트를 service_role 로 전환 → 배포 → ② DB 권한 회수 순서.

### 5. `/api/admin/attendance` 1000건 잘림
페이지네이션 없음(`range` 미사용). 2026-06-10~09-08 조회 시 6226건 중 **1000건만 반환**.
넓은 기간 조회 시 출퇴근 기록 표와 급여 금액이 달라 보이는 원인.
`app/api/admin/payroll/route.ts:288-327` 은 이미 올바르게 페이지네이션돼 있으니 같은 방식으로.

### 6. Supabase DB 용량 SQL 미실행
`supabase/migrations/20260828100000_db_size_monitor.sql` 미실행 상태.
실행 전까지 관리자 화면 "DB 용량" 탭은 안내 메시지만 표시한다.

### 7. Vercel 크론이 매일 실패
`CRON_SECRET` 미설정으로 `/api/cron/db-size-snapshot` 이 매일 500을 반환한다.
pg_cron(위 6번 SQL에 포함)을 쓰면 `vercel.json` 의 `crons` 항목을 지우는 게 맞다.

---

## 기록해둘 사실

### `attendance_records` 를 쓰는 코드베이스가 두 개다
```
근태 SaaS  NEXT_PUBLIC_SUPABASE_URL = https://weaydriyldnfuotzigzh.supabase.co
BISEO      ATTENDANCE_SUPABASE_URL  = https://weaydriyldnfuotzigzh.supabase.co  ← 동일
```
BISEO(`Desktop/biseo/web/lib/attendance/`)의 `confirm.ts` → `mutate.ts` 가
같은 테이블을 직접 수정한다. 근태 데이터 문제를 조사할 때 **이 경로를 반드시 함께 본다.**

감사 이력이 두 DB에 나뉘어 있다:
- `attendance_audit_log` — BISEO 자체 DB. BISEO 인라인 수정 경로 전용.
  `pending_action_id` 필수라 관리자 UI 에서 재사용 불가.
- `attendance_record_audit` — 근태 DB. 관리자 화면 수정/추가/삭제 전용(이번에 신설).

나중에 한쪽으로 합칠 수 있도록 컬럼 구성(`record_id`/`employee_id`/`field`/`old_value`/`new_value`)을
호환되게 맞춰뒀다.

### BISEO `mutate.ts` 는 0행 검사가 이미 있다
`{ count: 'exact' }` + `if (count === 0) throw` 로 무음 실패를 막고 있다.
이번에 고친 무음 실패는 근태 SaaS 쪽에만 있던 문제였다.

### 관리자 인증에 개인 식별 정보가 없다
공용 비밀번호 1개 + `admin_auth=ok` 쿠키뿐이다. 그래서 감사 테이블의 `actor` 는
항상 `admin-ui` 이고 IP/User-Agent 만 함께 남는다.
**"누가" 고쳤는지 추적이 필요하면 관리자 계정 분리가 선행되어야 한다.**

### 09:00 / 09:30 은 시스템이 자동 생성하는 값이다
`app/api/attendance/check-in/route.ts:123-129` — 08:45~09:10 탭 → 09:00,
09:11~09:30 탭 → 09:30. 따라서 "정각이면 관리자가 수기 수정한 것"이라는 판별은 불가능하다.

### 읽기 경로에는 시간 보정이 없다 (죽은 코드 2개)
`normalizeCheckIn`(`app/api/worker/payroll/route.ts:78`),
`normalizeAttendanceCheckIn`(`app/admin/page.tsx:2922`) 은 **정의만 있고 호출 0회**다.
급여 계산은 항상 DB 원본 `checked_at` 을 쓴다. 급여 캐시/스냅샷 테이블도 없다.

### 미복구 데이터
직원 id=36 **강순아** 의 `phone` 이 `010-0000-0000` 으로 덮여 있다(2026-09-08, 보안 점검 중
쓰기 요청 실수). 원본 소실, 이력 테이블 없어 복구 불가. `phone_last4` 는 `6888` 로 남아 있다.
→ 본인에게 확인 후 직원 관리 화면에서 수정 필요.
