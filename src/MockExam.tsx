import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { Bookmark } from "lucide-react";
import icon from "../icon.png";
import { withViewTransition } from "./utils/viewTransition";

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
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "14px",
  transition: "all 0.15s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);

  const [syncStatus, setSyncStatus] = useState<
    "synced" | "syncing" | "offline"
  >("synced");
  const [isLateTaker, setIsLateTaker] = useState(false);

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

        const endTime = new Date(
          accessTime.getTime() + (data.duration_minutes || 150) * 60000,
        );
        if (now > endTime && !data.is_reopened) {
          throw new Error("This exam is closed.");
        }

        const metadata = parseExamMetadata(data.file_content);
        const parsed = parseQuestions(data.file_content);

        const standardDurationSeconds =
          (data.duration_minutes || metadata?.durationSeconds || 60) * 60;

        // If not reopened indefinitely, calculate the remaining real-world seconds until endTime
        let actualRemainingSeconds = standardDurationSeconds;
        if (!data.is_reopened) {
          const secondsUntilEnd = Math.max(
            0,
            Math.floor((endTime.getTime() - now.getTime()) / 1000),
          );
          actualRemainingSeconds = Math.min(
            secondsUntilEnd,
            standardDurationSeconds,
          );
        } else if (now > endTime) {
          setIsLateTaker(true);
        }

        let loadedQuestions: Question[] | null = null;
        let loadedAnswers: Record<number, string> = {};
        let loadedBookmarks: number[] = [];
        let loadedElapsed = 0;
        let loadedCurrent = 0;

        if (user?.id) {
          const localKey = `exam_session_${user.id}_${examId}`;
          const localStr = localStorage.getItem(localKey);
          let localState: any = null;
          if (localStr) {
            try {
              localState = JSON.parse(localStr);
            } catch (e) {}
          }

          const { data: remoteSession } = await supabase
            .from("exam_sessions")
            .select("state, updated_at")
            .eq("user_id", user.id)
            .eq("exam_id", examId)
            .single();

          let bestState: any = null;

          if (localState && remoteSession) {
            const localTime = new Date(localState.updated_at || 0).getTime();
            const remoteTime = new Date(
              remoteSession.updated_at || 0,
            ).getTime();
            bestState =
              localTime > remoteTime ? localState : remoteSession.state;
          } else {
            bestState =
              localState || (remoteSession ? remoteSession.state : null);
          }

          if (
            bestState &&
            bestState.questions &&
            bestState.questions.length > 0
          ) {
            loadedQuestions = bestState.questions;
            loadedAnswers = bestState.answers || {};
            loadedBookmarks = bestState.bookmarks || [];
            loadedElapsed = bestState.elapsed || 0;
            loadedCurrent = bestState.current || 0;
          }
        }

        if (!loadedQuestions) {
          loadedQuestions = shuffleArray(parsed).map((q, idx) => ({
            ...q,
            number: idx + 1,
          }));
        }

        setExamCode(data.subject_code);
        setQuestions(loadedQuestions);
        setAnswers(loadedAnswers);
        setBookmarks(loadedBookmarks);

        // Final Duration is `elapsed + actualRemainingSeconds`
        // This ensures `finalDuration - elapsed = actualRemainingSeconds`
        const calculatedFinalDuration = loadedElapsed + actualRemainingSeconds;

        setElapsed(loadedElapsed);
        setCurrent(loadedCurrent);
        setExamDuration(calculatedFinalDuration);
        setPhase("exam");
        startTimer(loadedElapsed, calculatedFinalDuration);
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
  }, [examId, user]);

  function startTimer(initialElapsed: number, duration: number) {
    setElapsed(initialElapsed);
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const nextElapsed = e + 1;
        if (nextElapsed >= duration) {
          clearInterval(timerRef.current!);
          return duration;
        }
        return nextElapsed;
      });
    }, 1000);
  }

  // Ref to hold the latest elapsed time so the interaction-based sync gets the latest time without triggering sync every second
  const latestElapsedRef = useRef(elapsed);
  useEffect(() => {
    latestElapsedRef.current = elapsed;
  }, [elapsed]);

  // Handle auto-submit securely when time runs out without using stale closure
  useEffect(() => {
    if (phase === "exam" && elapsed >= examDuration && questions.length > 0) {
      finishExam(examDuration);
    }
  }, [elapsed, examDuration, phase, questions, answers]); // Depend on answers/questions so finishExam gets freshest state

  useEffect(() => {
    if (phase !== "exam" || questions.length === 0 || !user?.id || !examId)
      return;

    const saveSession = async () => {
      setSyncStatus("syncing");

      // If they are a late taker, explicitly check if the admin turned the reopen toggle off mid-exam
      if (isLateTaker) {
        try {
          const { data: currentExam } = await supabase
            .from("exams")
            .select("is_reopened")
            .eq("id", examId)
            .single();
          if (currentExam && currentExam.is_reopened === false) {
            alert(
              "The administrator has closed this exam. Your progress will be submitted now.",
            );
            finishExam(latestElapsedRef.current);
            return;
          }
        } catch (err) {
          // Ignore network errors here, let the session save offline
        }
      }

      const state = {
        questions,
        answers,
        bookmarks,
        current,
        elapsed: latestElapsedRef.current,
        updated_at: new Date().toISOString(),
      };

      const localKey = `exam_session_${user.id}_${examId}`;
      localStorage.setItem(localKey, JSON.stringify(state));

      const userName = user?.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim()
        : "Student";

      try {
        const { error } = await supabase.from("exam_sessions").upsert(
          {
            user_id: user.id,
            exam_id: examId,
            user_name: userName,
            state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,exam_id" },
        );

        if (error) throw error;
        setSyncStatus("synced");
      } catch (err) {
        // Silent fail for network issues, local is saved
        setSyncStatus("offline");
      }
    };

    // Only save when user interacts (answers, bookmarks, current page changes), NOT when elapsed changes
    const timeout = setTimeout(saveSession, 500);
    return () => clearTimeout(timeout);
  }, [answers, bookmarks, current, phase, questions, user, examId]);

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

      if (user?.id && examId) {
        const localKey = `exam_session_${user.id}_${examId}`;
        localStorage.removeItem(localKey);
        await supabase
          .from("exam_sessions")
          .delete()
          .eq("user_id", user.id)
          .eq("exam_id", examId);
      }
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
              marginBottom: "12px",
            }}
          >
            <div
              style={{ fontSize: "16px", color: "var(--ink-muted)", flex: 1 }}
            >
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                {examCode}
              </span>{" "}
              · Full exam
            </div>

            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "12px",
                fontWeight: 500,
                color:
                  syncStatus === "offline" ? "var(--red)" : "var(--ink-faint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {syncStatus === "syncing" && (
                <>
                  <span className="exam-nav-text">Syncing...</span>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--ink-muted)",
                      display: "inline-block",
                    }}
                  ></span>
                </>
              )}
              {syncStatus === "synced" && (
                <>
                  <span className="exam-nav-text">Saved</span>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--green)",
                      display: "inline-block",
                    }}
                  ></span>
                </>
              )}
              {syncStatus === "offline" && (
                <>
                  <span
                    className="exam-nav-text"
                    style={{ color: "var(--red)" }}
                  >
                    Offline (Saved Locally)
                  </span>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--red)",
                      display: "inline-block",
                    }}
                  ></span>
                </>
              )}
            </div>

            <div
              style={{
                fontSize: "16px",
                fontWeight: 500,
                flex: 1,
                textAlign: "right",
                color:
                  remaining <= 60
                    ? "var(--red)"
                    : remaining <= 300
                      ? "var(--accent)"
                      : "var(--ink-muted)",
                transition: "color 0.3s ease",
              }}
            >
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
              height: "6px",
              background: "var(--cream-border)",
              borderRadius: "3px",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "var(--accent)",
                width: `${(answeredCount / questions.length) * 100}%`,
                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>
        </div>

        {/* Scrollable Question Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            scrollbarGutter: "stable",
            padding: "0 24px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              maxWidth: "700px",
              width: "100%",
              margin: "0 auto auto auto",
              paddingBottom: "24px",
            }}
          >
            {/* Bookmarks */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: "24px",
                marginBottom: "16px",
              }}
            >
              <button
                onClick={() => setShowBookmarksModal(true)}
                style={{
                  padding: "6px 16px",
                  border: "1px solid var(--cream-border)",
                  borderRadius: "20px",
                  background: "var(--cream-dark)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Bookmark size={16} fill="currentColor" /> Bookmarks (
                {bookmarks.length})
              </button>
            </div>

            {/* Question Card */}
            <div
              style={{
                background: "var(--cream-dark)",
                border: "1px solid var(--cream-border)",
                borderRadius: "10px",
                padding: "24px",
                marginBottom: "24px",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                  marginBottom: "16px",
                  fontWeight: 500,
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
                    : "var(--ink-faint)",
                  padding: 0,
                  transition:
                    "color 0.2s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: bookmarks.includes(current)
                    ? "scale(1.1)"
                    : "scale(1)",
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
                      background: isSelected
                        ? "var(--accent-bg)"
                        : "var(--cream-dark)",
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--cream-border)"}`,
                      borderRadius: "10px",
                      cursor: "pointer",
                      gap: "16px",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: `1px solid ${isSelected ? "var(--accent)" : "var(--ink-muted)"}`,
                        background: isSelected
                          ? "var(--accent)"
                          : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: isSelected ? "var(--cream)" : "var(--ink-muted)",
                        flexShrink: 0,
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    >
                      {opt.letter}
                    </div>
                    <div
                      style={{
                        fontSize: "16px",
                        color: isSelected ? "var(--accent)" : "var(--ink)",
                        lineHeight: 1.4,
                        transition: "color 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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

        {/* Bookmarks Modal */}
        {showBookmarksModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "24px",
            }}
          >
            <div
              style={{
                background: "var(--cream)",
                borderRadius: "12px",
                padding: "24px",
                width: "100%",
                maxWidth: "400px",
                border: "1px solid var(--cream-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3
                  style={{
                    fontSize: "20px",
                    color: "var(--ink)",
                    fontFamily: "var(--font-display)",
                    margin: 0,
                  }}
                >
                  Bookmarked Questions
                </h3>
                <button
                  onClick={() => setShowBookmarksModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "24px",
                    cursor: "pointer",
                    color: "var(--ink-muted)",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>

              {bookmarks.length === 0 ? (
                <p
                  style={{
                    color: "var(--ink-muted)",
                    textAlign: "center",
                    margin: "24px 0",
                  }}
                >
                  No bookmarks yet.
                </p>
              ) : (
                <div
                  style={{
                    overflowY: "auto",
                    scrollbarGutter: "stable",
                    flex: 1,
                    paddingRight: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {bookmarks.map((bIndex) => (
                    <button
                      key={bIndex}
                      onClick={() => {
                        setCurrent(bIndex);
                        setShowBookmarksModal(false);
                      }}
                      style={{
                        padding: "12px 16px",
                        background: "var(--cream-dark)",
                        border: "1px solid var(--cream-border)",
                        borderRadius: "8px",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "var(--ink)",
                        fontSize: "14px",
                        fontWeight: 500,
                        transition: "all 0.2s ease",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Question {bIndex + 1}</span>
                      <Bookmark
                        size={16}
                        fill="var(--sienna)"
                        color="var(--sienna)"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Confirmation Modal */}
        {showSubmitModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "24px",
            }}
          >
            <div
              style={{
                background: "var(--cream)",
                borderRadius: "12px",
                padding: "24px",
                width: "100%",
                maxWidth: "400px",
                border: "1px solid var(--cream-border)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  marginBottom: "8px",
                  color: "var(--ink)",
                  fontFamily: "var(--font-display)",
                }}
              >
                Submit Exam?
              </h3>
              <p style={{ color: "var(--ink-muted)", marginBottom: "16px" }}>
                Are you sure you want to submit your exam? You have answered{" "}
                {answeredCount} out of {questions.length} questions.
              </p>
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "var(--ink-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Please type <strong>Confirm Submission</strong> below.
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Confirm Submission"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--cream-border)",
                    background: "var(--cream-dark)",
                    color: "var(--ink)",
                    fontSize: "16px",
                    outline: "none",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => {
                    setShowSubmitModal(false);
                    setConfirmText("");
                  }}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "6px",
                    background: "var(--cream-dark)",
                    border: "1px solid var(--cream-border)",
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={confirmText !== "Confirm Submission"}
                  onClick={() => {
                    setShowSubmitModal(false);
                    setConfirmText("");
                    finishExam(elapsed);
                  }}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "6px",
                    background:
                      confirmText === "Confirm Submission"
                        ? "var(--accent)"
                        : "var(--cream-border)",
                    border:
                      confirmText === "Confirm Submission"
                        ? "1px solid var(--accent-light)"
                        : "1px solid var(--cream-border)",
                    color:
                      confirmText === "Confirm Submission"
                        ? "var(--cream)"
                        : "var(--ink-faint)",
                    cursor:
                      confirmText === "Confirm Submission"
                        ? "pointer"
                        : "not-allowed",
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                  }}
                >
                  Confirm Submission
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <div
          style={{
            padding: "16px 24px",
            background: "var(--cream)",
            borderTop: "1px solid var(--cream-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
            margin: "auto auto 0 auto",
            width: "100%",
            maxWidth: "700px",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          }}
        >
          <button
            disabled={current === 0}
            onClick={() => setCurrent(0)}
            className="exam-nav-btn-icon-only"
            style={{
              ...navBtnStyle,
              opacity: current === 0 ? 0.5 : 1,
              padding: "12px 16px",
            }}
          >
            «
          </button>
          <button
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            style={{ ...navBtnStyle, opacity: current === 0 ? 0.5 : 1 }}
          >
            ←{" "}
            <span className="exam-nav-text" style={{ marginLeft: "4px" }}>
              Previous
            </span>
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="exam-nav-btn-submit"
            style={{
              ...navBtnStyle,
              background: "transparent",
              border: "none",
              color: "var(--ink-muted)",
              textDecoration: "underline",
            }}
          >
            {answeredCount === questions.length ? "Submit" : "Submit early"}
          </button>

          <button
            disabled={current === questions.length - 1}
            onClick={() => setCurrent((c) => c + 1)}
            style={{
              ...navBtnStyle,
              opacity: current === questions.length - 1 ? 0.5 : 1,
            }}
          >
            <span className="exam-nav-text" style={{ marginRight: "4px" }}>
              Next
            </span>{" "}
            →
          </button>

          <button
            disabled={current === questions.length - 1}
            onClick={() => setCurrent(questions.length - 1)}
            className="exam-nav-btn-icon-only"
            style={{
              ...navBtnStyle,
              opacity: current === questions.length - 1 ? 0.5 : 1,
              padding: "12px 16px",
            }}
          >
            »
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    const passed = scorePercent >= 75;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            width: "100%",
            textAlign: "center",
            background: "var(--cream-dark)",
            border: "1px solid var(--cream-border)",
            borderRadius: "14px",
            padding: "48px 32px",
          }}
        >
          <img
            src={icon}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              margin: "0 auto 24px",
              boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
            }}
          />

          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              fontWeight: 600,
              marginBottom: "8px",
            }}
          >
            {examCode} · Exam Submitted
          </div>

          <h2
            style={{
              fontSize: "26px",
              fontFamily: "var(--font-display)",
              color: "var(--ink)",
              margin: "0 0 28px 0",
            }}
          >
            Results are in
          </h2>

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "64px",
              fontWeight: "bold",
              lineHeight: 1,
              color: passed ? "var(--green)" : "var(--red)",
              marginBottom: "10px",
            }}
          >
            {scorePercent}%
          </div>
          <div
            style={{
              display: "inline-block",
              padding: "4px 14px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: passed ? "var(--green)" : "var(--red)",
              background: passed ? "var(--green-bg)" : "var(--red-bg)",
              marginBottom: "24px",
            }}
          >
            {passed ? "Passed" : "Below target"}
          </div>

          <p
            style={{
              fontSize: "14px",
              color: "var(--ink-muted)",
              lineHeight: 1.6,
              margin: "0 0 28px 0",
            }}
          >
            Your results have been securely logged. Review your item analysis
            anytime from the dashboard.
          </p>

          <button
            onClick={() => withViewTransition(() => navigate("/"))}
            style={{
              width: "100%",
              padding: "13px",
              background: "var(--accent-light)",
              color: "var(--cream)",
              border: "none",
              borderRadius: "6px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--accent)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--accent-light)")
            }
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
