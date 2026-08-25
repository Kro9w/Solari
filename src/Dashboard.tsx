import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { DEFAULT_SUBJECTS, getDaysUntil } from "./App";
import { parseQuestions } from "./MockExam";

const EXAM_DATE = new Date("2026-09-03");

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [examSets, setExamSets] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatsSetId, setSelectedStatsSetId] = useState<string>("");
  const [selectedResultForModal, setSelectedResultForModal] = useState<
    any | null
  >(null);
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const [setsData, resultsData] = await Promise.all([
        supabase
          .from("exam_sets")
          .select("*, exams(*)")
          .eq("is_public", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("exam_results")
          .select(
            "*, exam:exams(title, subject_code, exam_set_id, file_content)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const fetchedSets = setsData.data || [];

      // Strictly sort exams within each set by the admin-defined `accessible_at` time
      const processedSets = fetchedSets.map((set) => {
        if (set.exams) {
          set.exams.sort(
            (a: any, b: any) =>
              new Date(a.accessible_at).getTime() -
              new Date(b.accessible_at).getTime(),
          );
        }
        return set;
      });

      setExamSets(processedSets);
      setResults(resultsData.data || []);

      if (fetchedSets.length > 0) {
        setSelectedStatsSetId(fetchedSets[0].id);
      }

      setLoading(false);
    }

    fetchData();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading)
    return <div style={{ padding: "24px" }}>Loading dashboard...</div>;

  const displayName = user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim()
    : "Student";

  const adminEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(",") || [];
  const isAdmin = user?.email && adminEmails.includes(user.email);

  // Calculate weaknesses / GWA from the SELECTED exam set results
  let targetSetResults: any[] = [];
  let totalGWA: number | null = null;
  let lowestSubject: any = null;

  if (results.length > 0 && selectedStatsSetId) {
    targetSetResults = results.filter(
      (r) => r.exam?.exam_set_id === selectedStatsSetId,
    );

    if (targetSetResults.length > 0) {
      let gwaSum = 0;
      let lowestScore = 101;
      let totalWeight = 0;

      targetSetResults.forEach((r) => {
        const code = r.exam?.subject_code?.split("_")[0];
        const sub = DEFAULT_SUBJECTS.find((s) => s.short === code);
        const weight = sub?.weight || 0;
        gwaSum += r.score * (weight / 100);
        totalWeight += weight;

        if (r.score < lowestScore) {
          lowestScore = r.score;
          lowestSubject = { short: code, score: r.score };
        }
      });

      totalGWA = Math.round(gwaSum);
    }
  }

  const daysToExam = Math.max(0, getDaysUntil(EXAM_DATE));

  // Single source of truth for the chart — computed once so the bars,
  // labels, and scores can never drift out of sync with each other.
  const subjectScores = DEFAULT_SUBJECTS.map((sub) => {
    const res = targetSetResults.find((r) =>
      r.exam?.subject_code?.startsWith(sub.short),
    );
    const score = res ? res.score : null;
    const weightedScore =
      score !== null ? score * ((sub.weight || 0) / 100) : null;
    return { short: sub.short, score, weightedScore, weight: sub.weight };
  });

  const hasDanger = subjectScores.some((s) => s.score !== null && s.score < 50);
  const hasWatch = subjectScores.some(
    (s) => s.score !== null && s.score >= 50 && s.score < 75,
  );
  const hasGood = subjectScores.some((s) => s.score !== null && s.score >= 75);

  let focusTier: "danger" | "watch" | "good" | "excellent" = "watch";
  let focusMessage = "";
  if (lowestSubject) {
    const s = lowestSubject.score;
    if (s < 50) {
      focusTier = "danger";
      focusMessage = `Warning: ${lowestSubject.short} is at ${s}% — below the passing mark. Prioritize this subject before moving on.`;
    } else if (s < 75) {
      focusTier = "watch";
      focusMessage = `${lowestSubject.short} is your lowest at ${s}%, just short of the 75% target. A few more focused passes here would help.`;
    } else if (s < 90) {
      focusTier = "good";
      focusMessage = `Your lowest score is in ${lowestSubject.short} at ${s}% — already passing. Sharpen it further when you have room.`;
    } else {
      focusTier = "excellent";
      focusMessage = `Even your lowest score, ${lowestSubject.short} at ${s}%, is strong. Nothing urgent here — keep it fresh with light review.`;
    }
  }

  return (
    <div className="dash-shell">
      {/* ── masthead ── */}
      <div className="dash-header">
        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="dash-eyebrow">Exam Dashboard</div>
          <h1 className="dash-heading">Welcome, {displayName}</h1>
          <div className="live-clock" style={{ marginTop: 8 }}>
            <span className="live-clock-dot" />
            {clockNow.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            <span className="live-clock-sep">·</span>
            <span className="live-clock-time">
              {clockNow.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* Decorative background ring similar to auth */}
        <div className="dash-header-ring-wrap" aria-hidden="true">
          <svg className="dash-header-ring" viewBox="0 0 200 200">
            <g className="dash-ring-group">
              {Array.from({ length: 24 }, (_, i) => i).map((i) => {
                const angle = (i * 15 * Math.PI) / 180;
                const isMajor = i % 6 === 0;
                const rOuter = 96;
                const rInner = isMajor ? 78 : 87;
                const x1 = 100 + rOuter * Math.sin(angle);
                const y1 = 100 - rOuter * Math.cos(angle);
                const x2 = 100 + rInner * Math.sin(angle);
                const y2 = 100 - rInner * Math.cos(angle);
                return (
                  <line
                    key={i}
                    className="dash-tick"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={
                      isMajor ? "var(--accent-light)" : "var(--cream-border)"
                    }
                    strokeWidth={isMajor ? 4 : 3}
                    strokeLinecap="round"
                    style={
                      {
                        animationDelay: `${i * 0.03}s`,
                        "--tick-opacity": isMajor ? 1 : 0.6,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* ── stats row ── */}
      <div className="dash-stats-row">
        <div className="dash-stat">
          <div className="dash-stat-value">{daysToExam}</div>
          <div className="dash-stat-label">Days to exam</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{results.length}</div>
          <div className="dash-stat-label">Exams completed</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{lowestSubject?.short || "—"}</div>
          <div className="dash-stat-label">Focus area</div>
        </div>
      </div>

      {/* ── split layout ── */}
      <div className="dashboard-split-layout">
        {/* left: available exams */}
        <div className="dashboard-split-left">
          <div className="dash-section-label">Available Live Exams</div>
          <div className="dash-panel">
            {examSets.length === 0 ? (
              <div style={{ color: "var(--ink-muted)", fontSize: "14px" }}>
                No live exams scheduled.
              </div>
            ) : (
              examSets.map((set) => (
                <div key={set.id} className="dash-set">
                  <div className="dash-set-header">
                    <div className="dash-set-title">{set.title}</div>
                    <div className="dash-set-meta">
                      Access: {new Date(set.accessible_at).toLocaleString()}
                    </div>
                  </div>

                  {set.exams?.map((exam: any) => {
                    const startTime = new Date(exam.accessible_at).getTime();
                    const endTime =
                      startTime + (exam.duration_minutes || 150) * 60000;
                    const now = new Date().getTime();

                    const originalTimeWindowOpen =
                      now >= startTime && now <= endTime;
                    const isTimeWindowOpen =
                      originalTimeWindowOpen ||
                      (now > endTime && exam.is_reopened);
                    const hasTaken = results.some((r) => r.exam_id === exam.id);

                    return (
                      <div key={exam.id} className="dash-exam-row">
                        <div>
                          <div className="dash-exam-title">{exam.title}</div>
                          <div className="dash-exam-code">
                            {exam.subject_code}
                          </div>
                        </div>

                        {hasTaken ? (
                          <div className="dash-exam-status">✓ Completed</div>
                        ) : (
                          <button
                            className="dash-exam-btn"
                            onClick={() => navigate(`/exam/${exam.id}`)}
                            disabled={!isTimeWindowOpen}
                          >
                            {originalTimeWindowOpen
                              ? "Start Exam"
                              : exam.is_reopened
                                ? "Start Exam (Late)"
                                : now > endTime
                                  ? "Closed"
                                  : `Opens ${new Date(exam.accessible_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* right: performance statistics */}
        <div className="dashboard-split-right">
          <div className="dash-section-label">Performance Statistics</div>
          <div className="dash-panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                gap: "12px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "18px",
                  color: "var(--ink)",
                }}
              >
                By Exam Set
              </div>
              <select
                className="dash-select"
                value={selectedStatsSetId}
                onChange={(e) => setSelectedStatsSetId(e.target.value)}
              >
                {examSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.title}
                  </option>
                ))}
                {examSets.length === 0 && (
                  <option value="">No Exam Sets</option>
                )}
              </select>
            </div>

            {targetSetResults.length > 0 ? (
              <>
                {/* weaknesses bar chart */}
                <div className="dash-chart">
                  <div className="dash-chart-visual">
                    <div className="dash-chart-grid">
                      {[25, 50, 75, 100].map((pct) => (
                        <div
                          key={pct}
                          className={`dash-chart-gridline ${pct === 75 ? "pass" : pct === 50 ? "danger" : ""}`}
                          style={{ bottom: `${pct}%` }}
                        >
                          {pct === 75 && (
                            <span className="dash-chart-gridline-label pass">
                              Pass · 75%
                            </span>
                          )}
                          {pct === 50 && (
                            <span className="dash-chart-gridline-label danger">
                              Min · 50%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="dash-chart-bars">
                      {subjectScores.map(({ short, score, weightedScore }) => (
                        <div key={short} className="dash-bar-col">
                          {score !== null && (
                            <>
                              <div
                                className="dash-bar dash-bar-raw has-tooltip"
                                data-tooltip={`Raw: ${score}%`}
                                style={{ height: `${score}%` }}
                              />
                              <div
                                className={`dash-bar dash-bar-weighted has-tooltip ${
                                  score < 50
                                    ? "dash-bar-danger"
                                    : score < 75
                                      ? "dash-bar-watch"
                                      : "dash-bar-good"
                                }`}
                                data-tooltip={
                                  weightedScore !== null
                                    ? `Weighted: ${weightedScore.toFixed(1).replace(/\.0$/, "")}%`
                                    : undefined
                                }
                                style={{ height: `${weightedScore}%` }}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="dash-chart-labels">
                    {subjectScores.map(({ short, score, weightedScore }) => (
                      <div key={short} className="dash-bar-col">
                        <div
                          className="dash-bar-label"
                          style={{
                            color:
                              score !== null
                                ? "var(--ink)"
                                : "var(--ink-faint)",
                          }}
                        >
                          {short}
                        </div>
                        <div className="dash-bar-score">
                          {weightedScore !== null
                            ? `${weightedScore.toFixed(1).replace(/\.0$/, "")}%`
                            : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "16px",
                      marginTop: "16px",
                      fontSize: "11px",
                      color: "var(--ink-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          background: "var(--cream-border)",
                          borderRadius: "2px",
                        }}
                      />
                      Raw Score
                    </div>

                    {hasGood && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            background: "var(--green)",
                            borderRadius: "2px",
                          }}
                        />
                        Pass (≥75%)
                      </div>
                    )}

                    {hasWatch && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            background: "var(--accent)",
                            borderRadius: "2px",
                          }}
                        />
                        Watch (50-74%)
                      </div>
                    )}

                    {hasDanger && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            background: "var(--red)",
                            borderRadius: "2px",
                          }}
                        />
                        Danger (&lt;50%)
                      </div>
                    )}
                  </div>
                </div>

                {/* GWA + focus area */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    marginTop: "22px",
                  }}
                >
                  <div>
                    <div className="dash-gwa-row">
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>
                        Estimated GWA
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "17px",
                          color:
                            (totalGWA || 0) >= 75
                              ? "var(--green)"
                              : "var(--red)",
                        }}
                      >
                        {totalGWA}%
                      </div>
                    </div>
                    <div className="dash-gwa-track">
                      <div
                        className="dash-gwa-fill"
                        style={{
                          width: `${totalGWA || 0}%`,
                          background:
                            (totalGWA || 0) >= 75
                              ? "var(--green)"
                              : "var(--accent)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--ink-muted)",
                        marginTop: "6px",
                      }}
                    >
                      Target: 75% to pass
                    </div>
                  </div>

                  <div className={`dash-focus-callout ${focusTier}`}>
                    {focusMessage}
                  </div>
                </div>

                {/* recent results */}
                <div style={{ marginTop: "28px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-muted)",
                      fontWeight: 600,
                      marginBottom: "10px",
                    }}
                  >
                    Recent Results
                  </div>
                  <div>
                    {targetSetResults.map((result) => {
                      const isPass = result.score >= 50;
                      const timeFormatted = result.time_taken
                        ? `${Math.floor(result.time_taken / 60)}m ${result.time_taken % 60}s`
                        : "--";
                      return (
                        <div
                          key={result.id}
                          className="dash-result-row"
                          onClick={() => setSelectedResultForModal(result)}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 500,
                                fontSize: "13px",
                                color: "var(--ink)",
                              }}
                            >
                              {result.exam?.title || "Exam"}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--ink-muted)",
                                marginTop: "2px",
                              }}
                            >
                              {new Date(result.created_at).toLocaleDateString()}{" "}
                              · {timeFormatted}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: "2px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "15px",
                                fontWeight: 600,
                                color: isPass ? "var(--green)" : "var(--red)",
                              }}
                            >
                              {result.score}%
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--ink-muted)",
                              }}
                            >
                              {result.correct_count} / {result.total_count}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  color: "var(--ink-muted)",
                  textAlign: "center",
                  padding: "20px 0",
                  fontSize: "14px",
                }}
              >
                No results available for this exam set yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── exam summary modal ── */}
      {selectedResultForModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(28,26,23,0.55)",
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
              borderRadius: "10px",
              border: "1px solid var(--cream-border)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 24px",
                borderBottom: "1px solid var(--cream-border)",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontFamily: "var(--font-display)",
                    color: "var(--ink)",
                  }}
                >
                  Exam Summary
                </h3>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--ink-muted)",
                    marginTop: "4px",
                  }}
                >
                  {selectedResultForModal.exam?.title} (
                  {selectedResultForModal.exam?.subject_code})
                </div>
              </div>
              <button
                onClick={() => setSelectedResultForModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--ink-muted)",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {(() => {
                const examContent = selectedResultForModal.exam?.file_content;
                if (!examContent)
                  return (
                    <div style={{ color: "var(--ink-muted)" }}>
                      Exam content not available.
                    </div>
                  );

                const questions = parseQuestions(examContent);
                const answers = selectedResultForModal.answers || {};

                return questions.map((q: any) => {
                  const userAnswer = answers[q.originalIndex];
                  const correctOption = q.options.find((o: any) => o.correct);
                  const isCorrectlyAnswered =
                    userAnswer === correctOption?.letter;

                  return (
                    <div
                      key={q.number}
                      style={{
                        background: "var(--cream-dark)",
                        padding: "16px",
                        borderRadius: "8px",
                        border: "1px solid var(--cream-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--ink-muted)",
                          marginBottom: "8px",
                        }}
                      >
                        Question {q.number}
                      </div>
                      <div
                        style={{
                          fontSize: "15px",
                          color: "var(--ink)",
                          marginBottom: "12px",
                          lineHeight: 1.4,
                        }}
                      >
                        {q.stem}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {q.options.map((opt: any) => {
                          const isUserChoice = userAnswer === opt.letter;
                          const isCorrectChoice =
                            correctOption?.letter === opt.letter;

                          let bg = "var(--cream)";
                          let border = "1px solid var(--cream-border)";
                          if (isCorrectChoice) {
                            bg = "var(--green-bg)";
                            border = "1px solid var(--green)";
                          } else if (isUserChoice && !isCorrectChoice) {
                            bg = "var(--red-bg)";
                            border = "1px solid var(--red)";
                          }

                          return (
                            <div
                              key={opt.letter}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "8px 12px",
                                background: bg,
                                border: border,
                                borderRadius: "6px",
                              }}
                            >
                              <div
                                style={{
                                  width: "24px",
                                  height: "24px",
                                  borderRadius: "50%",
                                  border: `1px solid ${isCorrectChoice ? "var(--green)" : isUserChoice ? "var(--red)" : "var(--ink-muted)"}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "12px",
                                  color: isCorrectChoice
                                    ? "var(--green)"
                                    : isUserChoice
                                      ? "var(--red)"
                                      : "var(--ink-muted)",
                                  flexShrink: 0,
                                }}
                              >
                                {opt.letter}
                              </div>
                              <div
                                style={{
                                  fontSize: "14px",
                                  color: "var(--ink)",
                                }}
                              >
                                {opt.text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {!userAnswer && (
                        <div
                          style={{
                            marginTop: "12px",
                            fontSize: "13px",
                            color: "var(--ink-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          You skipped this question.
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
