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
    return (
      <div style={{ padding: "40px 0", color: "var(--ink-muted)" }}>
        Loading live feedback…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="feed-empty">
        <h3 className="feed-empty-heading">No Exam Currently Ongoing</h3>
        <p className="feed-empty-text">
          There are no active exam sessions right now.
        </p>
        <button className="dash-exam-btn" onClick={fetchSessions}>
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
    <div className="feed-shell">
      <div className="feed-header">
        <div>
          <div className="dash-eyebrow">Real-Time Monitoring</div>
          <h2 className="dash-set-title">Live Exam Sessions</h2>
        </div>
        <button className="dash-exam-btn" onClick={fetchSessions}>
          Refresh Feed
        </button>
      </div>

      {Object.entries(grouped).map(([examName, examSessions]) => (
        <div key={examName} className="dash-panel">
          <div className="dash-set-title" style={{ marginBottom: "16px" }}>
            {examName}
          </div>
          <div>
            {(examSessions as any[]).map((s: any) => {
              const answers = s.state?.answers || {};
              const answersCount = Object.keys(answers).length;
              const totalQuestions = s.state?.questions?.length || 100;
              const userName = s.user_name || "Unknown Student";

              return (
                <div key={s.id} className="feed-row">
                  <div style={{ flex: "0 0 auto" }}>
                    <div className="feed-name">{userName}</div>
                    <div className="feed-meta">
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
