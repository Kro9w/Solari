import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export default function LiveFeedback() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("*, exam:exams(title, subject_code)")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading live feedback...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--ink-muted)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            marginBottom: "8px",
            color: "var(--ink)",
          }}
        >
          No Exam Currently Ongoing
        </h3>
        <p>There are no active exam sessions right now.</p>
        <button
          onClick={fetchSessions}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            background: "var(--cream-dark)",
            border: "1px solid var(--cream-border)",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Refresh Feed
        </button>
      </div>
    );
  }

  // Group by exam
  const grouped = sessions.reduce(
    (acc, curr) => {
      const examCode = curr.exam?.subject_code || "Unknown Exam";
      if (!acc[examCode]) acc[examCode] = [];
      acc[examCode].push(curr);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontFamily: "var(--font-display)",
            margin: 0,
          }}
        >
          Live Exam Sessions
        </h2>
        <button
          onClick={fetchSessions}
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "var(--cream)",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Refresh Feed
        </button>
      </div>

      {Object.entries(grouped).map(([examCode, examSessions]) => (
        <div
          key={examCode}
          style={{
            background: "var(--cream)",
            border: "1px solid var(--cream-border)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "16px",
              fontFamily: "var(--font-display)",
              color: "var(--ink)",
            }}
          >
            {examCode}
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {(examSessions as any[]).map((s: any) => {
              const answersCount = s.state?.answers
                ? Object.keys(s.state.answers).length
                : 0;
              const totalQuestions = s.state?.questions?.length || 100;
              const progressPercent =
                Math.round((answersCount / totalQuestions) * 100) || 0;

              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--cream-dark)",
                    borderRadius: "8px",
                    border: "1px solid var(--cream-border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--ink)",
                        marginBottom: "4px",
                      }}
                    >
                      {s.user_name || "Unknown Student"}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                    >
                      Last updated:{" "}
                      {new Date(s.updated_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div
                    style={{
                      width: "200px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--ink)",
                      }}
                    >
                      {answersCount} / {totalQuestions} answered
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        background: "var(--cream-border)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          height: "100%",
                          background: "var(--accent)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
