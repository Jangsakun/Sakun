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
| `20260928100000_attendance_pay_override.sql` | ✅ 2026-09-28 실행 완료 — 세전급여 직접 지정 |
| `20260930100000_employment_contract_renewal.sql` | ✅ 2026-10-01 실행 완료 — 11개월 갱신·첫입사일·갱신 기록 |
| `20261001100000_audit_tables_append_only.sql` | ⏳ **미실행** (2026-10-14 확인) — 갱신 기록·출퇴근 감사 테이블이 아직 서버 키로 수정·삭제 가능. 실행하면 막힘. 테스트 갱신 기록 10줄(`갱신테스트A~K`, id 1~11 중 7 제외, 2098년 이후 날짜) 정리 SQL 도 같이 줘야 함 — 실제 직원 갱신 기록은 아직 0건 |
| BISEO `0038_contract_alert_window_30d.sql` | ⏳ **미실행** — 실행 후에 `contract-alerts.ts` 의 `CONTRACT_ALERT_MAX_DAYS` 를 7→30 으로. **순서 반대면 알림 저장 전체 실패** (0036 이 days_remaining 1~7 로 막음) |
| `20261014100000_employment_contracts.sql` | ✅ 2026-10-14 실행 완료 — 전자 근로계약서 테이블 6개 + 비공개 버킷 |
| `20261014200000_hemoz_contracts.sql` | ✅ 2026-10-14 실행 완료 — 헤모즈 명의·양식·근무지 연결. 운영에서 헤모즈 가입 → 계약서·미리보기 확인 |
| `20261014210000_hemoz_11m_v2.sql` | ⏳ **미실행** — 헤모즈 11개월 양식 소재지 정정본(v2) 등록 + v1 비활성 |
| `20261015100000_delete_pending_contract.sql` | ⏳ **미실행** — 관리자 전자계약 탭 "삭제" 버튼용 함수(서명대기만 삭제, 서명본은 함수·트리거가 거부). 실행 전엔 버튼이 "SQL 먼저 실행" 안내만 띄움 |
| `20261015200000_sms_outbox.sql` | ⏳ **미실행** — 문자 대기열·워커 연결 기록·서명본 다운로드 링크·명의 짧은 이름. 실행 전 배포해도 안전(문자 칸·경고 숨김, 서명 정상) |

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

---

## 전자 근로계약서 (1차: 장사꾼 명의) — 진행 상황

**1단계 완료·배포 (2026-10-14, 커밋 `bff03d5`)** — 검증 모듈, 양식 PDF 생성, 관리자 "전자계약" 탭.
검증: 단위 21 + DB·API 49 + 화면 14, 전부 통과. 샘플 PDF: 바탕화면 `근로계약서_1단계_샘플`.

**사용자 확정 사항 (2026-10-14)**
- 대상: 신규 가입자만. 기존 직원은 전부 제외(계약서 행을 만들지 않음 = 페이지 안 뜸)
- 11개월 양식 = 바탕화면 `용역계약서_11개월_10320원_장사꾼.pdf` 그대로 사용(근무시간 칸 없음 → 근무시간·휴게·52h 검사는 1주만)
- 인쇄된 연도 2026 은 실제 연도와 다를 때만 흰색으로 덮고 실제 연도 기입
- 1주 근무시간은 한 번 입력 → 체크한 요일 칸에 동일 기입. 일요일 칸 없음(일요일 근무 제외)
- 2026 최저시급 10,320원. 서명 전 출근 차단 안 함. 야간(자정 넘김) 없음
- 직인: 주급명세서 직인(public/stamp.png) 그대로 → assets/contracts/seals/jangsakun.png
- 관리자 로그인 보강 안 함(쿠키 `admin_auth=ok` 고정값 — 위조 가능, 사용자 인지)
- 주민번호: **암호화하지 않음(2026-10-14 사용자 결정).** 서명 시 `input_snapshot.residentNumber` 에 평문 저장, 관리자 화면·로그·오류에는 마스킹만
- ~~근로자 본인 확인에 기기 ID 확인 추가~~ — **2026-10-14 사용자 결정: 하지 않음.** 근로자 확인은 기존과 같은 이름+생년월일+휴대폰 뒤 4자리(동료가 남의 계약서를 열 수 있는 위험은 사용자 인지)

