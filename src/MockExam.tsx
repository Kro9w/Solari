import React, { useState, useEffect } from "react";
import { supabase } from "./utils/supabase";

type Option = { letter: string; text: string; correct: boolean };
type Question = {
  number: number;
  stem: string;
  options: Option[];
};

type SupabaseExam = {
  id: string;
  title: string;
  subjectCode: string;
  duration: number;
  rawText: string;
  accessibleAt: string;
};

// Parser expecting strict ABCD format and * for the correct answer.
function parseQuestions(text: string): Question[] {
  const lines = text.split(/\r?\n/);
  const questions: Question[] = [];
  let currentQ: Partial<Question> | null = null;
  let qCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect a question stem (e.g., "1. What is...", "Q. What is...", or just text if we don't have a current question and it doesn't look like an option)
    if (line.match(/^(\d+\.|Q\.)\s/)) {
      if (
        currentQ &&
        currentQ.stem &&
        currentQ.options &&
        currentQ.options.length > 0
      ) {
        questions.push(currentQ as Question);
      }
      currentQ = {
        number: qCounter++,
        stem: line.replace(/^(\d+\.|Q\.)\s*/, ""),
        options: [],
      };
    } else if (line.match(/^(\*?[A-D]\.)\s/)) {
      if (currentQ) {
        const isCorrect = line.startsWith("*");
        const letter = line.replace(/^\*?/, "").charAt(0);
        const optText = line.replace(/^\*?[A-D]\.\s*/, "");
        if (!currentQ.options) currentQ.options = [];
        currentQ.options.push({ letter, text: optText, correct: isCorrect });
      }
    } else {
      // Append to stem if we are building a question and haven't hit options yet
      if (currentQ && (!currentQ.options || currentQ.options.length === 0)) {
        currentQ.stem += "\n" + line;
      }
    }
  }
  if (
    currentQ &&
    currentQ.stem &&
    currentQ.options &&
    currentQ.options.length > 0
  ) {
    questions.push(currentQ as Question);
  }

  // Shuffle questions array but leave options in ABCD order
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  return questions;
}

