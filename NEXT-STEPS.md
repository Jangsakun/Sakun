# 근태 SaaS — 미처리 작업 목록

세션이 바뀌어도 남아야 하는 항목만 적는다. 처리하면 이 파일에서 지운다.
최종 갱신: 2026-10-02

---

## 마이그레이션 실행 현황

| 파일 | 상태 |
|---|---|
| `20260828100000_db_size_monitor.sql` | ✅ 2026-09-15 실행 완료 |
| `20260909100000_attendance_record_audit.sql` | ✅ 2026-09-09 실행 완료 |
| `20260929100000_employee_contract_type.sql` | ✅ 2026-09-29 실행 완료 (직원 98명 전원 hourly 확인) |
| `20261002100000_work_segments.sql` | ✅ 2026-10-02 실행 완료 (기존 10,558건 전부 hourly 확인) |
| `20261003100000_cleanup_duplicate_attendance.sql` | ✅ 2026-10-02 12:08 실행 완료 — 삭제 26건/감사로그 26건, 급여 23개 기간 1원 단위 동일 확인 |
| `20261003110000_record_attendance_function.sql` | ✅ 2026-10-02 실행 완료 — 출퇴근 저장 DB 함수 + 중복 불가 제약 + 서버 시각 저장 (4단계) |
| `20261004100000_audit_segment_type.sql` | ✅ 2026-10-02 실행 완료 — 감사로그 segment_type (수정·수동입력·삭제 모두 구간 기록 확인) |
| BISEO `0039_attendance_audit_segment_type.sql` | ✅ 2026-10-02 BISEO DB(zrvjflemurvvdnqwclyb)에 적용 |

둘 다 반영돼 관리자 화면 "DB 용량" 탭과 출퇴근 수정 이력이 정상 동작한다(실측 확인).

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

### 2·3. A/B 근무시간 계산 통합 — 2026-10-02 1단계 완료·커밋
근로형태 3종(시급/도급/시급+도급) 도입 작업의 1단계. 단일 모듈 `app/lib/workTime.ts` 를
관리자 급여 API / 관리자 기록 표 / 근로자 급여조회 / 근로자 홈 4곳이 호출한다.
- **적용 시작일 `WORK_TIME_RULE_START_DATE` = "2026-10-05" (사용자 확정)** 이전 날짜는
  기존 관리자 급여 API(pairSessions) 방식 그대로 → 과거 지급액 불변(전 기간 API 결과 1원 단위 동일 확인).
- 이후 날짜: 첫 출근→마지막 퇴근, 점심 경계 포함, 금액 버림, 퇴근 누락된 지난 날 0원+누락 표시.
- 과거를 새 규칙으로 계산 시 달라지는 건 2건(김다정 05-30 +10,500 / 최두나 07-13 +10,320) — 보고만, 미반영.
- `stash@{0}` 은 이번 구현으로 대체되어 삭제함.
- 배포 전 관리자 화면 "퇴근 누락" 표시는 사용자가 브라우저로 직접 확인 예정.
- 7단계 BISEO 조건(사용자 확정): BISEO 기간합산은 근태 급여 API 호출 방식. ① 시급 스냅샷 채우기 쓰기가 없는
  "읽기 전용 모드"(일반 모드와 결과 동일 비교검증) ② 응답에 퇴근 누락일 목록 ③ BISEO 전용 내부 인증키
  ④ 휴무 스케줄 날 퇴근 누락이 알림에서 빠지는 문제(김진이 2026-10-01) 수정.
- 중복 기록 24일: 4단계 직전 목록 보고 → 사용자 확인 후 정리.
- 3단계(근로자 화면) 2026-10-02 구현·검증 완료(커밋 전 사용자 확인). 규칙은 `app/lib/attendanceFlow.ts`.
- 4·5단계 2026-10-02 구현·검증 완료(커밋 전). 급여 규칙은 `app/lib/dayPay.ts`(도급 계산 calcPieceDay 한 곳).
- 테스트 데이터(검증 끝나면 삭제·건수 보고): 직원 203~206(204·205 는 weekly_allowance_status=대상·가짜 주민번호 설정),
  employee_devices 178~181, 이들의 attendance_records(2026-09-21 주 과거 기록 포함), BISEO 알림 행.
  ⚠️ 매일 오전 10시 BISEO 알림 전에 '오늘' 테스트 기록은 지울 것.
  ⚠️ 테스트 직원 감사로그(attendance_record_audit)는 서버 키로 못 지움(append-only) → 최종 정리 때 SQL Editor 용 SQL 필요.
