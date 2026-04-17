"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/admin");
        router.refresh();
      } else {
        setMessage(data.message || "로그인 실패");
      }
    } catch (err) {
      console.error(err);
      setMessage("오류 발생");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{ padding: "40px", maxWidth: "400px", margin: "0 auto" }}>
      <h1>관리자 로그인</h1>

      <form onSubmit={handleLogin} style={{ marginTop: "20px" }}>
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
          }}
        />

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "10px",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "확인 중..." : "로그인"}
        </button>
      </form>

      {message && (
        <p style={{ color: "red", marginTop: "10px" }}>{message}</p>
      )}
    </main>
  );
}
