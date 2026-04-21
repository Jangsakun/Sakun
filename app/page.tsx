"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Employee = {
  id?: string;
  name: string;
  birthDate: string;
  phoneLast4: string;
};

type AttendanceResponse = {
  success: boolean;
  message: string;
  received?: {
    lat: number;
    lng: number;
    checkedAt: string;
  };
};

type TodayAttendanceResponse = {
  success: boolean;
  today?: {
    checkIn: string | null;
    checkOut: string | null;
    records: {
      id: number;
      record_type: string;
      checked_at: string;
      lat: number;
      lng: number;
    }[];
  };
  message?: string;
};

type ValidateEmployeeResponse = {
  success: boolean;
  exists: boolean;
  message?: string;
  employee?: {
    id?: string;
    name?: string;
  };
};

export default function Home() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [lastCheckInTime, setLastCheckInTime] = useState("");
  const [lastCheckOutTime, setLastCheckOutTime] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [todayRecords, setTodayRecords] = useState<
    {
      id: number;
      record_type: string;
      checked_at: string;
      lat: number;
      lng: number;
    }[]
  >([]);

  const clearEmployeeStorage = () => {
    localStorage.removeItem("employee");
  };

  useEffect(() => {
    const initializeEmployee = async () => {
      const savedEmployee = localStorage.getItem("employee");

      if (!savedEmployee || savedEmployee === "undefined") {
        clearEmployeeStorage();
        router.push("/register-device");
        return;
      }

      try {
        const parsedEmployee: Employee = JSON.parse(savedEmployee);

        if (
          !parsedEmployee?.name ||
          !parsedEmployee?.birthDate ||
          !parsedEmployee?.phoneLast4
        ) {
          clearEmployeeStorage();
          router.push("/register-device");
          return;
        }

        const validateResponse = await fetch("/api/auth/validate-employee", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            name: parsedEmployee.name,
            birthDate: parsedEmployee.birthDate,
            phoneLast4: parsedEmployee.phoneLast4,
          }),
        });

        const validateData: ValidateEmployeeResponse =
          await validateResponse.json();

        if (!validateData.success || !validateData.exists) {
          clearEmployeeStorage();
          alert("등록된 직원 정보가 삭제되어 다시 등록이 필요합니다.");
          router.push("/register-device");
          return;
        }

        setEmployee(parsedEmployee);
        fetchTodayAttendance(parsedEmployee);
      } catch (error) {
        console.error("employee 파싱 또는 검증 에러:", error);
        clearEmployeeStorage();
        router.push("/register-device");
      }
    };

    initializeEmployee();
  }, [router]);

  const fetchTodayAttendance = async (currentEmployee: Employee) => {
    try {
      const response = await fetch("/api/attendance/today", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: currentEmployee.name,
          birthDate: currentEmployee.birthDate,
          phoneLast4: currentEmployee.phoneLast4,
        }),
      });

      const data: TodayAttendanceResponse = await response.json();

      if (data.success && data.today) {
        setLastCheckInTime(
          data.today.checkIn
            ? new Date(data.today.checkIn).toLocaleString("ko-KR")
            : ""
        );
        setLastCheckOutTime(
          data.today.checkOut
            ? new Date(data.today.checkOut).toLocaleString("ko-KR")
            : ""
        );
        setTodayRecords(data.today.records || []);
      }
    } catch (error) {
      console.error("오늘 기록 불러오기 실패:", error);
    }
  };

  const sendAttendance = async (type: "check-in" | "check-out") => {
    if (!employee) {
      alert("직원 정보가 없습니다. 다시 등록해주세요.");
      clearEmployeeStorage();
      router.push("/register-device");
      return;
    }

    if (!navigator.geolocation) {
      alert("GPS를 지원하지 않는 브라우저입니다.");
      return;
    }

    setIsLoading(true);
    setMessage(type === "check-in" ? "출근 처리 중..." : "퇴근 처리 중...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const checkedAt = new Date().toISOString();

        setLocation(
          `위도: ${lat}, 경도: ${lng}, 정확도: ${Math.round(accuracy)}m`
        );

        try {
          const validateResponse = await fetch("/api/auth/validate-employee", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
            body: JSON.stringify({
              name: employee.name,
              birthDate: employee.birthDate,
              phoneLast4: employee.phoneLast4,
            }),
          });

          const validateData: ValidateEmployeeResponse =
            await validateResponse.json();

          if (!validateData.success || !validateData.exists) {
            clearEmployeeStorage();
            alert("등록된 직원 정보가 삭제되어 다시 등록이 필요합니다.");
            setMessage("등록 정보가 없어 다시 등록이 필요합니다.");
            setIsLoading(false);
            router.push("/register-device");
            return;
          }

          const response = await fetch(`/api/attendance/${type}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: employee.name,
              birthDate: employee.birthDate,
              phoneLast4: employee.phoneLast4,
              lat,
              lng,
              checkedAt,
            }),
          });

          const data: AttendanceResponse = await response.json();

          if (data.success) {
            if (type === "check-in") {
              setMessage("출근이 정상 처리되었습니다.");
              setLastCheckInTime(new Date(checkedAt).toLocaleString("ko-KR"));
            } else {
              setMessage("퇴근이 정상 처리되었습니다.");
              setLastCheckOutTime(new Date(checkedAt).toLocaleString("ko-KR"));
            }

            fetchTodayAttendance(employee);
          } else {
            setMessage(data.message || "기록 전송에 실패했습니다.");
          }
        } catch (error) {
          console.error(error);
          setMessage("서버 요청 중 오류가 발생했습니다.");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("geolocation error:", error);

        let errorMessage = "위치를 가져오지 못했습니다.";

        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "위치 권한이 거부되었습니다.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = "현재 위치를 확인할 수 없습니다.";
        } else if (error.code === error.TIMEOUT) {
          errorMessage = "위치 요청 시간이 초과되었습니다.";
        }

        alert(errorMessage);
        setMessage(errorMessage);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  if (!employee) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>불러오는 중...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={titleStyle}>근태관리 시스템</h1>
          <p style={subtitleStyle}>
            <strong>{employee.name}</strong>님, 오늘도 좋은 하루 되세요.
          </p>
        </div>

        <div style={buttonRowStyle}>
          <button
            onClick={() => sendAttendance("check-in")}
            disabled={isLoading}
            style={{
              ...primaryButtonStyle,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "처리 중..." : "출근하기"}
          </button>

          <button
            onClick={() => sendAttendance("check-out")}
            disabled={isLoading}
            style={{
              ...secondaryButtonStyle,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "처리 중..." : "퇴근하기"}
          </button>
        </div>

        <Link href="/worker/payroll" style={payrollLinkStyle}>
          <div style={payrollIconStyle}>💰</div>
          <div>
            <div style={payrollTitleStyle}>근로자 급여조회</div>
            <div style={payrollDescStyle}>
              실시간 주단위 급여 / 날짜별 조회 / 주급 명세서 확인
            </div>
          </div>
        </Link>

        <div style={statusBoxStyle}>
          <div style={statusHeaderStyle}>현재 상태</div>
          <p style={statusTextStyle}>{message || "대기 중"}</p>
        </div>

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>마지막 출근 시간</div>
            <div style={summaryValueStyle}>
              {lastCheckInTime || "아직 없음"}
            </div>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>마지막 퇴근 시간</div>
            <div style={summaryValueStyle}>
              {lastCheckOutTime || "아직 없음"}
            </div>
          </div>
        </div>

        <div style={recordSectionStyle}>
          <div style={recordTitleStyle}>오늘 기록</div>

          {todayRecords.length === 0 ? (
            <div style={emptyRecordStyle}>오늘 기록이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {todayRecords.map((record) => {
                const isCheckIn = record.record_type === "check_in";

                return (
                  <div key={record.id} style={recordItemStyle}>
                    <div
                      style={{
                        ...recordBadgeStyle,
                        backgroundColor: isCheckIn ? "#e8f5e9" : "#e3f2fd",
                        color: isCheckIn ? "#2e7d32" : "#1565c0",
                      }}
                    >
                      {isCheckIn ? "출근" : "퇴근"}
                    </div>

                    <div style={recordTimeStyle}>
                      {new Date(record.checked_at).toLocaleString("ko-KR")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f5f7fb",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
  fontFamily: "sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  backgroundColor: "#ffffff",
  borderRadius: "20px",
  padding: "28px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  fontWeight: 700,
  color: "#111827",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: 0,
  fontSize: "16px",
  color: "#4b5563",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginBottom: "16px",
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "16px 20px",
  border: "none",
  borderRadius: "14px",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontSize: "17px",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "16px 20px",
  border: "1px solid #d1d5db",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontSize: "17px",
  fontWeight: 700,
};

const payrollLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  textDecoration: "none",
  border: "1px solid #dbeafe",
  backgroundColor: "#eff6ff",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "16px",
};

const payrollIconStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  minWidth: "52px",
  borderRadius: "14px",
  backgroundColor: "#dbeafe",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
};

const payrollTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "4px",
};

const payrollDescStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#4b5563",
  lineHeight: 1.5,
};

const statusBoxStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "16px",
};

const statusHeaderStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#6b7280",
  marginBottom: "6px",
};

const statusTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "16px",
  color: "#111827",
  fontWeight: 600,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "12px",
  marginBottom: "20px",
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "16px",
  backgroundColor: "#ffffff",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "6px",
  fontWeight: 700,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "#111827",
  fontWeight: 600,
  wordBreak: "break-word",
};

const recordSectionStyle: React.CSSProperties = {
  marginTop: "8px",
};

const recordTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "12px",
};

const emptyRecordStyle: React.CSSProperties = {
  padding: "16px",
  borderRadius: "12px",
  backgroundColor: "#f9fafb",
  color: "#6b7280",
  border: "1px dashed #d1d5db",
};

const recordItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  backgroundColor: "#fff",
};

const recordBadgeStyle: React.CSSProperties = {
  minWidth: "64px",
  textAlign: "center",
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "14px",
};

const recordTimeStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  fontWeight: 600,
  textAlign: "right",
};