- 6단계(관리자 화면) 2026-10-02 구현·검증 완료·커밋. 7단계(BISEO 연동) 구현·검증 완료·커밋.
- **2026-10-02 15:25 배포 완료**(push ebec24e, Vercel 자동 배포). 운영에서 8월/9월 급여 합계 변경 전과 동일 확인, BISEO `.env.local` ATTENDANCE_SAAS_API_URL=https://sakun.kr 로 변경(BISEO 합산이 운영 API 와 1원 단위 일치 확인).
- 남은 일: 사용자가 실제 직원 근로형태 변경 → 시급+도급 실사용 확인 / 10-05(월) 새 근무시간 규칙 적용 확인 / 최종 정리(테스트 직원 203~206·기기 178~181·기록·BISEO 알림/확인요청/감사로그 테스트 행 삭제, 직원 207 은 실제 가입자라 삭제 금지, 근태 SaaS 감사로그는 남김).
  BISEO 쪽 변경은 Desktopiseoweblibattendance + ATTENDANCE-INTEGRATION.md §20 (BISEO 는 git 추적 안 됨 — 변경 파일 목록은 §20).
- 검증 스크립트: `_verify/` (git 제외 — .git/info/exclude).
- 다음: 2단계(데이터 구조) — 사용자 확인 후. 0단계 결정사항은 대화 기록 대신 아래 요약 참고:
  도급=출퇴근 둘 다 있어야 일급 스냅샷 지급, 도급 퇴근 시간제한·출근 보정 미적용, 주휴 15h 판정은 시급구간만(설정값),
  세전급여 지정=시급분만 대체·도급 일급은 별도 지급(2026-10-02 변경, 주휴는 시급분 기준 유지), 동시요청=DB 함수+DB 제약(기존 중복일 목록 보고 후 정리), BISEO 합산은 API 호출 방식 검토.

### 4. `/api/admin/*` 무인증 노출 (보안, 미해결) — 전체 조사 결과는 `docs/SECURITY_TODO.md`
`middleware.ts:36` 이 `/api/admin/*` 을 인증에서 통째로 제외한다.
실측: 11개 엔드포인트 중 **10개가 비로그인으로 통과**, `/api/admin/employees` 는
주민번호·계좌번호를 포함해 반환. anon 키로 `employees.resident_number` 직접 조회도 가능.

⚠️ 순서 주의: `check-in`/`check-out`/`today` 3개 라우트가 anon 키로 `employees` 를
`select("*")` 조회한다. **DB 권한을 먼저 회수하면 배포된 프로덕션이 즉시 깨진다.**
반드시 ① 서버 라우트를 service_role 로 전환 → 배포 → ② DB 권한 회수 순서.

### 5. ~~`/api/admin/attendance` 1000건 잘림~~ — 2026-09-30 완료
급여 API 와 같은 방식(건수 → 1000건씩 동시 요청, id 타이브레이커)으로 나눠 받는다.
조회 기간은 최대 92일. 기록을 통째로 내려보내므로 1년이면 약 8.2MB 로
Vercel 응답 한도(4.5MB)를 넘기 때문이다. 넘으면 이유를 알려주고 막는다.
증상이 "한 달 조회 시 앞 2주만 보임"이었던 이유: 평일 하루 약 100건이라 1000건 ≈ 2주.

남은 같은 계열 문제: `app/api/admin/employees/[id]/route.ts:513` 직원 삭제 시
감사용으로 기록을 읽는 부분도 1000건까지만 읽는다(삭제 자체는 전부 됨, 감사 기록만 누락).
기록 1000건 넘는 직원(약 2년 이상 근무)에게만 해당.

### 6. ~~Vercel 크론 정리~~ — 2026-09-15 완료
pg_cron 잡 `record-db-size-daily` 등록 확인 후 `vercel.json` 의 `crons` 를 제거했다.
(`/api/cron/db-size-snapshot` 라우트는 수동·백업용으로 유지)

### 7. 응답 속도 — Vercel 함수 리전과 Supabase 리전 불일치
2026-09-15 실측. 원인은 번들도 DB 도 아니고 **서버 위치**였다.

```
X-Vercel-Id: icn1::iad1::...     엣지는 서울(icn1), 함수는 미국 버지니아(iad1)
Supabase                          ap-northeast-1 (도쿄)
```

| 구간 | 실측 |
|---|---|
| 내 PC → Vercel (DB 미사용) | 0.16초 |
| 내 PC → Supabase 직접 | 0.10초 |
| Supabase 쿼리 자체 (1000행 + 조인) | 0.047초 |
| **Vercel API (Supabase 쿼리 1회)** | **1.03초** ← 차액 0.87초가 태평양 왕복 |

그래서 급여 API 가 느렸다: 전체기간 9,291행 = 1000행씩 10페이지를
`while` 루프로 **순차** 요청(`app/api/admin/payroll/route.ts`) → 11회 × 0.85초 ≈ 9.4초 (실측 9.62초).

→ `vercel.json` 에 `"regions": ["icn1"]` 추가함. Hobby 플랜은 단일 리전만 가능.
   적용 여부는 배포 후 `X-Vercel-Id` 의 두 번째 값으로 확인할 것.
   안 먹히면 Vercel Dashboard → Project Settings → Functions → Function Region 에서 변경.

참고: `freezeMissingWageSnapshots` 의 UPDATE 는 병목이 아니다.
null 스냅샷이 9,292행 중 1행뿐이라 사실상 no-op.

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