**2단계 완료·배포 (2026-10-14, 커밋 `75f29c0`)** — 근로자 작성·미리보기·전자서명
- 서명대기 생성 시점: 신규 가입 / 당근→고정 전환 / 11개월 갱신 버튼 / 당근 1주 만료 후 출근 버튼
- 화면: `/contract`(입력 → PDF 미리보기 끝까지 읽기 → 서명 → 완료), `/contract/mine`(내 계약서 내려받기)
- API: `app/api/worker/econtract/*` (옛 `/api/worker/contracts` 와 `app/page.tsx` 안의 옛 계약서 코드는 안 쓰는 코드로 남아 있음 — 건드리지 않음)
- 출근 차단 없음: 서명 전 출근 시 안내 확인창만. 앱 열 때 계약서로 이동(“나중에” 누르면 30분간 안 뜸)
- 검증: 로컬 E2E 시나리오 1~19 + 운영 서명 흐름 + 운영 브라우저(입력~내 계약서) 전부 통과
- **2027년 최저시급을 관리자 "전자계약" 탭에 넣기 전에는 2027년 시작 계약서(갱신 포함)가 서명 불가** — 정상 동작(규칙)
- 테스트 데이터 정리 완료(2026-10-14): 계약서 52 · 이벤트 211 · 갱신이력 3 · 저장소 파일 54 삭제, 삭제 방지 트리거 재작동 확인. 백업: 바탕화면 `근로계약서_테스트삭제_백업_20261014`. 최저시급 2099년 테스트 행은 앱 권한으로 못 지움 → SQL 전달(`delete from minimum_wages where year = 2099 and note = '테스트'`)

**알아둘 것**
- pdf-lib 에서 나눔고딕을 subset 으로 넣으면 한글이 빈칸이 됨 → `subset: false` (PDF 약 0.8MB)
- 양식 좌표는 `app/lib/contracts/templates.ts` 한 곳. 원본 PDF 지문이 다르면 생성 거부
- 서명 완료 행은 트리거가 막으므로 테스트 데이터는 SQL Editor 에서 트리거를 잠시 끄고 지워야 함

**헤모즈 적용 (2026-10-14~15)**
- 헤모즈 신규 가입자도 적용(명의 주식회사 헤모즈, 직인 `assets/contracts/seals/hemoz.png` ← public/stamp1.png). 기존 헤모즈 직원은 그대로
- 11개월 양식 v1 은 소재지가 장사꾼 주소로 잘못 인쇄 → 사용자 정정본 v2(`hemoz_11m_v2`). v2 SQL 실행 여부는 위 표 확인
- 관리자 전자계약 탭 "삭제" 버튼: 서명대기만(DB 함수 `delete_pending_contract`). 서명본은 삭제 경로를 만들지 않음(2026-10-14 사용자 원칙)

**사용자 확인 대기 (2026-10-15)**
- 서명 완료 테스트 1건(계약 id 58, `cnsdldu`) 삭제 SQL 전달함 → 실행 확인되면 저장소 파일 2개 삭제: `272/58/contract-332cf474e4981ab8.pdf`, `272/58/signature-087eba5320a1ebb7.png`
- 테스트 서명대기 2건(계약테스트헤모즈당근·고정): 삭제 버튼 SQL 실행 후 사용자가 화면에서 삭제

---

## 뿌리오 문자 연동 — 서명본 다운로드 링크 LMS (2026-10-15 ✅ 운영 가동, 실발송 검증 완료)

