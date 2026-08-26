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
  const current = session.state?.current;

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
              const isCurrent = current === i;
              return (
                <div
                  key={i}
                  className={`feed-cell-lg${isCurrent ? " current" : hasAnswer ? " answered" : ""}`}
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

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async (isInitial = false) => {
    if (isInitial) setLoading(true);
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
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions(true);
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
        <button className="dash-exam-btn" onClick={() => fetchSessions(false)}>
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
        <button className="dash-exam-btn" onClick={() => fetchSessions(false)}>
          Refresh Feed
        </button>
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
                          const isCurrent = s.state?.current === i;
                          return (
                            <div
                              key={i}
                              title={`Q${i + 1}`}
                              className={`feed-cell${isCurrent ? " current" : hasAnswer ? " answered" : ""}`}
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
