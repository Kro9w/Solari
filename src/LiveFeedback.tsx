import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

function MobileGridModal({
  isOpen,
  onClose,
  session,
  userName,
}: {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  userName: string;
}) {
  if (!isOpen) return null;

  const totalQuestions = session.state?.questions?.length || 100;
  const answers = session.state?.answers || {};

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--cream)",
          padding: "24px",
          borderRadius: "10px",
          border: "1px solid var(--cream-border)",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontFamily: "var(--font-display)",
              color: "var(--ink)",
            }}
          >
            {userName}'s Progress
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "var(--ink-muted)",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gap: "6px",
          }}
        >
          {Array.from({ length: totalQuestions }).map((_, i) => {
            const hasAnswer = !!answers[i];
            return (
              <div
                key={i}
                style={{
                  aspectRatio: "1/1",
                  background: hasAnswer ? "var(--accent)" : "var(--cream-dark)",
                  border: `1px solid ${hasAnswer ? "var(--accent-light)" : "var(--cream-border)"}`,
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  color: hasAnswer ? "var(--cream)" : "var(--ink-muted)",
                  fontWeight: hasAnswer ? 600 : 400,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LiveFeedback() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMobileSession, setSelectedMobileSession] = useState<
    any | null
  >(null);

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
      const examName = curr.exam
        ? `${curr.exam.title} (${curr.exam.subject_code})`
        : "Unknown Exam";
      if (!acc[examName]) acc[examName] = [];
      acc[examName].push(curr);
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

      {Object.entries(grouped).map(([examName, examSessions]) => (
        <div
          key={examName}
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
            {examName}
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {(examSessions as any[]).map((s: any) => {
              const answers = s.state?.answers || {};
              const answersCount = Object.keys(answers).length;
              const totalQuestions = s.state?.questions?.length || 100;
              const userName = s.user_name || "Unknown Student";

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
                  <div style={{ flex: "0 0 auto", marginRight: "24px" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--ink)",
                        marginBottom: "4px",
                      }}
                    >
                      {userName}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                    >
                      {answersCount} / {totalQuestions} answered
                    </div>
                  </div>

                  {/* Desktop Grid */}
                  <div
                    className="hide-on-mobile"
                    style={{
                      flex: 1,
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(25, 12px)",
                        gridTemplateRows: "repeat(4, 12px)",
                        gap: "3px",
                      }}
                    >
                      {Array.from({ length: totalQuestions }).map((_, i) => {
                        const hasAnswer = !!answers[i];
                        return (
                          <div
                            key={i}
                            title={`Q${i + 1}`}
                            style={{
                              width: "12px",
                              height: "12px",
                              background: hasAnswer
                                ? "var(--accent)"
                                : "var(--cream-border)",
                              borderRadius: "2px",
                              opacity: hasAnswer ? 1 : 0.4,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Mobile Button */}
                  <div
                    className="show-on-mobile-flex"
                    style={{ display: "none" }}
                  >
                    <button
                      onClick={() => setSelectedMobileSession(s)}
                      style={{
                        padding: "6px 12px",
                        background: "var(--cream)",
                        border: "1px solid var(--cream-border)",
                        borderRadius: "6px",
                        fontSize: "12px",
                        cursor: "pointer",
                        color: "var(--ink)",
                      }}
                    >
                      View Grid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <MobileGridModal
        isOpen={!!selectedMobileSession}
        onClose={() => setSelectedMobileSession(null)}
        session={selectedMobileSession}
        userName={selectedMobileSession?.user_name || "Unknown Student"}
      />
    </div>
  );
}
