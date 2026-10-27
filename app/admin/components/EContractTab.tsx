"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { getWorkplaceBadgeColor } from "@/app/lib/workplaceBadge";

// 관리자 "전자계약" 탭.
//   서명 대기 / 1주 연속 계약 경고 / 계약서 목록(과거 포함, PDF 보기·무효) / 연도별 최저시급
// 주민번호는 서버가 가린 값만 보내 줍니다.

type ContractRow = {
  id: number;
  employee_id: number;
  employee_name: string;
  workplace_name: string;
  kind: "week" | "month11";
  status: "pending" | "signed" | "void" | "ended";
  trigger_reason: string;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  signed_pdf_sha256: string | null;
  void_reason: string | null;
  voided_at: string | null;
  ended_at: string | null;
  created_at: string;
  resident_number_masked: string | null;
  entity: { business_name: string } | null;
  template: { code: string; title: string } | null;
  sms?: SmsInfo | null;
  link?: LinkInfo | null;
};

type SmsInfo = {
  id: number;
  status: "queued" | "sending" | "sent" | "failed" | "unknown" | "cancelled";
  result_code: string | null;
  result_message: string | null;
  to_phone_masked: string;
  dry_run: boolean;
  created_at: string;
  sent_at: string | null;
};

type LinkInfo = {
  expires_at: string;
  locked_at: string | null;
  revoked_at: string | null;
  failed_attempts: number;
  last_used_at: string | null;
};

type WeekStreak = { employeeId: number; employeeName: string; count: number; from: string; to: string };
type MinimumWage = { year: number; hourly_wage: number; note: string | null; updated_at: string };

type ApiResponse = {
  success: boolean;
  message?: string;
  contracts?: ContractRow[];
  pending?: ContractRow[];
  weekStreaks?: WeekStreak[];
  minimumWages?: MinimumWage[];
  smsReady?: boolean;
};

const SMS_LABEL: Record<SmsInfo["status"], { text: string; color: string; backgroundColor: string }> = {
  queued: { text: "발송 대기", color: "#1e40af", backgroundColor: "#dbeafe" },
  sending: { text: "발송 중", color: "#1e40af", backgroundColor: "#dbeafe" },
  sent: { text: "발송 완료", color: "#166534", backgroundColor: "#dcfce7" },
  failed: { text: "발송 실패", color: "#b91c1c", backgroundColor: "#fee2e2" },
  unknown: { text: "확인 필요", color: "#92400e", backgroundColor: "#fef3c7" },
  cancelled: { text: "취소됨", color: "#475569", backgroundColor: "#f1f5f9" },
};

function smsSubText(sms: SmsInfo, link: LinkInfo | null | undefined) {
  const parts = [sms.to_phone_masked];

  if (sms.dry_run) parts.push("모의 발송(실제 안 나감)");
  if (sms.status === "failed" || sms.status === "unknown") parts.push(sms.result_message || sms.result_code || "");
  if (link?.locked_at) parts.push("링크 잠김(5회 틀림)");
  else if (link && !link.revoked_at && Date.parse(link.expires_at) < Date.now()) parts.push("링크 만료");
  else if (link?.last_used_at) parts.push("내려받음");

  return parts.filter(Boolean);
}

const STATUS_LABEL: Record<ContractRow["status"], string> = {
  pending: "서명 대기",
  signed: "서명 완료",
  void: "무효",
  ended: "종료",
};

const STATUS_COLOR: Record<ContractRow["status"], { color: string; backgroundColor: string }> = {
  pending: { color: "#92400e", backgroundColor: "#fef3c7" },
  signed: { color: "#166534", backgroundColor: "#dcfce7" },
  void: { color: "#b91c1c", backgroundColor: "#fee2e2" },
  ended: { color: "#475569", backgroundColor: "#f1f5f9" },
};

const TRIGGER_LABEL: Record<string, string> = {
  signup: "신규 가입",
  type_change: "당근→고정 전환",
  renewal: "11개월 갱신",
  week_expired: "1주 만료 후 재출근",
  reissue: "무효 후 재작성",
};

const KIND_LABEL = { week: "1주", month11: "11개월" } as const;

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPeriod(row: ContractRow) {
  if (!row.start_date) return "-";
  return `${row.start_date} ~ ${row.end_date ?? "?"}`;
}

