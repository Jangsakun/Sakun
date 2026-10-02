# 보안 미처리 목록 (SECURITY_TODO)

2026-10-02 근로형태 3종 도입 작업 중 조사한 내용. **이번 작업 범위에서는 제외**하기로 결정했고,
코드는 아무것도 바꾸지 않았다. 나중에 별도 작업으로 진행할 때 이 문서부터 읽는다.

조사 방법: 코드 읽기 + 공개 키(anon key)로 직접 시험(값은 출력하지 않음, 쓰기 시험은 존재하지 않는 id=-1 로만).
DB 내부 설정(RLS·정책·권한)은 SQL 로만 확인할 수 있는데, 아래 §4 의 확인 SQL 은 **아직 실행하지 않았다.**

---

## 1. 관리자 로그인 방식 — 고정 쿠키 🔴

- `app/api/admin/login/route.ts`: 비밀번호(`ADMIN_PASSWORD`)가 맞으면 쿠키 `admin_auth=ok` 를 8시간 준다.
- **쿠키 값이 모든 사람에게 똑같은 고정 글자 `ok` 다.** 서명·비밀값이 없다.
  → 브라우저에 쿠키를 직접 `admin_auth=ok` 로 넣으면 비밀번호 없이 관리자 화면에 들어간다.
- `middleware.ts` 는 관리자 **화면(/admin)** 만 이 쿠키로 검사하고, `/api/admin/*` 는 통째로 검사에서 뺀다.

## 2. 관리자 API 인증 상태 (코드 기준)

### 인증이 전혀 없음 — 비로그인으로 바로 호출 가능

| API | 할 수 있는 일 | 위험 |
|---|---|---|
| `GET /api/admin/employees` | 조회: 전 직원 **주민번호·계좌번호** 포함 | 🔴 개인정보 유출 |
| `PATCH /api/admin/employees/[id]` | 수정: 이름·시급·**계좌번호**·근로형태·일급 | 🔴 송금 계좌 바꿔치기 |
| `PATCH /api/admin/employees/[id]/status` | 수정: 재직/퇴사 | 🟠 |
| `POST /api/admin/employees/reconnect` | 수정: 기기 재연결 코드 발급 | 🟠 남의 계정을 내 기기에 연결 |
| `POST /api/admin/attendance` | 조회: 기간 내 출퇴근 전체 | 🟠 |
| `PUT /api/admin/attendance` | 추가: 수동 출퇴근 기록 | 🟠 |
| `PATCH /api/admin/attendance/update` | 수정: 출퇴근 시각 | 🟠 급여 조작 |
| `DELETE /api/admin/attendance/delete` | 삭제: 출퇴근 기록 | 🟠 |
| `POST /api/admin/payroll` | 조회: 급여 전체 (+ 빈 시급 스냅샷 채우기 쓰기) | 🟠 |
| `GET/PATCH /api/admin/schedule` | 조회·수정: 근무 스케줄 | 🟡 |

### 고정 쿠키만 검사 — `admin_auth=ok` 를 넣으면 누구나 통과

| API | 할 수 있는 일 |
|---|---|
| `DELETE /api/admin/employees/[id]` | 삭제: 직원과 그 기록 전체 |
| `PUT /api/admin/attendance/pay-override` | 수정·삭제: 세전급여 직접지정 |
| `POST /api/admin/employees/[id]/renew-contract` | 수정: 근로계약 갱신 |
| `GET/POST /api/admin/db-size` | 조회: DB 용량 |

### 관리자 API 가 아닌 것 (참고)
- 출퇴근·오늘기록: 이름 + 생년월일 + 전화 뒷4자리로 본인 확인 (설계상 의도)
- 근로자 급여조회: 이름 + 주민번호로 본인 확인
- `cron/db-size-snapshot`: `CRON_SECRET` 으로 정상 보호

## 3. 공개 키(anon key) 사용처

브라우저 코드에서는 쓰지 않는다. 운영 사이트(admin.sakun.kr, sakun.kr) 첫 화면 JS 19개를 받아 확인했는데
공개 키 문자열이 없었다. 즉 화면만 보고는 키를 알 수 없다. **단, 키가 어디서든 유출되면 §4 권한이 그대로 열린다.**

| 서버 API | 공개 키로 하는 일 |
|---|---|
| `attendance/check-in`, `attendance/check-out` | 직원 조회(`select *`), 출퇴근 조회·저장 |
| `attendance/today` | 직원 조회(`select *`), 오늘 기록 조회 |
| `auth/validate-employee` | 직원 조회 |
| `admin/attendance` POST (관리자 기록 목록) | 출퇴근·직원 조회 |
| `admin/employees/[id]/status` (`app/lib/supabase.ts` 경유) | **직원 수정** |
| `auth/register` | 서버 전용 키 우선, 없을 때만 공개 키 (실제로는 서버 전용 키) |

## 4. 테이블 보호(RLS) 상태 — 공개 키로 실측 (2026-10-02)

