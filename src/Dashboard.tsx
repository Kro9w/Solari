import { useState, useEffect } from "react";
import { supabase } from "./utils/supabase";

type ExamResult = {
  id: string;
  exam: {
    title: string;
    subjectCode: string;
  };
  score: number;
  total: number;
  createdAt: string;
};

export default function Dashboard() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("ExamResult")
          .select("id, score, total, createdAt, exam:Exam(title, subjectCode)")
          .eq("userId", user.id)
          .order("createdAt", { ascending: false });

        if (error) throw error;
        setResults(data as any);
      } catch (err) {
        console.error("Failed to fetch results:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--ink-muted)" }}>
        Loading results...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div>
        <div
          style={{
            fontSize: "calc(20px * var(--scale, 1))",
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 16,
          }}
        >
          Past Live Sessions
        </div>

        {results.length === 0 ? (
          <div
            style={{
              padding: 24,
              background: "var(--cream-dark)",
              borderRadius: "var(--radius)",
              textAlign: "center",
              color: "var(--ink-muted)",
            }}
          >
            No exam results found yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.map((r) => {
              const pct = (r.score / r.total) * 100;
              const passed = pct >= 75;

              return (
                <div
                  key={r.id}
                  style={{
                    padding: 16,
                    background: "var(--cream)",
                    border: "1px solid var(--cream-border)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "calc(15px * var(--scale, 1))",
                        fontWeight: 500,
                        color: "var(--ink)",
                      }}
                    >
                      {r.exam.title}
                    </div>
                    <div
                      style={{
                        fontSize: "calc(13px * var(--scale, 1))",
                        color: "var(--ink-muted)",
                        marginTop: 4,
                      }}
                    >
                      {new Date(r.createdAt).toLocaleDateString()} •{" "}
                      {r.exam.subjectCode}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "calc(16px * var(--scale, 1))",
                        fontWeight: 600,
                        color: passed ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {pct.toFixed(1)}%
                    </div>
                    <div
                      style={{
                        fontSize: "calc(12px * var(--scale, 1))",
                        color: "var(--ink-muted)",
                      }}
                    >
                      {r.score} / {r.total}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