export default function EContractTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractRow["status"]>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [wageYear, setWageYear] = useState(String(new Date().getFullYear() + 1));
  const [wageValue, setWageValue] = useState("");
  const [wageNote, setWageNote] = useState("");
  const [wageSaving, setWageSaving] = useState(false);

  // 현장 직원 PIN (당근 1주 → 고정 11개월 현장 전환용, 2026-10-27). PIN 자체는 서버에서 내려오지 않습니다.
  const [fieldPin, setFieldPin] = useState<{ ready: boolean; configured: boolean; updatedAt: string | null } | null>(null);
  const [fieldPinInput, setFieldPinInput] = useState("");
  const [fieldPinSaving, setFieldPinSaving] = useState(false);

  const loadFieldPin = useCallback(async () => {
    try {
      const json = await (await fetch("/api/admin/field-pin", { cache: "no-store" })).json();
      if (json.success) setFieldPin({ ready: json.ready, configured: json.configured, updatedAt: json.updatedAt ?? null });
    } catch {
      // 상태만 못 보여줄 뿐 다른 기능에는 영향 없음
    }
  }, []);

  useEffect(() => {
    loadFieldPin();
  }, [loadFieldPin]);

  const saveFieldPin = async () => {
    try {
      setFieldPinSaving(true);
      const res = await fetch("/api/admin/field-pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: fieldPinInput }),
      });
      const json = await res.json();
      alert(json.message || (json.success ? "저장했습니다." : "저장 실패"));

      if (json.success) {
        setFieldPinInput("");
        await loadFieldPin();
      }
    } catch (error) {
      console.error(error);
      alert("PIN 저장 중 오류 발생");
    } finally {
      setFieldPinSaving(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/econtracts", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      setData(json);
      setMessage(json.success ? "" : json.message || "불러오기 실패");
    } catch (error) {
      console.error(error);
      setMessage("서버 요청 중 오류 발생");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const contracts = useMemo(() => {
    const keyword = search.trim();

    return (data?.contracts ?? []).filter(
      (row) =>
        (statusFilter === "all" || row.status === statusFilter) &&
        (!keyword || row.employee_name.includes(keyword))
    );
  }, [data, statusFilter, search]);

  const openPdf = async (row: ContractRow, download: boolean) => {
    try {
      setBusyId(row.id);
      const res = await fetch(`/api/admin/econtracts/${row.id}/pdf${download ? "?download=1" : ""}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.success) {
        alert(json.message || "PDF 를 열 수 없습니다.");
        return;
      }

      window.open(json.url, "_blank", "noopener");
    } catch (error) {
      console.error(error);
      alert("PDF 를 여는 중 오류 발생");
    } finally {
      setBusyId(null);
    }
  };

  const voidContract = async (row: ContractRow) => {
    const reason = window.prompt(
      `${row.employee_name} 님 ${KIND_LABEL[row.kind]} 계약서(${STATUS_LABEL[row.status]})를 무효 처리합니다.\n` +
        "무효 처리하면 되돌릴 수 없고, 근로자가 다음에 앱을 열 때 계약서를 새로 작성하게 됩니다.\n\n무효 사유를 입력하세요."
    );

    if (reason === null) return;

    if (!reason.trim()) {
      alert("무효 사유를 입력해야 합니다.");
      return;
    }

    try {
      setBusyId(row.id);
      const res = await fetch(`/api/admin/econtracts/${row.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = await res.json();
      alert(json.message || (json.success ? "무효 처리했습니다." : "무효 처리 실패"));
      await load();
    } catch (error) {
      console.error(error);
      alert("무효 처리 중 오류 발생");
    } finally {
      setBusyId(null);
    }
  };

  // 서명대기(테스트 정리용)와 무효 계약서(2026-10-27)만 삭제. 서명 완료·종료는 지우지 않고 무효 처리합니다.
  const deleteContract = async (row: ContractRow) => {
    if (row.status !== "pending" && row.status !== "void") return;

    const ok = window.confirm(
      row.status === "void"
        ? `${row.employee_name} 님 ${KIND_LABEL[row.kind]} 무효 계약서를 삭제합니다.\n` +
            "서명본 PDF·서명 이미지·서명 증거 기록·문자 기록까지 모두 지워지고 되돌릴 수 없습니다.\n" +
            "분쟁이 생겼을 때 증거로 쓸 수 없게 됩니다.\n\n삭제할까요?"
        : `${row.employee_name} 님 ${KIND_LABEL[row.kind]} 서명대기 계약서를 삭제합니다.\n` +
            "삭제하면 되돌릴 수 없고, 이 근로자에게는 계약서 작성 화면이 더 이상 뜨지 않습니다.\n" +
            "(실제 근로자라면 삭제 대신 그대로 두세요.)\n\n삭제할까요?"
    );

    if (!ok) return;

    try {
      setBusyId(row.id);
      const res = await fetch(`/api/admin/econtracts/${row.id}`, { method: "DELETE" });
      const json = await res.json();
      alert(json.message || (json.success ? "삭제했습니다." : "삭제 실패"));
      await load();
    } catch (error) {
      console.error(error);
      alert("삭제 중 오류 발생");
    } finally {
      setBusyId(null);
    }
  };

  // 서명본 다운로드 링크 문자 재발송. 먼저 받는 번호(가린 값)를 보여주고 확인받습니다.
  const resendLink = async (row: ContractRow) => {
    try {
      setBusyId(row.id);
      const target = await (await fetch(`/api/admin/econtracts/${row.id}/resend-link`, { cache: "no-store" })).json();

      if (!target.success) {
        alert(target.message || "받는 번호를 확인할 수 없습니다.");
        return;
      }

      const ok = window.confirm(
        `${row.employee_name} 님에게 서명본 다운로드 링크 문자를 다시 보냅니다.\n받는 번호: ${target.phoneMasked}\n\n` +
          "새 링크(30일 유효)가 만들어지고, 이전에 보낸 링크는 더 이상 열리지 않습니다.\n보낼까요?"
      );

      if (!ok) return;

      const res = await fetch(`/api/admin/econtracts/${row.id}/resend-link`, { method: "POST" });
      const json = await res.json();
      alert(json.message || (json.success ? "재발송을 요청했습니다." : "재발송 실패"));
      await load();
    } catch (error) {
      console.error(error);
      alert("재발송 중 오류 발생");
    } finally {
      setBusyId(null);
    }
  };

  const saveWage = async () => {
    try {
      setWageSaving(true);
      const res = await fetch("/api/admin/minimum-wages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(wageYear), hourlyWage: wageValue, note: wageNote }),
      });
      const json = await res.json();
      alert(json.message || (json.success ? "저장했습니다." : "저장 실패"));

      if (json.success) {
        setWageValue("");
        setWageNote("");
        await load();
      }
    } catch (error) {
      console.error(error);
      alert("저장 중 오류 발생");
    } finally {
      setWageSaving(false);
    }
  };

  if (loading && !data) {
    return <div style={emptyStyle}>불러오는 중...</div>;
  }

  const pending = data?.pending ?? [];
  const streaks = data?.weekStreaks ?? [];
  const wages = data?.minimumWages ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {message && <div style={errorBoxStyle}>{message}</div>}

      <section>
        <h3 style={sectionTitleStyle}>서명 대기 ({pending.length}명)</h3>
        <p style={hintStyle}>
          계약서 작성 화면이 떠야 하는데 아직 서명하지 않은 근로자입니다. 신규 가입자부터 대상이며 기존 직원은 포함되지 않습니다.
        </p>
        {pending.length === 0 ? (
          <div style={emptyStyle}>서명 대기 중인 근로자가 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>사업장</th>
                  <th style={thStyle}>계약 종류</th>
                  <th style={thStyle}>필요해진 이유</th>
                  <th style={thStyle}>생성 시각</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.employee_name}</td>
                    <td style={tdStyle}>
                      <span style={{ ...badgeStyle, ...getWorkplaceBadgeColor(row.workplace_name) }}>{row.workplace_name}</span>
                    </td>
                    <td style={tdStyle}>{KIND_LABEL[row.kind]}</td>
                    <td style={tdStyle}>{TRIGGER_LABEL[row.trigger_reason] ?? row.trigger_reason}</td>
                    <td style={tdStyle}>{formatDateTime(row.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button style={dangerButtonStyle} disabled={busyId === row.id} onClick={() => voidContract(row)}>
                          무효
                        </button>
                        <button style={deleteButtonStyle} disabled={busyId === row.id} onClick={() => deleteContract(row)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {streaks.length > 0 && (
        <section style={warnBoxStyle}>
          <strong>⚠️ 1주 계약이 공백 없이 4회 이상 이어진 근로자</strong>
          <p style={{ ...hintStyle, color: "#92400e" }}>
            1주 계약을 계속 이어 쓰면 기간을 정하지 않은 계약으로 볼 여지가 있습니다. 고용구분(고정 전환)을 검토해 주세요.
          </p>
          <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
            {streaks.map((s) => (
              <li key={`${s.employeeId}-${s.from}`}>
                {s.employeeName} — {s.count}회 연속 ({s.from} ~ {s.to})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 style={sectionTitleStyle}>계약서 목록</h3>
        <div style={toolbarStyle}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={inputStyle}>
            <option value="all">전체 상태</option>
            <option value="pending">서명 대기</option>
            <option value="signed">서명 완료</option>
            <option value="ended">종료</option>
            <option value="void">무효</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 검색" style={inputStyle} />
          <button style={ghostButtonStyle} onClick={load}>
            새로고침
          </button>
        </div>
        {contracts.length === 0 ? (
          <div style={emptyStyle}>계약서가 없습니다.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>주민번호</th>
                  <th style={thStyle}>사업장</th>
                  <th style={thStyle}>명의</th>
                  <th style={thStyle}>종류</th>
                  <th style={thStyle}>계약기간</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>서명 시각</th>
                  {data?.smsReady && <th style={thStyle}>서명본 문자</th>}
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.employee_name}</td>
                    <td style={nowrapTdStyle}>{row.resident_number_masked || "-"}</td>
                    <td style={tdStyle}>
                      <span style={{ ...badgeStyle, ...getWorkplaceBadgeColor(row.workplace_name) }}>{row.workplace_name}</span>
                    </td>
                    <td style={nowrapTdStyle}>{row.entity?.business_name ?? "-"}</td>
                    <td style={tdStyle}>{KIND_LABEL[row.kind]}</td>
                    <td style={nowrapTdStyle}>{formatPeriod(row)}</td>
                    <td style={tdStyle}>
                      <span style={{ ...badgeStyle, ...STATUS_COLOR[row.status] }}>{STATUS_LABEL[row.status]}</span>
                      {row.status === "void" && row.void_reason && <div style={subTextStyle}>사유: {row.void_reason}</div>}
                    </td>
                    <td style={nowrapTdStyle}>{formatDateTime(row.signed_at)}</td>
                    {data?.smsReady && (
                      <td style={tdStyle}>
                        {row.sms ? (
                          <>
                            <span style={{ ...badgeStyle, color: SMS_LABEL[row.sms.status].color, backgroundColor: SMS_LABEL[row.sms.status].backgroundColor }}>
                              {SMS_LABEL[row.sms.status].text}
                            </span>
                            {smsSubText(row.sms, row.link).map((text) => (
                              <div key={text} style={{ ...subTextStyle, whiteSpace: "nowrap" }}>
                                {text}
                              </div>
                            ))}
                          </>
                        ) : row.signed_pdf_sha256 ? (
                          <span style={subTextStyle}>보낸 적 없음</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    )}
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "nowrap" }}>
                        {row.signed_pdf_sha256 && (
                          <>
                            <button style={ghostButtonStyle} disabled={busyId === row.id} onClick={() => openPdf(row, false)}>
                              PDF 보기
                            </button>
                            <button style={ghostButtonStyle} disabled={busyId === row.id} onClick={() => openPdf(row, true)}>
                              내려받기
                            </button>
                            {data?.smsReady && (row.status === "signed" || row.status === "ended") && (
                              <button style={ghostButtonStyle} disabled={busyId === row.id} onClick={() => resendLink(row)}>
                                문자 재발송
                              </button>
                            )}
                          </>
                        )}
                        {(row.status === "pending" || row.status === "signed") && (
                          <button style={dangerButtonStyle} disabled={busyId === row.id} onClick={() => voidContract(row)}>
                            무효
                          </button>
                        )}
                        {(row.status === "pending" || row.status === "void") && (
                          <button style={deleteButtonStyle} disabled={busyId === row.id} onClick={() => deleteContract(row)}>
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fieldPin?.ready && (
        <section>
          <h3 style={sectionTitleStyle}>현장 직원 PIN</h3>
          <p style={hintStyle}>
            근로자의 1주(당근) 계약서 화면 아래 &ldquo;고정(11개월)으로 전환 — 현장 직원용&rdquo;에서 이 PIN 을 넣으면, 그 자리에서 고용구분이 고정으로 바뀌고
            11개월 계약서 작성으로 넘어갑니다. PIN 으로는 이 전환만 할 수 있습니다. 숫자 4~8자리, 바꾸면 이전 PIN 은 바로 못 씁니다.
          </p>
          <div style={{ ...hintStyle, color: fieldPin.configured ? "#166534" : "#b91c1c", fontWeight: 800 }}>
            {fieldPin.configured ? `설정됨 (마지막 변경 ${formatDateTime(fieldPin.updatedAt)})` : "아직 설정되지 않았습니다 — 설정 전에는 현장 전환이 안 됩니다."}
          </div>
          <div style={toolbarStyle}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={fieldPinInput}
              onChange={(e) => setFieldPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder={fieldPin.configured ? "새 PIN" : "PIN (숫자 4~8자리)"}
              style={{ ...inputStyle, width: "160px" }}
            />
            <button style={solidButtonStyle} disabled={fieldPinSaving || fieldPinInput.length < 4} onClick={saveFieldPin}>
              {fieldPinSaving ? "저장 중..." : fieldPin.configured ? "PIN 변경" : "PIN 저장"}
            </button>
          </div>
        </section>
      )}

      <section>
        <h3 style={sectionTitleStyle}>연도별 최저시급</h3>
        <p style={hintStyle}>
          계약 시작일이 속한 연도의 값으로 검사합니다. 값이 없는 연도에는 계약서를 작성할 수 없으니 새해가 오기 전에 넣어 주세요.
          이미 서명된 계약서에는 영향이 없습니다.
        </p>
        <div style={tableWrapStyle}>
          <table style={{ ...tableStyle, minWidth: "420px" }}>
            <thead>
              <tr>
                <th style={thStyle}>연도</th>
                <th style={thStyle}>최저시급</th>
                <th style={thStyle}>메모</th>
              </tr>
            </thead>
            <tbody>
              {wages.map((w) => (
                <tr key={w.year}>
                  <td style={tdStyle}>{w.year}년</td>
                  <td style={tdStyle}>{w.hourly_wage.toLocaleString()}원</td>
                  <td style={tdStyle}>{w.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ ...toolbarStyle, marginTop: "10px" }}>
          <input value={wageYear} onChange={(e) => setWageYear(e.target.value)} placeholder="연도" style={{ ...inputStyle, width: "90px" }} inputMode="numeric" />
          <input value={wageValue} onChange={(e) => setWageValue(e.target.value)} placeholder="최저시급(원)" style={{ ...inputStyle, width: "130px" }} inputMode="numeric" />
          <input value={wageNote} onChange={(e) => setWageNote(e.target.value)} placeholder="메모(선택)" style={{ ...inputStyle, width: "200px" }} />
          <button style={solidButtonStyle} disabled={wageSaving} onClick={saveWage}>
            {wageSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </section>
    </div>
  );
}

const sectionTitleStyle: CSSProperties = { margin: "0 0 6px", fontSize: "16px", fontWeight: 800, color: "#111827" };
const hintStyle: CSSProperties = { margin: "0 0 10px", fontSize: "12px", color: "#6b7280", lineHeight: 1.5 };
const emptyStyle: CSSProperties = { padding: "18px", textAlign: "center", color: "#9ca3af", fontSize: "13px", background: "#f9fafb", borderRadius: "12px" };
const errorBoxStyle: CSSProperties = { padding: "12px 14px", borderRadius: "12px", background: "#fef2f2", color: "#991b1b", fontSize: "13px", fontWeight: 700 };
const warnBoxStyle: CSSProperties = { padding: "14px 16px", borderRadius: "12px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: "13px" };
const toolbarStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" };
const inputStyle: CSSProperties = { height: "36px", padding: "0 10px", borderRadius: "10px", border: "1px solid #d1d5db", fontSize: "13px", color: "#111827", background: "#ffffff" };
const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1080px", borderCollapse: "collapse", fontSize: "13px" };
const thStyle: CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontWeight: 800, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", color: "#111827", verticalAlign: "middle" };
const nowrapTdStyle: CSSProperties = { ...tdStyle, whiteSpace: "nowrap" };
const subTextStyle: CSSProperties = { marginTop: "3px", fontSize: "11px", color: "#6b7280" };
const badgeStyle: CSSProperties = { display: "inline-flex", padding: "3px 8px", borderRadius: "999px", fontSize: "12px", fontWeight: 800, whiteSpace: "nowrap" };
const ghostButtonStyle: CSSProperties = { height: "30px", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#ffffff", color: "#374151", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...ghostButtonStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" };
const deleteButtonStyle: CSSProperties = { ...ghostButtonStyle, borderColor: "#b91c1c", background: "#b91c1c", color: "#ffffff" };
const solidButtonStyle: CSSProperties = { height: "36px", padding: "0 16px", borderRadius: "10px", border: "none", background: "#111827", color: "#ffffff", fontSize: "13px", fontWeight: 800, cursor: "pointer" };