| 테이블 | 공개 키 읽기 | 공개 키 쓰기 |
|---|---|---|
| `employees` | 🔴 **102행 전부, 주민번호·계좌번호·전화번호 포함** | 거절되지 않음 |
| `attendance_records` | 🔴 10,558행 전부 | 거절되지 않음 |
| `employee_devices` | 0행 (전체 98행 중 — 보호됨) | 거절되지 않음 |
| `weekly_schedules` | 0행 (전체 951행 중 — 보호됨) | 거절되지 않음 |
| `attendance_pay_override`, `attendance_record_audit`, `employment_contract_history`, `db_size_snapshots` | 거절 ✅ | 거절 ✅ |

"거절되지 않음" 은 확정이 아니다. 권한이 있어서 0건 처리된 것인지, RLS 정책 때문에 조용히 0건 처리된 것인지
이 시험으로는 구분할 수 없다. 다만 재직/퇴사 변경 기능이 운영에서 공개 키로 `employees` 를 수정하고 있으므로
**`employees` 는 공개 키로 수정까지 가능할 가능성이 높다(계좌번호 포함).**

확정하려면 Supabase SQL Editor 에서 실행 (미실행):

```sql
-- 테이블별 RLS 켜짐 여부
select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- 정책 목록
select tablename, policyname, roles, cmd, qual, with_check
  from pg_policies where schemaname = 'public' order by 1, 2;

-- anon · authenticated 권한
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 group by 1, 2 order by 1, 2;
```

### 2026-10-02 이후 작업과의 관계
- 4단계(출퇴근 저장을 DB 함수로 처리)는 공개 키를 그대로 쓰는 범위로 진행했다(서버 전용 키 교체 안 함).
  그래서 그 DB 함수는 anon 이 실행할 수 있어야 한다. 공개 키가 유출되면 함수를 직접 불러 아무 직원의
  기록을 만들 수 있지만, 지금도 공개 키로 `attendance_records` 에 직접 넣을 수 있으므로 위험이 새로 생기는 것은 아니다.
  공개 키를 정리할 때 이 함수의 실행 권한도 함께 회수한다.
- 7단계 BISEO 기간 합산은 관리자 API 가 아니라 전용 주소 `/api/internal/payroll-summary`(읽기 전용)를 쓴다.
  그래서 나중에 관리자 API 에 인증을 걸어도 BISEO 는 영향을 받지 않는다. 인증키는 아직 적용하지 않았다.

---

## 5. 제안했던 설계 (미진행)

### ① 관리자 인증
- 고정 쿠키 → **서명된 세션 쿠키**. 서버만 아는 비밀키(예: `ADMIN_SESSION_SECRET`)로 만료시각에 HMAC 서명.
- `middleware.ts` 한 곳에서 `/admin` 화면과 `/api/admin/*` 전체를 검사한다. 예외는 로그인 API 하나.
  (middleware 는 Edge 런타임이므로 Web Crypto 로 HMAC 검증)
- API 안에 따로 있는 쿠키 검사 4곳(pay-override, db-size, employees/[id] DELETE, renew-contract)은 공용 검사로 교체.
- 배포 직후 관리자는 한 번 다시 로그인해야 한다.

### ② BISEO 내부 인증키
- 관리자 API 를 열어주지 않고 **BISEO 전용 API**(`/api/internal/payroll-summary`)만 키로 허용한다.
  키가 유출돼도 급여 합산 조회(읽기 전용) 외에는 아무것도 할 수 없다.
- 환경변수 `BISEO_INTERNAL_API_KEY`, BISEO 는 요청 헤더로 전달. 비교는 시간 일정 비교(constant-time).

### ③ 공개 키 차단 (추천안)
1. 공개 키를 쓰는 서버 API 6개(§3 표)를 서버 전용 키로 교체. 키만 바꾸고 동작은 그대로.
   서버 전용 키는 급여 API 등에서 이미 운영 중이라 배포 환경에 있다.
2. 배포 후 출퇴근·본인확인·관리자 기능 정상 확인.
3. SQL 파일로 `employees`, `attendance_records`, `employee_devices`, `weekly_schedules` 에 RLS 를 켜고
   anon·authenticated 권한을 전부 회수. **반드시 1→2→3 순서.** SQL 을 먼저 실행하면 운영 출퇴근이 즉시 멈춘다.
- 대안(비추천): `employees` 의 주민번호·계좌 칸만 칸 단위로 막기. 출퇴근 기록 전체 공개, 직원 수정 가능성은 그대로 남는다.
- ⚠️ 이 저장소 밖에서 공개 키를 쓰는 프로그램이 있는지는 확인하지 못했다(BISEO 는 서버 전용 키라 무관).

### ④ 미조사 항목
- 과거 비정상 접근 여부(Vercel·Supabase 로그) — 조사하지 않음.
- 주민번호가 평문 저장인지 암호화인지, 암호화 시 근로자 급여조회 본인확인(이름+주민번호)에 미치는 영향 — 조사하지 않음.
