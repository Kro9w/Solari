import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { DEFAULT_SUBJECTS } from "./App";

export default function Dashboard({
  userName,
  subjects,
}: {
  userName: string | null;
  startDateStr: string | null;
  subjects: typeof DEFAULT_SUBJECTS;
  milestones: any[];
  cycleLength: number;
  studyDays: number[];
  onNavigateToPractice: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exams, setExams] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const [examsData, resultsData] = await Promise.all([
        supabase
          .from("exams")
          .select("*")
          .order("accessible_at", { ascending: false }),
        supabase
          .from("exam_results")
          .select("*, exam:exams(title, subject_code)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      setExams(examsData.data || []);
      setResults(resultsData.data || []);
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

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "32px",
        }}
      >
        <h1 style={{ fontSize: "24px", fontFamily: "var(--font-display)" }}>
          Welcome, {user?.user_metadata?.full_name || userName || "Student"}
        </h1>
        <div>
          <button
            onClick={() => navigate("/admin")}
            style={{
              marginRight: "12px",
              padding: "8px 16px",
              background: "var(--cream-dark)",
              border: "1px solid var(--cream-border)",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Admin Portal
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              background: "var(--red-bg)",
              color: "var(--red)",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}
      >
        {/* Available Exams */}
        <div>
          <h2
            style={{
              fontSize: "18px",
              marginBottom: "16px",
              color: "var(--ink)",
            }}
          >
            Available Live Exams
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {exams.length === 0 ? (
              <div style={{ color: "var(--ink-muted)" }}>
                No live exams scheduled.
              </div>
            ) : (
              exams.map((exam) => {
                const isAccessible = new Date() >= new Date(exam.accessible_at);
                const hasTaken = results.some((r) => r.exam_id === exam.id);

                return (
                  <div
                    key={exam.id}
                    style={{
                      background: "white",
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid var(--cream-border)",
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                      {exam.title} ({exam.subject_code})
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--ink-muted)",
                        marginBottom: "12px",
                      }}
                    >
                      Access starts:{" "}
                      {new Date(exam.accessible_at).toLocaleString()}
                    </div>

                    {hasTaken ? (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--green)",
                          fontWeight: 500,
                        }}
                      >
                        ✓ Exam Completed
                      </div>
                    ) : (
                      <button
                        onClick={() => navigate(`/exam/${exam.id}`)}
                        disabled={!isAccessible}
                        style={{
                          padding: "8px 16px",
                          background: isAccessible
                            ? "var(--accent)"
                            : "var(--cream-dark)",
                          color: isAccessible ? "white" : "var(--ink-faint)",
                          border: "none",
                          borderRadius: "4px",
                          cursor: isAccessible ? "pointer" : "not-allowed",
                          width: "100%",
                        }}
                      >
                        {isAccessible ? "Start Exam" : "Not Yet Available"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Previous Results */}
        <div>
          <h2
            style={{
              fontSize: "18px",
              marginBottom: "16px",
              color: "var(--ink)",
            }}
          >
            Your Recent Results
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {results.length === 0 ? (
              <div style={{ color: "var(--ink-muted)" }}>
                You haven't taken any exams yet.
              </div>
            ) : (
              results.map((result) => (
                <div
                  key={result.id}
                  style={{
                    background: "white",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid var(--cream-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                      {result.exam?.title || "Unknown Exam"}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                    >
                      {new Date(result.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: "bold",
                      color: result.score >= 75 ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {result.score}%
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
