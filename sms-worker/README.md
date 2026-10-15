# 문자 발송 워커 (뿌리오)

근태 앱(sakun.kr)이 대기열에 적어 둔 문자를 이 PC에서 뿌리오로 보내는 프로그램입니다.
뿌리오는 **미리 등록한 IP(사무실 221.159.47.151)에서만** 발송을 받기 때문에, 고정 IP가 없는 Vercel 대신 이 PC가 보냅니다.

```
근로자 서명 완료 → 근태 앱이 "보낼 문자"를 DB 대기열에 적음
                 → 이 PC 워커가 30초마다 가져가서 뿌리오로 발송 → 결과 기록
```

- 이 PC가 꺼져 있던 동안 쌓인 문자는 켜지면 순서대로 나갑니다.
- 같은 문자는 두 번 나가지 않습니다. 보내는 도중 PC가 꺼진 문자는 자동으로 다시 보내지 않고 관리자 화면에 **"확인 필요"**로 뜹니다
  (뿌리오에 접수됐는지 알 수 없어서). 뿌리오 사이트 발송결과에서 확인하고, 안 나갔으면 전자계약 탭 **"문자 재발송"**을 누르세요.
- 워커 연결이 10분 넘게 끊기면 관리자 화면 맨 위에 빨간 경고가 뜹니다.

---

## 처음 설치 (순서대로)

### 1. DB 준비 (한 번)
Supabase SQL Editor 에서 `supabase/migrations/20261015200000_sms_outbox.sql` 전체를 붙여넣고 Run.

### 2. 설정 파일 `.env`
`sms-worker\.env` 파일이 이미 만들어져 있습니다(비밀값 `SMS_WORKER_SECRET` 은 자동 생성됨). 메모장으로 열어 아래 값을 넣습니다.

| 이름 | 넣을 값 | 비고 |
|---|---|---|
| `PPURIO_ACCOUNT` | 뿌리오 로그인 아이디 | |
| `PPURIO_API_KEY` | 뿌리오에서 발급받은 API 인증키 | 대화창·메신저에 붙이지 마세요 |
| `PPURIO_FROM` | 등록한 발신번호 (숫자만, 예: 0631234567) | |
| `SMS_DRY_RUN` | `1` = 모의 발송 / `0` = 실발송 | **처음엔 1 그대로** |
| `SMS_WORKER_SECRET` | (자동 생성됨, 건드리지 않음) | 아래 3번에서 Vercel 에 복사 |
| `SMS_API_BASE_URL` | `https://sakun.kr` | 그대로 |
| `SMS_WORKER_ID` | `office-pc` | 관리자 화면 표시용 |

```powershell
notepad C:\Users\DeskTop_Win11\attendance-saas\sms-worker\.env
```

### 3. Vercel 환경변수 (한 번)
Vercel → 프로젝트 → Settings → Environment Variables → **`SMS_WORKER_SECRET`** 추가.
값은 `.env` 의 `SMS_WORKER_SECRET=` 뒤 문자열 그대로(Production 체크). 저장 후 **Redeploy** 해야 반영됩니다.

### 4. 손으로 한 번 실행해서 확인
```powershell
cd C:\Users\DeskTop_Win11\attendance-saas
node sms-worker\worker.mjs
```
`[시작] ... mode=모의 발송(dry-run)` 이 나오고 오류가 없으면 `Ctrl+C` 로 끕니다.
`근태 앱 API ... HTTP 401` 이 나오면 3번(Vercel 값·재배포)을 다시 확인하세요.

### 5. 작업 스케줄러 등록 (상시 실행)
시작 메뉴에서 PowerShell 을 **마우스 오른쪽 → 관리자 권한으로 실행** 후:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\DeskTop_Win11\attendance-saas\sms-worker\install-task.ps1
```
등록되는 설정:
- **사용자 로그온 여부와 관계없이 실행** (SYSTEM 계정 — 재부팅 후 아무도 로그인 안 해도 돌아감, 비밀번호 저장 없음)
- **시스템 시작 시 실행** + 5분마다 "안 돌고 있으면 시작" 점검
- **죽으면 1분 후 재시작** (감시 스크립트 `run-worker.ps1` 이 1분 뒤 다시 켬)
- **하나만 실행** (이미 돌고 있으면 새로 띄우지 않음)
- 실행 시간 제한 없음, 배터리 전환 시에도 멈추지 않음

해제: 같은 명령 끝에 `-Uninstall` 을 붙입니다.

### 6. 윈도우 전원 설정 (절전 때문에 멈추지 않게)
PC가 절전 모드에 들어가면 워커도 멈춥니다(관리자 화면에 빨간 경고). 아래를 한 번 해 두세요.

**① 절전·최대 절전 끄기** — 관리자 PowerShell 에서:
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```
(같은 설정: 설정 → 시스템 → 전원 → 화면 및 절전 → "절전 모드로 전환" = **안 함**. 화면 끄기는 켜 둬도 됩니다.)

