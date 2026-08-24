import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { DEFAULT_SUBJECTS } from "./App";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [examSets, setExamSets] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatsSetId, setSelectedStatsSetId] = useState<string>("");

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
          .select("*, exam:exams(title, subject_code, exam_set_id)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const fetchedSets = setsData.data || [];
      setExamSets(fetchedSets);
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

  // Group exams by sets for rendering

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

      totalGWA = Math.round(gwaSum * (100 / (totalWeight || 100)));
    }
  }

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "800px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--cream-border)",
          paddingBottom: "18px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--accent)",
              fontWeight: 600,
              marginBottom: "6px",
            }}
          >
            Dashboard
          </div>
          <h1
            style={{
              fontSize: "32px",
              fontFamily: "var(--font-display)",
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Welcome, {displayName}
          </h1>
        </div>
      </div>

      {/* Available Exams (Sets) */}
      <div>
        <h2
          style={{
            fontSize: "12px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: "16px",
            color: "var(--ink-muted)",
          }}
        >
          Available Live Exams
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {examSets.length === 0 ? (
            <div style={{ color: "var(--ink-muted)" }}>
              No live exams scheduled.
            </div>
          ) : (
            examSets.map((set) => {
              return (
                <div
                  key={set.id}
                  style={{
                    background: "var(--cream-dark)",
                    padding: "20px",
                    borderRadius: "10px",
                    border: "1px solid var(--cream-border)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "16px",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "17px",
                        fontFamily: "var(--font-display)",
                        color: "var(--ink)",
                      }}
                    >
                      {set.title}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "var(--ink-faint)",
                      }}
                    >
                      Access: {new Date(set.accessible_at).toLocaleString()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {set.exams?.map((exam: any) => {
                      const startTime = new Date(exam.accessible_at).getTime();
                      const endTime =
                        startTime + (exam.duration_minutes || 150) * 60000;
                      const now = new Date().getTime();

                      const isTimeWindowOpen =
                        now >= startTime && now <= endTime;
                      const hasTaken = results.some(
                        (r) => r.exam_id === exam.id,
                      );

                      return (
                        <div
                          key={exam.id}
                          style={{
                            padding: "12px",
                            background: "var(--cream)",
                            border: "1px solid var(--cream-border)",
                            borderRadius: "6px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ fontWeight: 500, fontSize: "14px" }}>
                            {exam.title} ({exam.subject_code})
                          </div>

                          {hasTaken ? (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--green)",
                                fontWeight: 500,
                              }}
                            >
                              ✓ Completed
                            </div>
                          ) : (
                            <button
                              onClick={() => navigate(`/exam/${exam.id}`)}
                              disabled={!isTimeWindowOpen}
                              style={{
                                padding: "6px 12px",
                                background: isTimeWindowOpen
                                  ? "var(--accent)"
                                  : "var(--cream-dark)",
                                color: isTimeWindowOpen
                                  ? "white"
                                  : "var(--ink-faint)",
                                border: "none",
                                borderRadius: "6px",
                                cursor: isTimeWindowOpen
                                  ? "pointer"
                                  : "not-allowed",
                                fontSize: "12px",
                                width: "100%",
                                transition: "background 0.2s ease",
                              }}
                            >
                              {isTimeWindowOpen
                                ? "Start Exam"
                                : now > endTime
                                  ? "Closed"
                                  : "Not Yet Available"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Weaknesses / GWA */}
      <div
        style={{
          background: "var(--cream-dark)",
          border: "1px solid var(--cream-border)",
          borderRadius: "10px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header with Dropdown */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 500,
              fontFamily: "var(--font-display)",
              color: "var(--ink)",
            }}
          >
            Performance Statistics
          </h3>
          <select
            value={selectedStatsSetId}
            onChange={(e) => setSelectedStatsSetId(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              border: "1px solid var(--cream-border)",
              background: "var(--cream)",
              fontSize: "14px",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            {examSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.title}
              </option>
            ))}
            {examSets.length === 0 && <option value="">No Exam Sets</option>}
          </select>
        </div>

        {targetSetResults.length > 0 ? (
          <>
            {/* Weaknesses Bar Chart Simulation */}
            <div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  height: "120px",
                  borderBottom: "1px dashed var(--cream-border)",
                  paddingBottom: "8px",
                }}
              >
                {DEFAULT_SUBJECTS.map((sub) => {
                  const res = targetSetResults.find((r) =>
                    r.exam?.subject_code?.startsWith(sub.short),
                  );
                  const score = res ? res.score : null;
                  return (
                    <div
                      key={sub.short}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        flex: 1,
                        gap: "8px",
                      }}
                    >
                      {score !== null ? (
                        <div
                          style={{
                            width: "100%",
                            maxWidth: "60px",
                            height: `${score}%`,
                            background: "var(--accent)",
                            borderRadius: "4px 4px 0 0",
                            minHeight: "4px",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            color: "var(--ink-faint)",
                            fontSize: "12px",
                          }}
                        >
                          —
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color:
                            score !== null ? "var(--ink)" : "var(--ink-faint)",
                        }}
                      >
                        {sub.short}
                      </div>
                      {score !== null && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--ink-muted)",
                          }}
                        >
                          {score}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GWA and Focus Area */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>
                    Estimated GWA
                  </div>
                  <div
                    style={{
                      fontSize: "16px",
                      color:
                        (totalGWA || 0) >= 75 ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {totalGWA}%
                  </div>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: "var(--cream-dark)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
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
                    marginTop: "4px",
                  }}
                >
                  Target: 75% to pass
                </div>
              </div>

              <div
                style={{
                  background:
                    lowestSubject?.score < 50
                      ? "var(--red-bg)"
                      : "var(--accent-bg)",
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color:
                      lowestSubject?.score < 50
                        ? "var(--red)"
                        : "var(--accent)",
                    marginBottom: "4px",
                  }}
                >
                  Focus Area
                </div>
                <div style={{ fontSize: "13px" }}>
                  {lowestSubject?.score < 50
                    ? `Warning: ${lowestSubject.short} is below 50%. You must review this subject to avoid failing.`
                    : `Your lowest score is in ${lowestSubject?.short} (${lowestSubject?.score}%). Consider dedicating more time here.`}
                </div>
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
  );
}