- **2026-10-15 운영 반영 완료**: SQL 실행, 배포(`174777e`, UI `29beb30`), Vercel `SMS_WORKER_SECRET`, 사무실 PC 작업 스케줄러 `SakunSmsWorker`(SYSTEM) 등록,
  절전 끔, `SMS_DRY_RUN=0`. 모의 발송(테스트 계약서) → 본인 번호 실발송(#3, 뿌리오 1000) → 링크·생년월일·PDF 내려받기까지 사용자 확인
- 겪은 일: 뿌리오 연동 IP 등록 직후 토큰 발급이 3003(invalid ip, userIp 221.159.47.151)으로 거부 → 뿌리오 사이트에서 IP 설정 재확인 후 해결, 워커는 5분 뒤 자동 복구
- 일반(비관리자) 창에서는 `Get-ScheduledTask SakunSmsWorker` 가 안 보임(SYSTEM 작업) — 정상. 로그는 notepad 로 열기(PS 5.1 Get-Content 는 한글 깨짐)
- ⚠️ **별건 보안 구멍(미처리)**: 관리자 API 인증이 쿠키 `admin_auth=ok` 고정값이라 누구나 쿠키만 넣으면 통과(2026-10-15 실측). 사용자에게 보고함, 수정 여부 결정 대기
- (아래는 구현 당시 기록)

- 구조: 근태 앱은 `sms_outbox` 에 적기만 → 사무실 PC `sms-worker/`(Node, 의존성 없음)가 `/api/internal/sms/claim`·`report` 로 가져가 뿌리오 발송.
  워커 PC에는 Supabase 키 없음(`SMS_WORKER_SECRET` 만). 설치·전원설정·문제해결: **[sms-worker/README.md](sms-worker/README.md)**
- 이중 발송 방지: claim 은 `for update skip locked` / dedupe_key unique / 발송중 10분 멈춤 → unknown(자동 재발송 안 함).
  확실히 안 나간 것(인증·IP·429·연결 거부)만 시도 횟수 미포함 재시도, 시간초과·5xx 는 unknown
- 서명 완료 시 대기열 넣기는 `sign/route.ts` 8단계(실패해도 서명 유지). 링크 `/d/<토큰22자>`, 토큰은 SHA-256 만 저장,
  30일, 생년월일 6자리 5회 틀리면 잠김(DB 함수 `contract_link_verify`), 무효 계약서는 안 열림
- 관리자: 전자계약 탭 "서명본 문자" 칸 + "문자 재발송"(받는 번호 = 직원 정보 우선, 없으면 서명 시 번호. 이전 링크 막힘·안 나간 이전 문자 취소).
  모든 탭 상단 `SmsWorkerBanner` — 워커 10분 끊김 빨간 경고, 모의 발송/뿌리오 오류/확인필요 노란 안내(1분 폴링)
- 문자 첫머리 = `contract_entities.short_name`([장사꾼]/[헤모즈])
- 뿌리오 문서 확인(2026-10-15): **발송결과 조회 API·웹훅 없음**(code 1000 = 접수 성공, 도착은 사이트에서만),
  토큰 재발급 횟수 제한 **문서에 없음**(24h 유효, 워커는 만료 1시간 전 갱신), **LMS 제목 30자**·본문 2000바이트, 초당 15회 제한
- 검증: tests/sms 15개 + 기존 21개 통과, tsc·eslint·next build 통과, 워커 실행 파일을 가짜 API 에 붙여 모의 발송·중복 실행 잠금·.env 저장 시 자동 재시작 확인.
  작업 스케줄러는 설정 객체만 확인(실제 등록 안 함). **SQL 은 DB 에서 실행해 보지 못함**(로컬 Postgres 없음)
- **남은 것**: ① SQL 실행 ② 커밋·푸시(지시 필요) ③ Vercel `SMS_WORKER_SECRET`(값은 sms-worker/.env 에 이미 생성) + 재배포
  ④ .env 에 PPURIO_ACCOUNT/API_KEY/FROM ⑤ 관리자 PowerShell 로 install-task.ps1 ⑥ 전원 설정 ⑦ 모의 발송 확인 → SMS_DRY_RUN=0 → 본인 번호 실발송 1건(5단계)
- 사무실 IP 고정 여부 통신사 확인 중 → 유동이면 README "클라우드 서버로 옮길 때"

### (이전 기록) 0단계 조사

- 뿌리오 API(https://www.ppurio.com/send-api/guide): **기업회원만**, 연동 신청 승인 후 인증키 발급,
  **발송 서버 IP 사전 등록 필수**(연동 > 연동신청관리). 토큰 `POST https://message.ppurio.com/v1/token`(Basic 인증, 24시간 유효)
  → 발송 `POST /v1/message` (필수: account, messageType, content, from, duplicateFlag, targetCount, targets, refKey)
- 요금: SMS 8.8~27.5원, LMS 26.4~50원(구간별)
- npm `ppurio`(비공식)는 옛 API(`send_utf8_json.php`)라 쓰지 않음
- **걸림돌: Vercel Hobby 는 고정 IP 없음** → ① Vercel 유료 고정 IP(플랜·가격 확인 필요) ② 고정 IP 중계 서버 ③ IP 등록 없는 다른 문자 서비스
- ~~사용자에게 물어본 것~~ → **답 받음(2026-10-15)**: 이번 범위 = 서명 완료 시 서명본 다운로드 링크 LMS 1건(구조는 범용).
  알림톡 X. IP는 **사무실 PC 대기열 워커**(1순위, 사무실 IP 221.159.47.151) / 유동 IP면 같은 워커를 고정 IP 클라우드로(2순위).
  생년월일 6자리 확인·30일 유효·5회 실패 잠금·발송 실패해도 서명 유지·관리자 재발송·개인정보/API 키 노출 금지.
  뿌리오 계정 상태(기업회원·연동 신청·발신번호·IP 등록)는 사용자 확인 중
- **설계안 보고함, 승인 대기(코드 없음)**: `sms_outbox`(범용 대기열, `for update skip locked` 로 가져가기,
  `sending` 중 멈춘 건 자동 재발송 안 하고 `unknown` → 관리자 확인) + `contract_download_links`(토큰 해시만 저장)
  + `/d/[토큰]` 페이지 + 관리자 재발송 버튼 + `sms-worker/`(Next 비의존 Node 스크립트, Vercel 내부 API 경유 →
  워커 PC에 service_role 키 안 둠, 작업 스케줄러 로그온 시 실행·실패 시 재시작, 하트비트를 관리자 탭에 표시)
- 결정 필요/확인 필요: 앱 공개 도메인(링크 주소), 뿌리오 발송결과 조회 API 유무·토큰 재발급 제한·LMS 제목 길이
