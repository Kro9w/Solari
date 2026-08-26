import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { Loader } from "./components/Loader";

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
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3 className="modal-title">{userName}'s Progress</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="feed-grid-lg">
            {Array.from({ length: totalQuestions }).map((_, i) => {
              const hasAnswer = !!answers[i];
              return (
                <div
                  key={i}
                  className={`feed-cell-lg${hasAnswer ? " answered" : ""}`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
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
  const [now, setNow] = useState(new Date());
  const [isCleaning, setIsCleaning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select(
          "*, exam:exams(id, title, subject_code, is_reopened, duration_minutes, accessible_at)",
        )
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const handleCleanupExpired = async () => {
    if (isCleaning) return;
    setIsCleaning(true);

    try {
      let processedCount = 0;
      for (const session of sessions) {
        const exam = session.exam;
        if (!exam) continue;

        let isExpired = false;

        if (!exam.is_reopened && exam.accessible_at) {
          const accessTime = new Date(exam.accessible_at);
          const endTime = new Date(
            accessTime.getTime() + (exam.duration_minutes || 150) * 60000,
          );
          if (now > endTime) isExpired = true;
        } else if (exam.is_reopened && session.state?.started_at) {
          const startedAtTime = new Date(session.state.started_at);
          const standardDurationSeconds = (exam.duration_minutes || 150) * 60;
          const elapsedSeconds = Math.max(
            0,
            Math.floor((now.getTime() - startedAtTime.getTime()) / 1000),
          );
          if (elapsedSeconds >= standardDurationSeconds) isExpired = true;
        }

        if (isExpired) {
          const state = session.state || {};
          const questions = state.questions || [];
          const answers = state.answers || {};
          const elapsed = state.elapsed || (exam.duration_minutes || 150) * 60;

          if (questions.length > 0) {
            const correctCount = questions.filter((q: any, i: number) => {
              const chosen = answers[i];
              return (
                chosen &&
                q.options.find((o: any) => o.letter === chosen)?.correct
              );
            }).length;

            const score = Math.round((correctCount / questions.length) * 100);

            const originalIndexedAnswers: Record<number, string> = {};
            Object.keys(answers).forEach((shuffledIdx) => {
              const q = questions[parseInt(shuffledIdx, 10)];
              if (q) {
                originalIndexedAnswers[q.originalIndex] =
                  answers[parseInt(shuffledIdx, 10)];
              }
            });

            const newResult = {
              user_id: session.user_id,
              user_name: session.user_name || "Unknown Student",
              exam_id: session.exam_id,
              score,
              correct_count: correctCount,
              total_count: questions.length,
              answers: originalIndexedAnswers,
              time_taken: elapsed,
            };

            const { data: existing } = await supabase
              .from("exam_results")
              .select("id")
              .eq("user_id", session.user_id)
              .eq("exam_id", session.exam_id)
              .maybeSingle();
            if (!existing) {
              await supabase.from("exam_results").insert(newResult);
            }

            await supabase.from("exam_sessions").delete().eq("id", session.id);
            processedCount++;
          }
        }
      }
      if (processedCount > 0) {
        alert(
          `Successfully cleaned up and submitted ${processedCount} expired session(s).`,
        );
        fetchSessions(true);
      } else {
        alert("No expired sessions found to clean up.");
      }
    } catch (err) {
      console.error("Cleanup failed:", err);
      alert("An error occurred during cleanup.");
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  if (loading) {
    return <Loader />;
  }

  if (sessions.length === 0) {
    return (
      <div className="feed-empty">
        <h3 className="feed-empty-heading">No Exam Currently Ongoing</h3>
        <p className="feed-empty-text">
          There are no active exam sessions right now.
        </p>
        <button className="dash-exam-btn" onClick={() => fetchSessions(true)}>
          Refresh Feed
        </button>
      </div>
    );
  }

  // Group by exam object properties
  const grouped = sessions.reduce(
    (acc, curr) => {
      const examId = curr.exam?.id || "unknown";
      if (!acc[examId]) {
        acc[examId] = {
          exam: curr.exam,
          sessions: [],
        };
      }
      acc[examId].sessions.push(curr);
      return acc;
    },
    {} as Record<string, { exam: any; sessions: any[] }>,
  );

  function formatTime(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="feed-shell">
      <div className="feed-header">
        <div>
          <div className="dash-eyebrow">Real-Time Monitoring</div>
          <h2 className="dash-set-title">Live Exam Sessions</h2>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="dash-exam-btn"
            style={{
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--cream-border)",
            }}
            onClick={handleCleanupExpired}
            disabled={isCleaning}
          >
            {isCleaning ? "Cleaning..." : "Clean Up Expired"}
          </button>
          <button className="dash-exam-btn" onClick={() => fetchSessions(true)}>
            Refresh Feed
          </button>
        </div>
      </div>

      {Object.values(grouped).map((groupInfo: any) => {
        const { exam, sessions: examSessions } = groupInfo;
        const examName = exam
          ? `${exam.title} (${exam.subject_code})`
          : "Unknown Exam";

        let timeRemainingDisplay = null;
        if (exam && !exam.is_reopened && exam.accessible_at) {
          const accessTime = new Date(exam.accessible_at);
          const endTime = new Date(
            accessTime.getTime() + (exam.duration_minutes || 150) * 60000,
          );
          const remainingSeconds = Math.max(
            0,
            Math.floor((endTime.getTime() - now.getTime()) / 1000),
          );
          if (remainingSeconds > 0) {
            timeRemainingDisplay = formatTime(remainingSeconds);
          } else {
            timeRemainingDisplay = "Ended";
          }
        }

        return (
          <div key={exam?.id || examName} className="dash-panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div
                className="dash-set-title"
                style={{
                  margin: 0,
                  color: exam?.is_reopened ? "var(--red)" : "inherit",
                }}
              >
                {examName} {exam?.is_reopened && "(Reopened)"}
              </div>
              {timeRemainingDisplay && (
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "bold",
                    color: "var(--accent)",
                  }}
                >
                  {timeRemainingDisplay} remaining
                </div>
              )}
            </div>
            <div>
              {(examSessions as any[]).map((s: any) => {
                const answers = s.state?.answers || {};
                const answersCount = Object.keys(answers).length;
                const totalQuestions = s.state?.questions?.length || 100;
                const userName = s.user_name || "Unknown Student";

                let lateTakerInfo = null;
                if (exam?.is_reopened && s.state?.started_at) {
                  const startedAtTime = new Date(s.state.started_at);
                  const standardDurationSeconds =
                    (exam.duration_minutes || 150) * 60;
                  const elapsedSeconds = Math.max(
                    0,
                    Math.floor(
                      (now.getTime() - startedAtTime.getTime()) / 1000,
                    ),
                  );
                  const remainingSeconds = Math.max(
                    0,
                    standardDurationSeconds - elapsedSeconds,
                  );

                  lateTakerInfo = (
                    <div
                      className="feed-meta"
                      style={{
                        marginTop: "4px",
                        color:
                          remainingSeconds > 0 ? "var(--accent)" : "var(--red)",
                      }}
                    >
                      Started:{" "}
                      {startedAtTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      •{" "}
                      {remainingSeconds > 0
                        ? `${formatTime(remainingSeconds)} remaining`
                        : "Time's up"}
                    </div>
                  );
                }

                return (
                  <div key={s.id} className="feed-row">
                    <div style={{ flex: "0 0 auto" }}>
                      <div className="feed-name">{userName}</div>
                      <div className="feed-meta">
                        {answersCount} / {totalQuestions} answered
                      </div>
                      {lateTakerInfo}
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
                      <div className="feed-grid">
                        {Array.from({ length: totalQuestions }).map((_, i) => {
                          const hasAnswer = !!answers[i];
                          return (
                            <div
                              key={i}
                              title={`Q${i + 1}`}
                              className={`feed-cell${hasAnswer ? " answered" : ""}`}
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
                        className="feed-view-btn"
                        onClick={() => setSelectedMobileSession(s)}
                      >
                        View Grid
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <MobileGridModal
        isOpen={!!selectedMobileSession}
        onClose={() => setSelectedMobileSession(null)}
        session={selectedMobileSession}
        userName={selectedMobileSession?.user_name || "Unknown Student"}
      />
    </div>
  );
}
