import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";

export type Option = { letter: string; text: string; correct: boolean };
export type Question = {
  number: number;
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
      current = { number: questionCounter++, stem: stemText, options: [] };
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

  async function finishExam(timeTaken: number) {
    if (timerRef.current) clearInterval(timerRef.current);

    const correctCount = questions.filter((q, i) => {
      const chosen = answers[i];
      return chosen && q.options.find((o) => o.letter === chosen)?.correct;
    }).length;

    const score = Math.round((correctCount / questions.length) * 100);
    setScorePercent(score);

    try {
      await supabase.from("exam_results").insert({
        user_id: user?.id,
        exam_id: examId,
        score,
        correct_count: correctCount,
        total_count: questions.length,
        answers: answers,
        time_taken: timeTaken,
      });
    } catch (err) {
      console.error("Failed to save results:", err);
    }

    setPhase("review");
  }

  if (loading) return <div style={{ padding: "24px" }}>Loading exam...</div>;
  if (error)
    return <div style={{ padding: "24px", color: "red" }}>{error}</div>;

  if (phase === "exam" && questions.length > 0) {
    const q = questions[current];
    const isLast = current === questions.length - 1;
    const remaining = examDuration - elapsed;

    return (
      <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            {examCode} - Q {current + 1} of {questions.length}
          </div>
          <div style={{ color: remaining <= 300 ? "red" : "black" }}>
            Time: {formatTime(remaining)}
          </div>
        </div>

        <div
          style={{
            background: "var(--cream)",
            padding: "24px",
            borderRadius: "8px",
            marginBottom: "16px",
            border: "1px solid var(--cream-border)",
          }}
        >
          <p
            style={{ fontSize: "16px", fontWeight: 500, marginBottom: "16px" }}
          >
            {q.stem}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {q.options.map((opt) => (
              <button
                key={opt.letter}
                onClick={() => choose(opt.letter)}
                style={{
                  textAlign: "left",
                  padding: "12px",
                  background:
                    answers[current] === opt.letter
                      ? "var(--accent-bg)"
                      : "white",
                  border: `1px solid ${answers[current] === opt.letter ? "var(--accent)" : "var(--cream-border)"}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                <strong>{opt.letter}.</strong> {opt.text}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            style={{
              padding: "8px 16px",
              cursor: current === 0 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>

          <button
            onClick={() =>
              isLast ? finishExam(elapsed) : setCurrent((c) => c + 1)
            }
            style={{
              padding: "8px 16px",
              background: isLast ? "var(--accent)" : "var(--cream-dark)",
              color: isLast ? "white" : "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {isLast ? "Submit Exam" : "Next"}
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
            background: "var(--accent)",
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
