import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { DEFAULT_SUBJECTS } from "./App";
import { parseQuestions } from "./MockExam";
import { useNavigate } from "react-router-dom";
import icon from "../icon.png";
import LiveFeedback from "./LiveFeedback";

type Step = "SELECT_OR_CREATE_SET" | "MANAGE_SET";
type AdminTab = "MANAGE" | "ANALYTICS" | "LIVE_FEEDBACK";

// Modal component for deletion confirmations
const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--cream)",
          padding: "24px",
          borderRadius: "10px",
          border: "1px solid var(--cream-border)",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "24px",
            fontFamily: "var(--font-display)",
            color: "var(--ink)",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            color: "var(--ink-muted)",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
        >
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "var(--cream-dark)",
              border: "1px solid var(--cream-border)",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--ink)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "var(--red)",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "white",
              fontWeight: 500,
            }}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>("MANAGE");

  // Manage Sets State
  const [step, setStep] = useState<Step>("SELECT_OR_CREATE_SET");
  const [examSets, setExamSets] = useState<any[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);

  // Create Set State
  const [setTitle, setSetTitle] = useState("");
  const [setAccessibleAt, setSetAccessibleAt] = useState("");
  const [setIsPublic, setSetIsPublic] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [setMessage, setSetMessage] = useState("");

  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [draggedItemIdx, setDraggedItemIdx] = useState<number | null>(null);

  // Upload Exam State
  const [file, setFile] = useState<File | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // Deletion Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: "set" | "exam" | null;
    targetId: string | null;
    title: string;
    loading: boolean;
  }>({
    isOpen: false,
    type: null,
    targetId: null,
    title: "",
    loading: false,
  });

  // Analytics State
  const [analyticsSetId, setAnalyticsSetId] = useState<string>("");
  const [analyticsExamId, setAnalyticsExamId] = useState<string>("ALL");
  const [analyticsResults, setAnalyticsResults] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsExamContent, setAnalyticsExamContent] = useState<any | null>(
    null,
  );

  useEffect(() => {
    fetchExamSets();
  }, []);

  const fetchExamSets = async () => {
    setLoadingSets(true);
    const { data, error } = await supabase
      .from("exam_sets")
      .select(
        "*, exams(id, title, subject_code, duration_minutes, accessible_at, file_content)",
      )
      .order("created_at", { ascending: false });

    if (data) {
      const processedSets = data.map((set) => {
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

      if (selectedSet) {
        const updatedSet = processedSets.find((s) => s.id === selectedSet.id);
        if (updatedSet) setSelectedSet(updatedSet);
      }
      if (analyticsSetId === "" && processedSets.length > 0) {
        setAnalyticsSetId(processedSets[0].id);
      }
    }
    setLoadingSets(false);
  };

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setTitle || !setAccessibleAt) {
      setSetMessage("Please fill in title and accessible at.");
      return;
    }
    setCreatingSet(true);
    setSetMessage("");
    try {
      const { data, error } = await supabase
        .from("exam_sets")
        .insert({
          title: setTitle,
          accessible_at: new Date(setAccessibleAt).toISOString(),
          is_public: setIsPublic,
        })
        .select()
        .single();
      if (error) throw error;
      setSetMessage("Exam set created successfully!");
      setSetTitle("");
      setSetAccessibleAt("");
      setSetIsPublic(false);
      await fetchExamSets();
      if (data) {
        setSelectedSet({ ...data, exams: [] });
        setStep("MANAGE_SET");
      }
    } catch (err: any) {
      setSetMessage(err.message || "An error occurred.");
    } finally {
      setCreatingSet(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.targetId || !deleteModal.type) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));

    try {
      if (deleteModal.type === "set") {
        // Fetch all exams in the set to delete their children first (cascading)
        const { data: setExams } = await supabase
          .from("exams")
          .select("id")
          .eq("exam_set_id", deleteModal.targetId);
        if (setExams && setExams.length > 0) {
          const examIds = setExams.map((e) => e.id);
          const { error: err1 } = await supabase
            .from("exam_results")
            .delete()
            .in("exam_id", examIds);
          if (err1) throw err1;
          const { error: err2 } = await supabase
            .from("exam_sessions")
            .delete()
            .in("exam_id", examIds);
          if (err2) throw err2;
        }

        const { error: errExams } = await supabase
          .from("exams")
          .delete()
          .eq("exam_set_id", deleteModal.targetId);
        if (errExams) throw errExams;

        const { error: errSet } = await supabase
          .from("exam_sets")
          .delete()
          .eq("id", deleteModal.targetId);
        if (errSet) throw errSet;

        setStep("SELECT_OR_CREATE_SET");
        setSelectedSet(null);
      } else if (deleteModal.type === "exam") {
        // Delete dependent relations first to avoid 409 Conflict
        const { error: err1 } = await supabase
          .from("exam_results")
          .delete()
          .eq("exam_id", deleteModal.targetId);
        if (err1) throw err1;
        const { error: err2 } = await supabase
          .from("exam_sessions")
          .delete()
          .eq("exam_id", deleteModal.targetId);
        if (err2) throw err2;

        const { error: err3 } = await supabase
          .from("exams")
          .delete()
          .eq("id", deleteModal.targetId);
        if (err3) throw err3;

        const { data } = await supabase
          .from("exam_sets")
          .select(
            "*, exams(id, title, subject_code, duration_minutes, accessible_at)",
          )
          .eq("id", selectedSet.id)
          .single();
        if (data && data.exams) {
          const sorted = data.exams.sort(
            (a: any, b: any) =>
              new Date(a.accessible_at).getTime() -
              new Date(b.accessible_at).getTime(),
          );
          await recalculateExamTimes(sorted, selectedSet.accessible_at);
        }
      }
      await fetchExamSets();
    } catch (err: any) {
      console.error("Deletion failed:", err);
      alert(
        `Deletion failed: ${err.message || "Permissions or constraint error."}`,
      );
    } finally {
      setDeleteModal({
        isOpen: false,
        type: null,
        targetId: null,
        title: "",
        loading: false,
      });
    }
  };

  const promptDeleteSet = (e: React.MouseEvent, set: any) => {
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      type: "set",
      targetId: set.id,
      title: set.title,
      loading: false,
    });
  };

  const promptDeleteExam = (exam: any) => {
    setDeleteModal({
      isOpen: true,
      type: "exam",
      targetId: exam.id,
      title: exam.title,
      loading: false,
    });
  };

  const calculateExamSchedule = (examsArray: any[], baseTimeIso: string) => {
    const schedule: { id: string; accessible_at: string }[] = [];

    let baseTime = new Date(baseTimeIso);
    let startHour = baseTime.getHours();
    let startMinute = baseTime.getMinutes();

    let currentDayBase = new Date(baseTime); // Start of the current 8-hour daily block
    let currentTime = new Date(baseTime).getTime();

    for (let i = 0; i < examsArray.length; i++) {
      const exam = examsArray[i];
      const durationMs = (exam.duration_minutes || 150) * 60000;

      // If adding this exam exceeds 8 hours from current day's base time, move to next day
      if (
        currentTime + durationMs >
        currentDayBase.getTime() + 8 * 60 * 60 * 1000
      ) {
        // Move to next day
        currentDayBase.setDate(currentDayBase.getDate() + 1);
        currentDayBase.setHours(startHour, startMinute, 0, 0);
        currentTime = currentDayBase.getTime();
      }

      schedule.push({
        id: exam.id,
        accessible_at: new Date(currentTime).toISOString(),
      });

      currentTime += durationMs;
    }

    return schedule;
  };

  const recalculateExamTimes = async (
    examsArray: any[],
    baseTimeIso: string,
  ) => {
    const schedule = calculateExamSchedule(examsArray, baseTimeIso);
    for (let i = 0; i < schedule.length; i++) {
      const { id, accessible_at } = schedule[i];
      const exam = examsArray[i];
      if (exam.accessible_at !== accessible_at) {
        await supabase.from("exams").update({ accessible_at }).eq("id", id);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };
  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItemIdx === null || draggedItemIdx === dropIndex || !selectedSet)
      return;
    const newExams = [...selectedSet.exams];
    const [draggedItem] = newExams.splice(draggedItemIdx, 1);
    newExams.splice(dropIndex, 0, draggedItem);
    setSelectedSet({ ...selectedSet, exams: newExams });
    setDraggedItemIdx(null);
    await recalculateExamTimes(newExams, selectedSet.accessible_at);
    await fetchExamSets();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0]);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !examTitle || !selectedSet) return;
    if (selectedSet.exams && selectedSet.exams.length >= 6) {
      setUploadMessage("This exam set already has the maximum of 6 exams.");
      return;
    }
    setUploading(true);
    setUploadMessage("");
    try {
      const text = await file.text();
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const subjectCodeRaw = lines[0];
      const subjectCode = subjectCodeRaw.split("_")[0];
      if (!subjectCodeRaw.match(/^[A-Z]+(?:_[A-Z0-9]+)*$/i))
        throw new Error("Invalid format.");
      const questionCount = lines.filter(
        (l) => l.startsWith("Q.") || /^\d+\./.test(l),
      ).length;
      if (questionCount !== 100)
        throw new Error("Exactly 100 questions required.");

      const currentExams = selectedSet.exams || [];

      // Simulate adding the new exam to the end to find its scheduled time
      const dummyExamForCalculation = {
        id: "dummy",
        duration_minutes: 150,
      };

      const schedule = calculateExamSchedule(
        [...currentExams, dummyExamForCalculation],
        selectedSet.accessible_at,
      );
      const newExamSchedule = schedule[schedule.length - 1];

      const { error } = await supabase.from("exams").insert({
        exam_set_id: selectedSet.id,
        title: examTitle,
        subject_code: subjectCode,
        file_content: text,
        accessible_at: newExamSchedule.accessible_at,
        duration_minutes: 150,
      });
      if (error) throw error;
      setUploadMessage("Exam uploaded successfully!");
      setFile(null);
      setExamTitle("");
      const fileInput = document.getElementById("examFile") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      await fetchExamSets();
    } catch (err: any) {
      setUploadMessage(err.message || "An error occurred.");
    } finally {
      setUploading(false);
    }
  };

  // --- Analytics Logic ---
  useEffect(() => {
    if (activeTab === "ANALYTICS" && analyticsSetId) {
      fetchAnalyticsData();
    }
  }, [activeTab, analyticsSetId, analyticsExamId]);

  const fetchAnalyticsData = async () => {
    setAnalyticsLoading(true);
    let query = supabase
      .from("exam_results")
      .select("*, exam:exams(title, subject_code, exam_set_id, file_content)");

    // Always filter by set indirectly through exams or just fetch all and filter in JS
    // Since exam_set_id is not natively on exam_results but on exams, we fetch related and filter.
    const { data } = await query;
    let filtered = data || [];

    // Filter by Set
    filtered = filtered.filter((r) => r.exam?.exam_set_id === analyticsSetId);

    // Set specific exam content for Item Analysis if a specific exam is selected
    if (analyticsExamId !== "ALL") {
      filtered = filtered.filter((r) => r.exam_id === analyticsExamId);
      const targetExam = examSets
        .find((s) => s.id === analyticsSetId)
        ?.exams?.find((e: any) => e.id === analyticsExamId);
      if (targetExam) {
        setAnalyticsExamContent(parseQuestions(targetExam.file_content));
      }
    } else {
      setAnalyticsExamContent(null);
    }

    setAnalyticsResults(filtered);
    setAnalyticsLoading(false);
  };

  const getPassersAndTop10 = () => {
    if (!analyticsSetId || analyticsResults.length === 0)
      return { top10: [], passers: [] };

    const userMap: Record<
      string,
      { user_name: string; scores: Record<string, number> }
    > = {};

    // Group results by user
    analyticsResults.forEach((r) => {
      const code = r.exam?.subject_code?.split("_")[0];
      if (!userMap[r.user_id])
        userMap[r.user_id] = {
          user_name: r.user_name || "Unknown",
          scores: {},
        };
      userMap[r.user_id].scores[code] = r.score;
    });

    const studentStats = Object.values(userMap).map((student) => {
      let gwaSum = 0;
      let totalWeight = 0;
      let anyBelow50 = false;

      DEFAULT_SUBJECTS.forEach((sub) => {
        const s = student.scores[sub.short];
        if (s !== undefined) {
          gwaSum += s * (sub.weight / 100);
          totalWeight += sub.weight;
          if (s < 50) anyBelow50 = true;
        }
      });

      // The GWA is strictly the sum of the weighted scores. It is not scaled up.
      // E.g. getting 100 on a 20% weight exam yields 20 points towards the 75 requirement.
      const gwa = Math.round(gwaSum);

      // A student can ONLY officially be a passer if they have taken 100% of the weights.
      const isPasser = totalWeight === 100 && gwa >= 75 && !anyBelow50;

      return { name: student.user_name, gwa, isPasser, totalWeight };
    });

    // Sort by GWA descending
    studentStats.sort((a, b) => b.gwa - a.gwa);

    const top10 = studentStats.slice(0, 10);
    const passers = studentStats.filter((s) => s.isPasser);

    return { top10, passers };
  };

  const getItemAnalysis = () => {
    if (!analyticsExamContent || analyticsResults.length === 0) return [];

    return analyticsExamContent.map((q: any, idx: number) => {
      const tally: Record<string, number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        "No Answer": 0,
      };

      analyticsResults.forEach((r) => {
        // We now map by the original question index saved in the result's answers dictionary
        const chosen = r.answers[idx];
        if (chosen && tally[chosen] !== undefined) tally[chosen]++;
        else tally["No Answer"]++;
      });

      return {
        questionNum: q.number,
        stem: q.stem,
        options: q.options,
        tally,
        correctLetter: q.options.find((o: any) => o.correct)?.letter || "?",
      };
    });
  };

  const currentSet = examSets.find((s) => s.id === analyticsSetId);
  const { top10, passers } = getPassersAndTop10();
  const itemAnalysis = getItemAnalysis();

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={`Delete ${deleteModal.type === "set" ? "Exam Set" : "Exam"}?`}
        message={`Are you sure you want to delete "${deleteModal.title}"? This action cannot be undone.`}
        onCancel={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDelete}
        loading={deleteModal.loading}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={icon}
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: "11px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--accent)",
                fontWeight: 600,
                marginBottom: "3px",
              }}
            >
              SolariWEB Exam Portal
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontFamily: "var(--font-display)",
                margin: 0,
                color: "var(--ink)",
                lineHeight: 1.2,
              }}
            >
              Admin Dashboard
            </h1>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 14px",
            background: "var(--cream-dark)",
            color: "var(--ink)",
            border: "1px solid var(--cream-border)",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "13px",
            transition: "all 0.2s ease",
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--cream-border)",
          marginBottom: "24px",
          gap: "4px",
        }}
      >
        <button
          onClick={() => setActiveTab("MANAGE")}
          style={{
            padding: "12px 18px",
            background: "none",
            border: "none",
            fontSize: "13px",
            letterSpacing: "0.03em",
            fontWeight: activeTab === "MANAGE" ? 600 : 500,
            color: activeTab === "MANAGE" ? "var(--ink)" : "var(--ink-muted)",
            borderBottom:
              activeTab === "MANAGE"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            cursor: "pointer",
            transition: "color 0.2s ease",
          }}
        >
          Manage Exam Sets
        </button>
        <button
          onClick={() => setActiveTab("ANALYTICS")}
          style={{
            padding: "12px 18px",
            background: "none",
            border: "none",
            fontSize: "13px",
            letterSpacing: "0.03em",
            fontWeight: activeTab === "ANALYTICS" ? 600 : 500,
            color:
              activeTab === "ANALYTICS" ? "var(--ink)" : "var(--ink-muted)",
            borderBottom:
              activeTab === "ANALYTICS"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            cursor: "pointer",
            transition: "color 0.2s ease",
          }}
        >
          Analytics & Item Analysis
        </button>
        <button
          onClick={() => setActiveTab("LIVE_FEEDBACK")}
          style={{
            padding: "12px 18px",
            background: "none",
            border: "none",
            fontSize: "13px",
            letterSpacing: "0.03em",
            fontWeight: activeTab === "LIVE_FEEDBACK" ? 600 : 500,
            color:
              activeTab === "LIVE_FEEDBACK" ? "var(--ink)" : "var(--ink-muted)",
            borderBottom:
              activeTab === "LIVE_FEEDBACK"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            cursor: "pointer",
            transition: "color 0.2s ease",
          }}
        >
          Live Feedback
        </button>
      </div>

      {activeTab === "MANAGE" && (
        <>
          {step === "SELECT_OR_CREATE_SET" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              <div
                style={{
                  background: "var(--cream-dark)",
                  padding: "24px",
                  borderRadius: "10px",
                  border: "1px solid var(--cream-border)",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    marginBottom: "16px",
                    color: "var(--ink)",
                  }}
                >
                  Select Existing Exam Set
                </h2>
                {loadingSets ? (
                  <div>Loading...</div>
                ) : examSets.length === 0 ? (
                  <div style={{ color: "var(--ink-muted)" }}>
                    No exam sets exist yet. Please create one below.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: "12px",
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    {examSets.map((set) => (
                      <div
                        key={set.id}
                        onClick={() => {
                          setSelectedSet(set);
                          setStep("MANAGE_SET");
                        }}
                        style={{
                          padding: "16px",
                          border: "1px solid var(--cream-border)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          background: "var(--cream)",
                          transition: "background 0.2s",
                          position: "relative",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "var(--cream-dark)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "var(--cream)")
                        }
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            marginBottom: "4px",
                            paddingRight: "24px",
                          }}
                        >
                          {set.title}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--ink-muted)",
                          }}
                        >
                          {set.exams?.length || 0}/6 Exams uploaded
                        </div>
                        <button
                          onClick={(e) => promptDeleteSet(e, set)}
                          style={{
                            position: "absolute",
                            top: "12px",
                            right: "12px",
                            background: "none",
                            border: "none",
                            color: "var(--red)",
                            cursor: "pointer",
                            fontSize: "16px",
                            opacity: 0.6,
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.opacity = "1")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.opacity = "0.6")
                          }
                          title="Delete Exam Set"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  background: "var(--cream-dark)",
                  padding: "24px",
                  borderRadius: "10px",
                  border: "1px solid var(--cream-border)",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    marginBottom: "16px",
                    color: "var(--ink)",
                  }}
                >
                  Create New Exam Set
                </h2>
                {setMessage && (
                  <div
                    style={{
                      padding: "12px",
                      marginBottom: "16px",
                      borderRadius: "6px",
                      background: setMessage.includes("success")
                        ? "var(--green-bg)"
                        : "var(--red-bg)",
                      color: setMessage.includes("success")
                        ? "var(--green)"
                        : "var(--red)",
                    }}
                  >
                    {setMessage}
                  </div>
                )}
                <form
                  onSubmit={handleCreateSet}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "4px",
                        fontSize: "14px",
                        color: "var(--ink-muted)",
                      }}
                    >
                      Set Title (e.g. 2026 Mock Exam)
                    </label>
                    <input
                      type="text"
                      value={setTitle}
                      onChange={(e) => setSetTitle(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--cream-border)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "4px",
                        fontSize: "14px",
                        color: "var(--ink-muted)",
                      }}
                    >
                      Start Time (First Exam Access)
                    </label>
                    <input
                      type="datetime-local"
                      value={setAccessibleAt}
                      onChange={(e) => setSetAccessibleAt(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--cream-border)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={setIsPublic}
                      onChange={(e) => setSetIsPublic(e.target.checked)}
                    />
                    <label
                      htmlFor="isPublic"
                      style={{ fontSize: "14px", color: "var(--ink)" }}
                    >
                      Make Public (Live)
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingSet}
                    style={{
                      padding: "12px",
                      background: "var(--accent-light)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: creatingSet ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      transition: "background 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--accent)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--accent-light)")
                    }
                  >
                    {creatingSet ? "Creating..." : "Create Set & Proceed"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {step === "MANAGE_SET" && selectedSet && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <button
                    onClick={() => setStep("SELECT_OR_CREATE_SET")}
                    style={{
                      padding: "6px 12px",
                      background: "var(--cream-dark)",
                      border: "1px solid var(--cream-border)",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    ← Back
                  </button>
                  <h2
                    style={{ fontSize: "20px", margin: 0, color: "var(--ink)" }}
                  >
                    Managing: {selectedSet.title}
                  </h2>
                </div>

                <button
                  onClick={async () => {
                    const newPublicity = !selectedSet.is_public;
                    try {
                      const { error } = await supabase
                        .from("exam_sets")
                        .update({ is_public: newPublicity })
                        .eq("id", selectedSet.id);

                      if (error) throw error;

                      // Update local state
                      setSelectedSet({
                        ...selectedSet,
                        is_public: newPublicity,
                      });
                      setExamSets(
                        examSets.map((set) =>
                          set.id === selectedSet.id
                            ? { ...set, is_public: newPublicity }
                            : set,
                        ),
                      );
                    } catch (err) {
                      console.error("Failed to toggle publicity:", err);
                      alert("Failed to toggle publicity.");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    background: selectedSet.is_public
                      ? "var(--green-bg)"
                      : "var(--cream-dark)",
                    color: selectedSet.is_public
                      ? "var(--green)"
                      : "var(--ink-muted)",
                    border: `1px solid ${selectedSet.is_public ? "var(--green)" : "var(--cream-border)"}`,
                    borderRadius: "20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: selectedSet.is_public
                        ? "var(--green)"
                        : "var(--ink-faint)",
                    }}
                  />
                  {selectedSet.is_public ? "Public" : "Private"}
                </button>
              </div>

              <div
                style={{
                  background: "var(--cream-dark)",
                  padding: "24px",
                  borderRadius: "10px",
                  border: "1px solid var(--cream-border)",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    marginBottom: "16px",
                    color: "var(--ink)",
                  }}
                >
                  Exams in this Set ({selectedSet.exams?.length || 0}/6)
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--ink-muted)",
                    marginBottom: "16px",
                  }}
                >
                  Drag to re-arrange order. Start times cascade sequentially
                  (150 mins per exam).
                </p>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  {!selectedSet.exams || selectedSet.exams.length === 0 ? (
                    <div
                      style={{ color: "var(--ink-muted)", fontSize: "14px" }}
                    >
                      No exams uploaded yet.
                    </div>
                  ) : (
                    selectedSet.exams.map((exam: any, idx: number) => (
                      <div
                        key={exam.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px",
                          background:
                            draggedItemIdx === idx
                              ? "var(--cream-dark)"
                              : "var(--cream)",
                          border: "1px solid var(--cream-border)",
                          borderRadius: "6px",
                          cursor: "grab",
                          opacity: draggedItemIdx === idx ? 0.5 : 1,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              color: "var(--ink-faint)",
                              cursor: "grab",
                            }}
                          >
                            ⋮⋮
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {idx + 1}. {exam.title} ({exam.subject_code})
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--ink-muted)",
                              }}
                            >
                              Unlocks at:{" "}
                              {new Date(exam.accessible_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          {(() => {
                            const endTime =
                              new Date(exam.accessible_at).getTime() +
                              (exam.duration_minutes || 150) * 60000;
                            const isClosed = Date.now() > endTime;

                            if (isClosed) {
                              return (
                                <button
                                  onClick={async () => {
                                    const newStatus = !exam.is_reopened;
                                    try {
                                      const { error } = await supabase
                                        .from("exams")
                                        .update({ is_reopened: newStatus })
                                        .eq("id", exam.id);

                                      if (error) throw error;

                                      // Local update for immediate feedback
                                      const updatedExams =
                                        selectedSet.exams.map((e: any) =>
                                          e.id === exam.id
                                            ? { ...e, is_reopened: newStatus }
                                            : e,
                                        );
                                      setSelectedSet({
                                        ...selectedSet,
                                        exams: updatedExams,
                                      });
                                    } catch (err) {
                                      console.error(
                                        "Failed to toggle reopen status:",
                                        err,
                                      );
                                      alert("Failed to toggle reopen status.");
                                    }
                                  }}
                                  style={{
                                    fontSize: "12px",
                                    background: exam.is_reopened
                                      ? "var(--green-bg)"
                                      : "var(--cream-dark)",
                                    color: exam.is_reopened
                                      ? "var(--green)"
                                      : "var(--ink-muted)",
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    border: `1px solid ${exam.is_reopened ? "var(--green)" : "var(--cream-border)"}`,
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                  }}
                                  title={
                                    exam.is_reopened
                                      ? "Close reopened exam"
                                      : "Indefinitely reopen exam for late takers"
                                  }
                                >
                                  {exam.is_reopened
                                    ? "Reopened (Indefinite)"
                                    : "Reopen for Late Takers"}
                                </button>
                              );
                            }
                            return null;
                          })()}
                          <div
                            style={{
                              fontSize: "12px",
                              background: "var(--accent-bg)",
                              color: "var(--accent)",
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            150 mins
                          </div>
                          <button
                            onClick={() => promptDeleteExam(exam)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--red)",
                              cursor: "pointer",
                              fontSize: "16px",
                            }}
                            title="Delete Exam"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedSet.exams?.length < 6 && (
                  <>
                    <h3
                      style={{
                        fontSize: "16px",
                        marginBottom: "12px",
                        color: "var(--ink)",
                        borderTop: "1px solid var(--cream-border)",
                        paddingTop: "16px",
                      }}
                    >
                      Upload Next Exam
                    </h3>
                    {uploadMessage && (
                      <div
                        style={{
                          padding: "12px",
                          marginBottom: "16px",
                          borderRadius: "6px",
                          background: uploadMessage.includes("success")
                            ? "var(--green-bg)"
                            : "var(--red-bg)",
                          color: uploadMessage.includes("success")
                            ? "var(--green)"
                            : "var(--red)",
                        }}
                      >
                        {uploadMessage}
                      </div>
                    )}
                    <form
                      onSubmit={handleUpload}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "4px",
                            fontSize: "14px",
                            color: "var(--ink-muted)",
                          }}
                        >
                          Exam Title
                        </label>
                        <input
                          type="text"
                          value={examTitle}
                          onChange={(e) => setExamTitle(e.target.value)}
                          required
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--cream-border)",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "4px",
                            fontSize: "14px",
                            color: "var(--ink-muted)",
                          }}
                        >
                          Exam File (.txt)
                        </label>
                        <input
                          id="examFile"
                          type="file"
                          accept=".txt"
                          onChange={handleFileChange}
                          required
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--cream-border)",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--ink-faint)",
                            marginTop: "4px",
                          }}
                        >
                          File must start with a subject code and contain
                          exactly 100 questions. Appends to the end of the
                          schedule.
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={uploading}
                        style={{
                          padding: "12px",
                          background: "var(--accent)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: uploading ? "not-allowed" : "pointer",
                          fontWeight: 500,
                        }}
                      >
                        {uploading ? "Uploading..." : "Upload Exam"}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "ANALYTICS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              background: "var(--cream-dark)",
              padding: "24px",
              borderRadius: "10px",
              border: "1px solid var(--cream-border)",
            }}
          >
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Select Exam Set
                </label>
                <select
                  value={analyticsSetId}
                  onChange={(e) => {
                    setAnalyticsSetId(e.target.value);
                    setAnalyticsExamId("ALL");
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--cream-border)",
                    background: "var(--cream)",
                  }}
                >
                  {examSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                  {examSets.length === 0 && <option value="">No Sets</option>}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: "200px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Select View
                </label>
                <select
                  value={analyticsExamId}
                  onChange={(e) => setAnalyticsExamId(e.target.value)}
                  disabled={!currentSet}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--cream-border)",
                    background: "var(--cream)",
                  }}
                >
                  <option value="ALL">
                    Overall Set Statistics (Passers & Top 10)
                  </option>
                  {currentSet?.exams?.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      Item Analysis: {e.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {analyticsLoading ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "var(--ink-muted)",
              }}
            >
              Loading analytics...
            </div>
          ) : (
            <>
              {analyticsExamId === "ALL" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "24px",
                  }}
                >
                  <div
                    style={{
                      background: "var(--cream-dark)",
                      padding: "24px",
                      borderRadius: "10px",
                      border: "1px solid var(--cream-border)",
                    }}
                  >
                    <h3
                      style={{
                        margin: "0 0 16px 0",
                        fontSize: "16px",
                        color: "var(--green)",
                      }}
                    >
                      Passers ({passers.length})
                    </h3>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--ink-muted)",
                        marginBottom: "16px",
                      }}
                    >
                      Must complete all 6 exams. GWA ≥ 75% with no subject score
                      &lt; 50%.
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {passers.length === 0 ? (
                        <div style={{ color: "var(--ink-muted)" }}>
                          No passers found.
                        </div>
                      ) : (
                        passers.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "12px",
                              background: "var(--green-bg)",
                              borderRadius: "6px",
                              border: "1px solid var(--cream-border)",
                            }}
                          >
                            <span>{p.name}</span>
                            <span
                              style={{ fontWeight: 600, color: "var(--green)" }}
                            >
                              {p.gwa}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--cream-dark)",
                      padding: "24px",
                      borderRadius: "10px",
                      border: "1px solid var(--cream-border)",
                    }}
                  >
                    <h3
                      style={{
                        margin: "0 0 16px 0",
                        fontSize: "16px",
                        color: "var(--ink)",
                      }}
                    >
                      Top 10 Highest GWA
                    </h3>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--ink-muted)",
                        marginBottom: "16px",
                      }}
                    >
                      Weighted according to LLE standard.
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {top10.length === 0 ? (
                        <div style={{ color: "var(--ink-muted)" }}>
                          No results yet.
                        </div>
                      ) : (
                        top10.map((t, i) => {
                          const isComplete = t.totalWeight === 100;
                          return (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "12px",
                                background:
                                  i < 3 && isComplete
                                    ? "var(--accent-bg)"
                                    : "var(--cream)",
                                border: "1px solid var(--cream-border)",
                                borderRadius: "6px",
                                opacity: isComplete ? 1 : 0.6,
                              }}
                            >
                              <span>
                                <span
                                  style={{ opacity: 0.5, marginRight: "8px" }}
                                >
                                  {i + 1}.
                                </span>{" "}
                                {t.name}{" "}
                                {!isComplete && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--ink-muted)",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    (Incomplete)
                                  </span>
                                )}
                              </span>
                              <span style={{ fontWeight: 600 }}>{t.gwa}%</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {analyticsExamId !== "ALL" && analyticsExamContent && (
                <div
                  style={{
                    background: "var(--cream-dark)",
                    padding: "24px",
                    borderRadius: "10px",
                    border: "1px solid var(--cream-border)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "18px",
                      color: "var(--ink)",
                    }}
                  >
                    Item Analysis
                  </h3>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--ink-muted)",
                      marginBottom: "24px",
                    }}
                  >
                    Total Students Taken: {analyticsResults.length}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    {itemAnalysis.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: "24px",
                          border: "1px solid var(--cream-border)",
                          borderRadius: "10px",
                          background: "var(--cream)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "14px",
                            color: "var(--ink-muted)",
                            marginBottom: "8px",
                          }}
                        >
                          Question {item.questionNum}
                        </div>
                        <div
                          style={{
                            fontSize: "16px",
                            color: "var(--ink)",
                            fontWeight: 500,
                            marginBottom: "20px",
                            lineHeight: 1.5,
                          }}
                        >
                          {item.stem}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                          }}
                        >
                          {item.options.map((opt: any) => {
                            const count = item.tally[opt.letter] || 0;
                            const percent =
                              analyticsResults.length > 0
                                ? Math.round(
                                    (count / analyticsResults.length) * 100,
                                  )
                                : 0;
                            const isCorrect = opt.letter === item.correctLetter;

                            return (
                              <div
                                key={opt.letter}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "12px 16px",
                                  background: isCorrect
                                    ? "var(--green-bg)"
                                    : "var(--cream-dark)",
                                  border: `1px solid ${isCorrect ? "var(--green)" : "var(--cream-border)"}`,
                                  borderRadius: "6px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "16px",
                                    flex: 1,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "28px",
                                      height: "28px",
                                      borderRadius: "50%",
                                      border: `1px solid ${isCorrect ? "var(--green)" : "var(--ink-muted)"}`,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "13px",
                                      fontWeight: 500,
                                      color: isCorrect
                                        ? "var(--green)"
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
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {opt.text}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    flexShrink: 0,
                                    marginLeft: "16px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      color: isCorrect
                                        ? "var(--green)"
                                        : "var(--ink)",
                                    }}
                                  >
                                    {count}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--ink-muted)",
                                    }}
                                  >
                                    {percent}%
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {item.tally["No Answer"] > 0 && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 16px",
                                background: "var(--cream-dark)",
                                border: "1px dashed var(--cream-border)",
                                borderRadius: "6px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "14px",
                                  color: "var(--ink-muted)",
                                  fontStyle: "italic",
                                }}
                              >
                                No Answer / Skipped
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--ink-muted)",
                                  }}
                                >
                                  {item.tally["No Answer"]}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--ink-muted)",
                                  }}
                                >
                                  {Math.round(
                                    (item.tally["No Answer"] /
                                      analyticsResults.length) *
                                      100,
                                  )}
                                  %
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "LIVE_FEEDBACK" && (
        <div className="admin-content-card">
          <LiveFeedback />
        </div>
      )}
    </div>
  );
}
