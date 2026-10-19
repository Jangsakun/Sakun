"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type SignaturePadType from "signature_pad";
import {
  WORK_DAYS,
  WORK_DAY_LABELS,
  formatNetHours,
  validateContractInput,
  type ContractInput,
  type Issue,
  type WorkDay,
} from "@/app/lib/contracts/validation";
import { calcContractEnd, isSaturdayOnlyWeek } from "@/app/lib/contracts/period";

// 근로자 앱 — 근로계약서 작성·서명.
//   ① 작성(입력 즉시 검사) → ② 미리보기(끝까지 스크롤) → ③ 서명 → ④ 완료(내려받기)
// 검사 규칙은 서버와 같은 모듈(app/lib/contracts/validation.ts)을 씁니다.
// 서버가 서명 직전에 한 번 더 검사하므로 화면 검사만 믿지 않습니다.

type Identity = { name: string; birthDate: string; phoneLast4: string };

type CurrentContract = {
  id: number;
  kind: "week" | "month11";
  triggerReason: string;
  title: string;
  printedHourlyWage: number;
  employeeHourlyWage: number | null;
  minimumWages: Record<string, number | null>;
  fixedStartDate: string | null;
  today: string;
  entity: { business_name: string; representative: string; address: string };
  workplace: string;
  prefill: ContractInput & { residentNumberIsMasked: boolean };
};

type Step = "form" | "preview" | "sign" | "done";

function readIdentity(): Identity | null {
  try {
    const stored = JSON.parse(localStorage.getItem("employee") || "null");
    if (!stored?.name || !stored?.birthDate || !stored?.phoneLast4) return null;
    return { name: stored.name, birthDate: stored.birthDate, phoneLast4: stored.phoneLast4 };
  } catch {
    return null;
  }
}

async function post(path: string, body: Record<string, unknown>) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
}

const PREVIEW_ZOOM = 1.8;

const addDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function ContractPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [contract, setContract] = useState<CurrentContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [input, setInput] = useState<ContractInput | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const startedRef = useRef(false);

  // 미리보기
  const [previewSha, setPreviewSha] = useState("");
  const [warningCodes, setWarningCodes] = useState<string[]>([]);
  const [warningAck, setWarningAck] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const zoomedRef = useRef(false);

  // 휴대폰에서는 계약서 글씨가 작아서 크게 보기(가로로도 움직여 읽기)를 둡니다. 다시 그리지 않고 표시 크기만 바꿉니다.
  const toggleZoom = () => {
    const box = previewBoxRef.current;
    const next = !zoomedRef.current;

    zoomedRef.current = next;
    setZoomed(next);

    if (!box) return;

    const ratioY = box.scrollHeight ? box.scrollTop / box.scrollHeight : 0;

    box.querySelectorAll("canvas").forEach((c) => {
      (c as HTMLCanvasElement).style.width = next ? `${PREVIEW_ZOOM * 100}%` : "100%";
    });
    box.scrollTop = ratioY * box.scrollHeight;
    box.scrollLeft = 0;
  };

  // 서명
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadType | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);
  const [signedId, setSignedId] = useState<number | null>(null);

  const maskedPrefill = contract?.prefill.residentNumberIsMasked ? contract.prefill.residentNumber : "";

  // ── 불러오기 ────────────────────────────────────────────
  useEffect(() => {
    const id = readIdentity();

    if (!id) {
      router.push("/register-device");
      return;
    }

    setIdentity(id);

    (async () => {
      try {
        const res = await post("/api/worker/econtract/current", id);
        const json = await res.json();

        if (!json.success) {
          setLoadError(json.message || "계약서를 불러오지 못했습니다.");
          return;
        }

        if (json.contract) {
          setContract(json.contract);
          const { residentNumberIsMasked: _ignored, ...prefill } = json.contract.prefill;
          void _ignored;
          setInput(prefill);
        }
      } catch {
        setLoadError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // ── 입력 즉시 검사(화면용) ───────────────────────────────
  const validation = useMemo(() => {
    if (!contract || !input) return null;

    return validateContractInput(input, {
      kind: contract.kind,
      today: contract.today,
      minimumWageForYear: (y) => contract.minimumWages[String(y)] ?? null,
      printedHourlyWage: contract.printedHourlyWage,
      employeeHourlyWage: contract.employeeHourlyWage,
      startDateFixed: Boolean(contract.fixedStartDate),
      workplace: contract.workplace,
    });
  }, [contract, input]);

  // 가린 주민번호를 그대로 두면 서버가 등록된 번호로 검사합니다. 화면에서는 그 칸 검사를 건너뜁니다.
  const usingStoredRrn = Boolean(maskedPrefill) && input?.residentNumber === maskedPrefill;
  const clientErrors = (validation?.errors ?? []).filter((e) => !(usingStoredRrn && e.field === "residentNumber"));
  const allErrors = [...clientErrors, ...serverIssues.filter((s) => !clientErrors.some((c) => c.code === s.code && c.field === s.field))];
  const errorFor = (field: string) => allErrors.filter((e) => e.field === field);

  const endDate = input?.startDate ? calcContractEnd(contract?.kind ?? "month11", input.startDate, contract?.workplace) : null;

  const update = (patch: Partial<ContractInput>) => {
    setInput((prev) => (prev ? { ...prev, ...patch } : prev));
    setServerIssues([]);

    if (!startedRef.current && contract && identity) {
      startedRef.current = true;
      post("/api/worker/econtract/event", { ...identity, contractId: contract.id, type: "input_started" }).catch(() => {});
    }
  };

  // ── 미리보기 ────────────────────────────────────────────
  const openPreview = async () => {
    if (!contract || !identity || !input) return;

    setBusy(true);
    setNotice("");

    try {
      const res = await post("/api/worker/econtract/preview", { ...identity, contractId: contract.id, input });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setServerIssues([...(json.errors ?? [])]);
        setNotice(json.message || "미리보기를 만들지 못했습니다.");
        return;
      }

      const sha = res.headers.get("X-Document-Sha256") || "";
      const codes = (res.headers.get("X-Warning-Codes") || "").split(",").filter(Boolean);
      const bytes = new Uint8Array(await res.arrayBuffer());

      setPreviewSha(sha);
      setWarningCodes(codes);
      setWarningAck(codes.length === 0);
      setReadToEnd(false);
      setPreviewBytes(bytes);
      setStep("preview");
    } catch (error) {
      console.error(error);
      setNotice("미리보기를 여는 중 문제가 생겼습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  // 미리보기 단계 화면이 그려진 뒤에 PDF 를 그림으로 그립니다.
  // 휴대폰 브라우저의 PDF 보기는 기종마다 달라서(안드로이드는 내려받기로 넘어감) 직접 그립니다.
  useEffect(() => {
    if (step !== "preview" || !previewBytes) return;

    let cancelled = false;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ data: previewBytes.slice() }).promise;
        const box = previewBoxRef.current;

        if (!box || cancelled) return;

        box.innerHTML = "";

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const width = Math.min(box.clientWidth - 16 || 360, 820);
          const base = page.getViewport({ scale: 1 });
          // "크게 보기"(PREVIEW_ZOOM 배)에서도 흐리지 않게 그 배율까지 감안해 그립니다. 휴대폰 메모리 때문에 화면 배율은 2배까지만.
          const scale = (width / base.width) * Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2) * PREVIEW_ZOOM;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = zoomedRef.current ? `${PREVIEW_ZOOM * 100}%` : "100%";
          canvas.style.maxWidth = "none";
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          canvas.style.background = "#ffffff";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          canvas.setAttribute("data-page", String(i));
          box.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;

          if (cancelled) return;
        }

        box.setAttribute("data-rendered", String(doc.numPages));
        // 한 화면에 다 들어가는 경우도 끝까지 본 것으로 칩니다.
        setTimeout(() => checkScrolledToEnd(), 300);
      } catch (error) {
        console.error(error);
        setNotice("미리보기를 그리는 중 문제가 생겼습니다. 다시 시도해주세요.");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewBytes]);

  const checkScrolledToEnd = useCallback(() => {
    const box = previewBoxRef.current;

    if (!box || readToEnd || !contract || !identity) return;

    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 24) {
      setReadToEnd(true);
      post("/api/worker/econtract/event", {
        ...identity,
        contractId: contract.id,
        type: "preview_read_to_end",
        documentSha256: previewSha,
      }).catch(() => {});
    }
  }, [readToEnd, contract, identity, previewSha]);

  const acknowledgeWarning = (checked: boolean) => {
    setWarningAck(checked);

    if (checked && contract && identity) {
      post("/api/worker/econtract/event", { ...identity, contractId: contract.id, type: "warning_acknowledged", warningCodes }).catch(() => {});
    }
  };

  // ── 서명 ────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "sign" || !canvasRef.current) return;

    let pad: SignaturePadType | null = null;

    (async () => {
      const { default: SignaturePad } = await import("signature_pad");
      const canvas = canvasRef.current!;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")!.scale(ratio, ratio);
      pad = new SignaturePad(canvas, { penColor: "#111133", minWidth: 1, maxWidth: 2.6 });
      pad.addEventListener("endStroke", () => setHasSignature(!pad!.isEmpty()));
      padRef.current = pad;
    })();

    return () => {
      pad?.off();
      padRef.current = null;
    };
  }, [step]);

  const clearSignature = () => {
    padRef.current?.clear();
    setHasSignature(false);
  };

  const submitSignature = async () => {
    if (!contract || !identity || !input || !padRef.current || padRef.current.isEmpty()) return;

    setBusy(true);
    setNotice("");

    try {
      const res = await post("/api/worker/econtract/sign", {
        ...identity,
        contractId: contract.id,
        input,
        signature: padRef.current.toDataURL("image/png"),
        consent,
        warningAcknowledged: warningAck,
      });
      const json = await res.json();

      if (!json.success) {
        if (json.errors?.length) {
          setServerIssues(json.errors);
          setStep("form");
        }

        setNotice(json.message || "서명하지 못했습니다.");
        return;
      }

      setSignedId(json.contractId);
      setStep("done");
    } catch {
      setNotice("서명 중 문제가 생겼습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (contractId: number) => {
    if (!identity) return;

    const res = await post("/api/worker/econtract/download", { ...identity, contractId });
    const json = await res.json();

    if (json.success) {
      window.location.href = json.url;
    } else {
      alert(json.message || "내려받지 못했습니다.");
    }
  };

  // ── 화면 ────────────────────────────────────────────────
  if (loading) {
    return <Shell><p className="text-center text-gray-500 py-10">불러오는 중...</p></Shell>;
  }

  if (loadError) {
    return (
      <Shell>
        <p className="text-red-600 font-bold py-6">{loadError}</p>
        <button className={btnGhost} onClick={() => router.push("/")}>홈으로</button>
      </Shell>
    );
  }

  if (!contract || !input) {
    return (
      <Shell>
        <p className="text-gray-700 py-6">지금 작성할 근로계약서가 없습니다.</p>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => router.push("/")}>홈으로</button>
          <button className={btnGhost} onClick={() => router.push("/contract/mine")}>내 계약서</button>
        </div>
      </Shell>
    );
  }

  const isWeek = contract.kind === "week";
  const net = validation?.derived.dailyNetMinutes;
  const weekly = validation?.derived.weeklyNetMinutes;

  if (step === "done") {
    return (
      <Shell>
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-xl font-extrabold mb-2">근로계약서 서명이 완료되었습니다</h2>
          {/* 2026-10-17 서명 후 PDF 를 받다 출근을 안 찍은 사례가 많아, 출근을 먼저 안내합니다. */}
          <div className="mb-5 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-left">
            <p className="text-[15px] font-extrabold text-red-700">⚠️ 아직 출근이 기록되지 않았습니다</p>
            <p className="mt-1 text-sm leading-6 text-red-700">
              아래 <b>&ldquo;출근하러 가기&rdquo;</b>를 눌러 출퇴근 화면에서 <b>출근 버튼</b>을 꼭 눌러주세요.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button className={btnBig} onClick={() => router.push("/")}>출근하러 가기</button>
            <button className={btnGhost} onClick={() => signedId && download(signedId)}>계약서 내려받기 (PDF)</button>
          </div>
          <p className="mt-4 text-xs leading-5 text-gray-500">
            서명한 계약서는 문자로 받은 링크나 앱의 &ldquo;내 계약서&rdquo;에서 언제든 다시 받을 수 있습니다.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-extrabold mb-1">{contract.title}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {stepLabel(step)} · {isWeek ? "1주 계약" : "11개월 계약"}
      </p>

      {notice && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{notice}</div>}

      {step === "form" && (
        <div className="flex flex-col gap-4">
          <ReadOnly label="사업주" value={`${contract.entity.business_name} · 대표 ${contract.entity.representative}`} />
          <ReadOnly label="시급" value={`1시간당 ${contract.printedHourlyWage.toLocaleString()}원 (계약서에 인쇄된 금액)`} errors={errorFor("hourlyWage")} />

          <Field label="성명" errors={errorFor("name")}>
            <input className={inputCls} value={input.name} onChange={(e) => update({ name: e.target.value })} autoComplete="name" />
          </Field>

          <Field
            label="주민등록번호 (외국인등록번호)"
            errors={errorFor("residentNumber")}
            hint={usingStoredRrn ? "가입할 때 등록한 번호를 사용합니다. 다르면 바꾸기를 누르고 13자리를 새로 입력하세요." : "숫자 13자리 (하이픈은 자동)"}
          >
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={input.residentNumber}
                readOnly={usingStoredRrn}
                onChange={(e) => update({ residentNumber: e.target.value })}
                inputMode="numeric"
                autoComplete="off"
              />
              {usingStoredRrn && (
                <button type="button" className={btnGhost + " shrink-0"} onClick={() => update({ residentNumber: "" })}>
                  바꾸기
                </button>
              )}
            </div>
          </Field>
          {(validation?.warnings ?? []).filter((w) => !usingStoredRrn || w.field !== "residentNumber").map((w) => (
            <p key={w.code} className="-mt-2 text-xs font-bold text-amber-700">⚠️ {w.message}</p>
          ))}

          <Field label="연락처" errors={errorFor("phone")}>
            <input className={inputCls} value={input.phone} onChange={(e) => update({ phone: e.target.value })} inputMode="tel" placeholder="010-0000-0000" />
          </Field>

          <Field label="주소" errors={errorFor("address")}>
            <input className={inputCls} value={input.address} onChange={(e) => update({ address: e.target.value })} placeholder="도로명 주소" />
          </Field>

          <Field
            label="계약 시작일"
            errors={errorFor("startDate")}
            hint={contract.fixedStartDate ? "11개월 갱신은 직전 계약 만료일 다음 날부터 시작합니다." : undefined}
          >
            <input
              type="date"
              className={inputCls}
              value={input.startDate}
              min={addDays(contract.today, -29)}
              max={addDays(contract.today, 59)}
              disabled={Boolean(contract.fixedStartDate)}
              onChange={(e) => {
                const startDate = e.target.value;

                // 장사꾼 1주 계약: 토요일 시작이면 토요일 하루 계약 → 근무 요일도 토요일로 맞춥니다.
                if (isWeek && isSaturdayOnlyWeek(startDate, contract.workplace)) {
                  update({ startDate, workDays: ["sat"] });
                } else if (isWeek && isSaturdayOnlyWeek(input.startDate, contract.workplace)) {
                  update({ startDate, workDays: ["mon", "tue", "wed", "thu", "fri"] });
                } else {
                  update({ startDate });
                }
              }}
            />
          </Field>
          <ReadOnly label="계약 종료일 (자동)" value={endDate ?? "-"} />

          {isWeek ? (
            <>
              <Field label="근무 요일" errors={errorFor("workDays")}>
                <div className="flex flex-wrap gap-2">
                  {WORK_DAYS.map((d) => {
                    const on = input.workDays?.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          update({ workDays: on ? input.workDays!.filter((x) => x !== d) : [...(input.workDays ?? []), d] as WorkDay[] })
                        }
                        className={`h-11 w-11 rounded-full text-sm font-extrabold border ${on ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}
                      >
                        {WORK_DAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="시업" errors={errorFor("workStart")}>
                  <input type="time" step={600} className={inputCls} value={input.workStart} onChange={(e) => update({ workStart: e.target.value })} />
                </Field>
                <Field label="종업" errors={errorFor("workEnd")}>
                  <input type="time" step={600} className={inputCls} value={input.workEnd} onChange={(e) => update({ workEnd: e.target.value })} />
                </Field>
                <Field label="휴게 시작" errors={errorFor("breakStart")}>
                  <input type="time" step={600} className={inputCls} value={input.breakStart} onChange={(e) => update({ breakStart: e.target.value })} />
                </Field>
                <Field label="휴게 끝" errors={errorFor("breakEnd")}>
                  <input type="time" step={600} className={inputCls} value={input.breakEnd} onChange={(e) => update({ breakEnd: e.target.value })} />
                </Field>
              </div>
              {net != null && net > 0 && (
                <p className="-mt-2 text-xs text-gray-600">
                  하루 실근로 {formatNetHours(net)}시간 · 주 {weekly != null ? formatNetHours(weekly) : "-"}시간 (체크한 요일 칸에 똑같이 들어갑니다)
                </p>
              )}
              <Field label="특이사항 (선택)">
                <input className={inputCls} value={input.note} maxLength={20} onChange={(e) => update({ note: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="용역 범위 · 기타 (선택)" hint="계약서 제3조 '2. 기타 (   )' 칸">
              <input className={inputCls} value={input.serviceScopeOther} maxLength={40} onChange={(e) => update({ serviceScopeOther: e.target.value })} />
            </Field>
          )}

          <button className={btnBig} disabled={busy || clientErrors.length > 0} onClick={openPreview}>
            {busy ? "확인 중..." : clientErrors.length > 0 ? `고칠 칸 ${clientErrors.length}개` : "계약서 미리보기"}
          </button>
          <button
            type="button"
            className="py-2 text-sm font-bold text-gray-500 underline"
            onClick={() => {
              // 출근을 막지 않기로 했으므로(2026-10-14) 나중에 작성할 수 있게 합니다. 30분간 다시 안 띄움.
              try {
                sessionStorage.setItem("econtract_deferred_at", String(Date.now()));
              } catch {}
              router.push("/");
            }}
          >
            나중에 작성하고 출퇴근 화면으로
          </button>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700">계약서를 <b>끝까지</b> 내려서 읽어주세요.</p>
            <button type="button" className="h-10 shrink-0 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700" onClick={toggleZoom}>
              {zoomed ? "화면에 맞추기" : "🔍 크게 보기"}
            </button>
          </div>
          {/* 휴대폰 주소창·하단 버튼까지 한 화면에 들어오게 화면 높이(dvh)에서 위아래 몫을 뺍니다. */}
          <div
            ref={previewBoxRef}
            onScroll={checkScrolledToEnd}
            className="h-[calc(100dvh-260px)] min-h-[300px] overflow-auto overscroll-contain rounded-xl border border-gray-200 bg-gray-100 p-1.5"
          />
          {warningCodes.length > 0 && (
            <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={warningAck} onChange={(e) => acknowledgeWarning(e.target.checked)} />
              <span>주민등록번호를 다시 확인해 주세요. 번호가 맞다면 체크하고 진행하세요. (2020년 10월 이후 발급·변경된 번호는 안내가 뜰 수 있습니다)</span>
            </label>
          )}
          <div className={bottomBar}>
            <button className={btnGhost} onClick={() => setStep("form")}>고치기</button>
            <button className={btnPrimary + " flex-1"} disabled={!readToEnd || !warningAck} onClick={() => setStep("sign")}>
              {readToEnd ? "다음: 서명하기" : "끝까지 읽어주세요"}
            </button>
          </div>
        </div>
      )}

      {step === "sign" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700">아래 칸에 손가락으로 서명해주세요.</p>
          <div className="relative rounded-xl border-2 border-dashed border-gray-300 bg-white">
            <canvas ref={canvasRef} className="block h-48 w-full touch-none" />
            {!hasSignature && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-300">여기에 서명</span>}
          </div>
          <button className={btnGhost} onClick={clearSignature}>다시 쓰기</button>
          <label className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 text-[15px] font-bold">
            <input type="checkbox" className="h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            위 내용에 동의하며 서명합니다
          </label>
          <div className={bottomBar}>
            <button className={btnGhost} onClick={() => setStep("preview")}>뒤로</button>
            <button className={btnPrimary + " flex-1"} disabled={busy || !hasSignature || !consent} onClick={submitSignature}>
              {busy ? "서명 처리 중..." : "서명 확정"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function stepLabel(step: Step) {
  return { form: "1. 작성", preview: "2. 미리보기", sign: "3. 서명", done: "완료" }[step];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f5f5f7] text-black px-2 py-3 sm:px-4 sm:py-6 [color-scheme:light]">
      <div className="mx-auto w-full max-w-[560px] rounded-[24px] bg-white px-4 py-5 shadow sm:px-5 sm:py-6">{children}</div>
    </main>
  );
}

function Field({ label, errors = [], hint, children }: { label: string; errors?: Issue[]; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-extrabold text-gray-800">{label}</label>
      {children}
      {hint && errors.length === 0 && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {errors.map((e) => (
        <p key={e.code} className="mt-1 text-xs font-bold text-red-600">{e.message}</p>
      ))}
    </div>
  );
}

function ReadOnly({ label, value, errors = [] }: { label: string; value: string; errors?: Issue[] }) {
  return (
    <div>
      <div className="mb-1 text-sm font-extrabold text-gray-800">{label}</div>
      <div className="rounded-xl bg-gray-100 px-3 py-3 text-sm text-gray-700">{value}</div>
      {errors.map((e) => (
        <p key={e.code} className="mt-1 text-xs font-bold text-red-600">{e.message}</p>
      ))}
    </div>
  );
}

// 아이폰 사파리는 날짜·시간 칸이 너비를 무시하고 옆으로 삐져나오므로 appearance-none + min-w-0 + 왼쪽 정렬.
const inputCls =
  "block h-12 w-full min-w-0 appearance-none rounded-xl border border-gray-300 bg-white px-3 text-left text-[16px] text-black outline-none focus:border-black disabled:bg-gray-100 disabled:text-gray-500 [&::-webkit-date-and-time-value]:text-left";
// 세로로 쌓는 곳에서 flex-1 을 주면 높이가 글자 높이로 눌리므로, 가로 줄에서만 " flex-1" 을 붙여 씁니다.
const btnPrimary = "h-12 shrink-0 rounded-xl bg-black px-4 text-[15px] font-extrabold text-white disabled:bg-gray-300";
const btnBig = "h-14 w-full shrink-0 rounded-2xl bg-black px-4 text-[17px] font-extrabold text-white disabled:bg-gray-300";
const btnGhost = "h-12 shrink-0 rounded-xl border border-gray-300 bg-white px-4 text-[15px] font-bold text-gray-700";
// 미리보기·서명 단계의 하단 버튼은 화면 아래에 붙여 둡니다(긴 화면에서도 안 잘리게).
const bottomBar = "sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:-mx-5 sm:px-5";