**② 랜카드 절전 끄기** — 장치 관리자 → 네트워크 어댑터 → 사용 중인 랜카드 더블클릭 → 전원 관리 탭 →
"전원을 절약하기 위해 컴퓨터가 이 장치를 끌 수 있음" **체크 해제**.

**③ (권장) 정전 후 자동 켜짐** — 메인보드 BIOS 설정의 "Restore on AC Power Loss" = **Power On**.
정전·차단기 후 PC가 스스로 켜지면 워커도 자동으로 시작됩니다(로그인 불필요).

**④ 윈도우 업데이트 재시작** — 업데이트로 재부팅돼도 시스템 시작 시 자동 실행되므로 따로 할 일은 없습니다.

확인:
```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
```
"현재 AC 전원 설정 인덱스: 0x00000000" 이면 절전 꺼짐입니다.

### 7. 모의 발송 → 실발송
1. 모의 발송(`SMS_DRY_RUN=1`) 상태로 테스트 근로자가 계약서에 서명 → 관리자 전자계약 탭 "서명본 문자" 칸이 **발송 완료 · 모의 발송**이 되는지 확인
2. `.env` 에서 `SMS_DRY_RUN=0` 으로 바꾸고 저장. 워커가 저장을 알아채고 스스로 재시작합니다(약 1~2분).
   로그에 `mode=실발송(live)` 과 `[토큰] 뿌리오 토큰 갱신` 이 찍히면 준비 완료.
   (`.env` 의 다른 값을 고칠 때도 저장만 하면 됩니다.)
3. 본인 번호로 등록된 계약서에서 "문자 재발송" → 휴대폰 수신 + 링크 → 생년월일 6자리 → PDF 내려받기 확인

---

## 상태 확인·문제 해결

| 보고 싶은 것 | 방법 |
|---|---|
| 워커가 도는지 | 관리자 화면 맨 위 경고가 없으면 정상. 또는 `Get-ScheduledTask SakunSmsWorker` → State `Running` |
| 무슨 일이 있었는지 | `sms-worker\logs\sms-worker.log` (가린 번호·결과 코드만 기록, 본문·키 없음) |
| 문자가 실제로 도착했는지 | 뿌리오 사이트 → 발송결과 (뿌리오는 API 로 도착 결과를 주지 않음) |

| 관리자 화면/로그 문구 | 원인 → 할 일 |
|---|---|
| 문자 워커 연결 끊김 | PC 꺼짐·절전·인터넷 끊김 → PC 확인. 켜지면 밀린 문자 자동 발송 |
| 연동 IP 미등록(3003) | 사무실 공인 IP가 바뀜(유동 IP) → 뿌리오 연동 IP 수정, 또는 클라우드 이전(아래) |
| 인증키 오류(4006)/계정 오류(3004) | `.env` 의 `PPURIO_API_KEY`/`PPURIO_ACCOUNT` 확인 후 워커 재시작 |
| 확인 필요 | 보내는 도중 끊김 → 뿌리오 발송결과 확인 후 필요하면 재발송 |
| 발송 실패 | 번호 형식 등 뿌리오가 거부 → 직원 정보 번호 확인 후 재발송 |

설정 문제(3003·4006 등)가 생기면 워커는 5분 쉬고 다시 시도합니다. 그동안 문자는 대기열에 그대로 남고 시도 횟수도 줄지 않습니다.

---

## 클라우드 서버로 옮길 때 (사무실 IP가 유동으로 확인되면)

코드는 그대로입니다. 고정 IP 서버(Linux)에 Node 20 이상 설치 →
`sms-worker` 폴더만 복사 → `.env` 를 같은 내용으로 작성 → 뿌리오 연동 IP 를 서버 IP 로 변경 →
`node worker.mjs` 를 상시 실행(systemd 등)으로 등록. 이 PC의 작업은 `install-task.ps1 -Uninstall` 로 해제합니다.
워커는 DB 키 없이 `SMS_WORKER_SECRET` 하나로 근태 앱에 접속하므로, 서버에 Supabase 키를 둘 필요가 없습니다.

## 파일

| 파일 | 역할 |
|---|---|
| `worker.mjs` | 실행 진입점(설정 읽기, 중복 실행 잠금, 로그) |
| `lib/core.mjs` | 가져가기 → 발송 → 결과 보고 |
| `lib/ppurio.mjs` | 뿌리오 토큰(만료 1시간 전 자동 재발급)·발송·결과 분류 |
| `run-worker.ps1` | 감시 루프(죽으면 1분 후 재시작) |
| `install-task.ps1` | 작업 스케줄러 등록/해제 |
| `.env.example` | 설정 예시 (`.env` 는 Git 에 안 올라감) |

테스트: `node --test tests/sms/worker.test.mjs` / `npx tsx --test tests/sms/outbox.test.ts`
