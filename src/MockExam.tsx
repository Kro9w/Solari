import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { Bookmark } from "lucide-react";

export type Option = { letter: string; text: string; correct: boolean };
export type Question = {
  number: number;
  originalIndex: number;
  stem: string;
  options: Option[];
  explanation?: string;
};

// ── item parser
export function parseExamMetadata(
  raw: string,
): { code: string; durationSeconds?: number } | null {
  const firstLine =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) || "";

  const match = firstLine.match(/^([A-Z]{2,6}_[A-Z0-9]+)(?:_(\d{1,3}))?$/i);
  if (!match) return null;

  const code = match[1].toUpperCase();
  let durationSeconds: number | undefined = undefined;

  if (match[2]) {
    const minutes = parseInt(match[2], 10);
    const validMinutes = Math.min(minutes, 150);
    durationSeconds = validMinutes * 60;
  }

  return { code, durationSeconds };
}

export function parseQuestions(raw: string): Question[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const questions: Question[] = [];
  let current: (Partial<Question> & { options: Option[] }) | null = null;

  const questionReNew = /^Q\.\s+(.+)$/i;
  const optionReNew = /^(\*?)O\.\s+(.+)$/i;
  const explanationRe = /^Y:\s+(.+)$/i;
  const examCodeRe = /^[A-Z]{2,6}_[A-Z0-9]+(_\d{1,3})?$/i;

  let questionCounter = 1;

  for (const line of lines) {
    if (examCodeRe.test(line)) continue;

    const qMatchNew = line.match(questionReNew);
    const oMatchNew = line.match(optionReNew);
    const yMatch = line.match(explanationRe);

    if (qMatchNew) {
      if (current && current.stem && current.options.length > 0)
        questions.push(current as Question);

      const stemText = qMatchNew[1];
      current = {
        number: questionCounter++,
        originalIndex: questionCounter - 2,
        stem: stemText,
        options: [],
      };
    } else if (oMatchNew && current) {
      const isCorrect = oMatchNew[1] === "*";
      const text = oMatchNew[2].trim();
      const letters = ["A", "B", "C", "D"];
      const letter = letters[current.options.length] || "?";

      current.options.push({
        letter,
        text,
        correct: isCorrect,
      });
    } else if (yMatch && current) {
      current.explanation = yMatch[1].trim();
    } else if (
      current &&
      !qMatchNew &&
      !oMatchNew &&
      !yMatch &&
      line.length > 0
    ) {
      if (current.explanation) {
        current.explanation += " " + line;
      } else {
        current.stem += " " + line;
      }
    }
  }
  if (current && current.stem && current.options.length > 0)
    questions.push(current as Question);
  return questions;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const navBtnStyle = {
  padding: "12px 24px",
  background: "var(--cream-dark)",
  color: "var(--ink)",
  border: "1px solid var(--cream-border)",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "14px",
  transition: "all 0.15s ease",
};

export default function MockExam({ isRestDay }: { isRestDay: boolean }) {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [examCode, setExamCode] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [phase, setPhase] = useState<"load" | "exam" | "review">("load");
  const [examDuration, setExamDuration] = useState(3600);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [scorePercent, setScorePercent] = useState(0);

  useEffect(() => {
    async function loadExam() {
      if (!examId) return;
      try {
        const { data, error } = await supabase
          .from("exams")
          .select("*")
          .eq("id", examId)
          .single();

        if (error) throw error;

        const now = new Date();
        const accessTime = new Date(data.accessible_at);
        if (now < accessTime) {
          throw new Error("This exam is not yet accessible.");
        }

        const metadata = parseExamMetadata(data.file_content);
        const parsed = parseQuestions(data.file_content);

        // Shuffle questions but KEEP options exactly as A, B, C, D
        const shuffledQuestions = shuffleArray(parsed).map((q, idx) => ({
          ...q,
          number: idx + 1,
        }));

        setExamCode(data.subject_code);
        setQuestions(shuffledQuestions);
        setExamDuration(
          (data.duration_minutes || metadata?.durationSeconds || 60) * 60,
        );
        setPhase("exam");
        startTimer();
      } catch (err: any) {
        setError(err.message || "Failed to load exam.");
      } finally {
        setLoading(false);
      }
    }

    loadExam();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examId]);

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= examDuration) {
          clearInterval(timerRef.current!);
          finishExam(examDuration);
          return examDuration;
        }
        return e + 1;
      });
    }, 1000);
  }

  function choose(letter: string) {
    setAnswers((prev) => ({ ...prev, [current]: letter }));
  }

  function toggleBookmark() {
    setBookmarks((prev) =>
      prev.includes(current)
        ? prev.filter((b) => b !== current)
        : [...prev, current],
    );
  }

  async function finishExam(timeTaken: number) {
    if (timerRef.current) clearInterval(timerRef.current);

    const correctCount = questions.filter((q, i) => {
      const chosen = answers[i];
      return chosen && q.options.find((o) => o.letter === chosen)?.correct;
    }).length;

    const score = Math.round((correctCount / questions.length) * 100);
    setScorePercent(score);

    const userName = user?.user_metadata?.first_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim()
      : "Student";

    // Re-map answers from shuffled index to original index for item analysis
    const originalIndexedAnswers: Record<number, string> = {};
    Object.keys(answers).forEach((shuffledIdx) => {
      const q = questions[parseInt(shuffledIdx, 10)];
      originalIndexedAnswers[q.originalIndex] =
        answers[parseInt(shuffledIdx, 10)];
    });

    try {
      await supabase.from("exam_results").insert({
        user_id: user?.id,
        user_name: userName,
        exam_id: examId,
        score,
        correct_count: correctCount,
        total_count: questions.length,
        answers: originalIndexedAnswers,
        time_taken: timeTaken,
      });
    } catch (err) {
      console.error("Failed to save results:", err);
    }

    setPhase("review");
  }

  if (loading) return <div style={{ padding: "24px" }}>Loading exam...</div>;
  if (error)
    return <div style={{ padding: "24px", color: "var(--red)" }}>{error}</div>;

  if (phase === "exam" && questions.length > 0) {
    const q = questions[current];
    const remaining = examDuration - elapsed;
    const answeredCount = Object.keys(answers).length;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "var(--cream)",
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: "20px 24px",
            paddingBottom: "12px",
            borderBottom: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <div style={{ fontSize: "16px", color: "var(--ink-muted)" }}>
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                {examCode}
              </span>{" "}
              · Full exam
            </div>
            <div style={{ fontSize: "16px", color: "var(--ink)" }}>
              {formatTime(remaining)}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              fontSize: "14px",
              color: "var(--ink-muted)",
            }}
          >
            <div>
              {answeredCount}/{questions.length} answered
            </div>
            <div>
              {current + 1}/{questions.length}
            </div>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: "4px",
              background: "var(--cream-dark)",
              borderRadius: "2px",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "var(--sienna)",
                width: `${((current + 1) / questions.length) * 100}%`,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Bookmarks */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "24px",
            }}
          >
            <button
              style={{
                padding: "6px 16px",
                border: "1px solid var(--cream-border)",
                borderRadius: "6px",
                background: "var(--cream-dark)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                color: "var(--ink-muted)",
                cursor: "pointer",
              }}
            >
              <Bookmark size={16} fill="currentColor" /> Bookmarks (
              {bookmarks.length})
            </button>
          </div>
        </div>

        {/* Scrollable Question Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
          <div
            style={{
              maxWidth: "700px",
              margin: "0 auto",
              paddingBottom: "100px",
            }}
          >
            {/* Question Card */}
            <div
              style={{
                background: "white",
                border: "1px solid var(--cream-border)",
                borderRadius: "12px",
                padding: "24px",
                marginTop: "16px",
                marginBottom: "24px",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                  marginBottom: "16px",
                }}
              >
                Question {current + 1}
              </div>

              <button
                onClick={toggleBookmark}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: bookmarks.includes(current)
                    ? "var(--sienna)"
                    : "var(--cream-dark)",
                  padding: 0,
                }}
              >
                <Bookmark
                  size={24}
                  fill={bookmarks.includes(current) ? "currentColor" : "none"}
                  strokeWidth={bookmarks.includes(current) ? 0 : 2}
                />
              </button>

              <div
                style={{
                  fontSize: "18px",
                  color: "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                {q.stem}
              </div>
            </div>

            {/* Options */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {q.options.map((opt) => {
                const isSelected = answers[current] === opt.letter;
                return (
                  <div
                    key={opt.letter}
                    onClick={() => choose(opt.letter)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "16px",
                      background: "white",
                      border: `1px solid ${isSelected ? "var(--ink)" : "var(--cream-border)"}`,
                      borderRadius: "8px",
                      cursor: "pointer",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: `1px solid ${isSelected ? "var(--ink)" : "var(--ink-muted)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: isSelected ? "var(--ink)" : "var(--ink-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {opt.letter}
                    </div>
                    <div
                      style={{
                        fontSize: "16px",
                        color: "var(--ink)",
                        lineHeight: 1.4,
                      }}
                    >
                      {opt.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div
          style={{
            padding: "20px 24px",
            background: "var(--cream)",
            borderTop: "none",
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            paddingBottom: "env(safe-area-inset-bottom, 24px)",
          }}
        >
          <button
            disabled={current === 0}
            onClick={() => setCurrent(0)}
            style={{ ...navBtnStyle, opacity: current === 0 ? 0.5 : 1 }}
          >
            «
          </button>
          <button
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            style={{ ...navBtnStyle, opacity: current === 0 ? 0.5 : 1 }}
          >
            ← Previous
          </button>

          <button
            onClick={() => finishExam(elapsed)}
            style={{ ...navBtnStyle }}
          >
            Submit early
          </button>

          <button
            disabled={current === questions.length - 1}
            onClick={() => setCurrent((c) => c + 1)}
            style={{
              ...navBtnStyle,
              opacity: current === questions.length - 1 ? 0.5 : 1,
            }}
          >
            Next →
          </button>
          <button
            disabled={current === questions.length - 1}
            onClick={() => setCurrent(questions.length - 1)}
            style={{
              ...navBtnStyle,
              opacity: current === questions.length - 1 ? 0.5 : 1,
            }}
          >
            »
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div
        style={{
          padding: "24px",
          maxWidth: "600px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "24px", marginBottom: "16px" }}>
          Exam Submitted!
        </h2>
        <div
          style={{
            fontSize: "48px",
            fontWeight: "bold",
            color: scorePercent >= 75 ? "var(--green)" : "var(--red)",
            marginBottom: "24px",
          }}
        >
          {scorePercent}%
        </div>
        <p>Your results have been securely logged.</p>
        <button
          onClick={() => navigate("/")}
          style={{
            marginTop: "24px",
            padding: "12px 24px",
            background: "var(--ink)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return null;
}