export default function MockExam({
  onActiveChange,
  hideOnboarding,
}: {
  onActiveChange: (active: boolean) => void;
  hideOnboarding?: boolean;
}) {
  const [exams, setExams] = useState<SupabaseExam[]>([]);
  const [loading, setLoading] = useState(true);

  // Active exam state
  const [activeExam, setActiveExam] = useState<SupabaseExam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({}); // original question number -> chosen letter
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    async function fetchExams() {
      const { data, error } = await supabase
        .from("Exam")
        .select("*")
        .order("accessibleAt", { ascending: true });
      if (data) setExams(data);
      setLoading(false);
    }
    fetchExams();
  }, []);

  // Timer logic
  useEffect(() => {
    if (!activeExam || hasSubmitted) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeExam, hasSubmitted]);

  // Handle timeout submission safely using the latest answers state
  useEffect(() => {
    if (activeExam && !hasSubmitted && timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, activeExam, hasSubmitted]);

  const startExam = (exam: SupabaseExam) => {
    const parsed = parseQuestions(exam.rawText);
    if (parsed.length === 0) {
      alert("No valid questions found in this exam file.");
      return;
    }
    setQuestions(parsed);
    setActiveExam(exam);
    setTimeLeft(exam.duration * 60);
    setAnswers({});
    setCurrentIndex(0);
    setHasSubmitted(false);
    onActiveChange(true);
  };

  const handleOptionSelect = (qNumber: number, letter: string) => {
    setAnswers((prev) => ({ ...prev, [qNumber]: letter }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    let score = 0;
    questions.forEach((q) => {
      const chosenLetter = answers[q.number];
      const correctOpt = q.options.find((o) => o.correct);
      if (chosenLetter && correctOpt && chosenLetter === correctOpt.letter) {
        score++;
      }
    });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("ExamResult").insert({
          userId: user.id,
          examId: activeExam!.id,
          score,
          total: questions.length,
          answers,
        });
      }
    } catch (err) {
      console.error("Failed to save results:", err);
    }

    setHasSubmitted(true);
    setIsSubmitting(false);
    onActiveChange(false);

    alert(`Exam completed! You scored ${score} out of ${questions.length}.`);

    // reset to list
    setActiveExam(null);
  };

  if (loading)
    return (
      <div style={{ padding: 24, color: "var(--ink-muted)" }}>
        Loading available exams...
      </div>
    );

  if (activeExam && !hasSubmitted) {
    const currentQ = questions[currentIndex];
    const hrs = Math.floor(timeLeft / 3600);
    const mins = Math.floor((timeLeft % 3600) / 60);
    const secs = timeLeft % 60;
    const timeString =
      hrs > 0
        ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
        : `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "var(--cream)",
        }}
      >
        {/* Exam Header */}
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--cream-border)",
            background: "var(--cream)",
            flexShrink: 0,
            paddingTop: "max(16px, env(safe-area-inset-top))",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--ink-muted)",
            }}
          >
            Question {currentIndex + 1} of {questions.length}
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: timeLeft < 300 ? "var(--red)" : "var(--ink)",
            }}
          >
            {timeString}
          </div>
        </div>

        {/* Scrollable Question Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "var(--ink)",
              marginBottom: "32px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {currentQ.stem}
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {currentQ.options.map((opt) => {
              const isSelected = answers[currentQ.number] === opt.letter;
              return (
                <button
                  key={opt.letter}
                  onClick={() =>
                    handleOptionSelect(currentQ.number, opt.letter)
                  }
                  style={{
                    padding: "16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    background: isSelected
                      ? "var(--accent-bg)"
                      : "var(--cream-dark)",
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--cream-border)"}`,
                    borderRadius: "var(--radius)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isSelected ? "var(--accent)" : "var(--cream)",
                      color: isSelected ? "white" : "var(--ink-muted)",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--cream-border)"}`,
                    }}
                  >
                    {opt.letter}
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      color: isSelected ? "var(--accent-dark)" : "var(--ink)",
                      lineHeight: 1.5,
                    }}
                  >
                    {opt.text}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Exam Navigation Footer */}
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid var(--cream-border)",
            display: "flex",
            justifyContent: "space-between",
            background: "var(--cream)",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
            disabled={currentIndex === 0}
            style={{
              padding: "12px 24px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--cream-border)",
              background: "var(--cream-dark)",
              color: "var(--ink)",
              fontWeight: 500,
              opacity: currentIndex === 0 ? 0.5 : 1,
            }}
          >
            Previous
          </button>

          {currentIndex === questions.length - 1 ? (
            <button
              onClick={() => {
                if (
                  window.confirm("Are you sure you want to submit your exam?")
                ) {
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
              style={{
                padding: "12px 24px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontWeight: 600,
                opacity: isSubmitting ? 0.5 : 1,
              }}
            >
              {isSubmitting ? "Submitting..." : "Submit Exam"}
            </button>
          ) : (
            <button
              onClick={() =>
                setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))
              }
              style={{
                padding: "12px 24px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontWeight: 500,
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    );
  }

  // Exam List
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "24px",
          marginBottom: "24px",
        }}
      >
        Upcoming Live Sessions
      </h2>

      {exams.length === 0 ? (
        <div
          style={{
            padding: 24,
            background: "var(--cream-dark)",
            borderRadius: "var(--radius)",
            textAlign: "center",
            color: "var(--ink-muted)",
          }}
        >
          No exams scheduled.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {exams.map((exam) => {
            const isAccessible = new Date() >= new Date(exam.accessibleAt);
            const dateStr = new Date(exam.accessibleAt).toLocaleString();

            return (
              <div
                key={exam.id}
                style={{
                  padding: 20,
                  background: "var(--cream-dark)",
                  border: "1px solid var(--cream-border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "var(--ink)",
                        marginBottom: 4,
                      }}
                    >
                      {exam.title}
                    </div>
                    <div
                      style={{ fontSize: "14px", color: "var(--ink-muted)" }}
                    >
                      Subject Code: {exam.subjectCode}
                    </div>
                    <div
                      style={{ fontSize: "14px", color: "var(--ink-muted)" }}
                    >
                      Duration: {exam.duration} mins
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: "1px solid var(--cream-border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      color: isAccessible ? "var(--green)" : "var(--ink-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {isAccessible ? "Available Now" : `Opens at ${dateStr}`}
                  </div>
                  <button
                    disabled={!isAccessible}
                    onClick={() => startExam(exam)}
                    style={{
                      padding: "8px 16px",
                      background: isAccessible
                        ? "var(--accent)"
                        : "var(--cream-border)",
                      color: isAccessible ? "white" : "var(--ink-muted)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: 500,
                      cursor: isAccessible ? "pointer" : "not-allowed",
                    }}
                  >
                    Start Session
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
