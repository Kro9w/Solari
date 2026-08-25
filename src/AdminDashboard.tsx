import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { DEFAULT_SUBJECTS } from "./App";
import { parseQuestions } from "./MockExam";
import { useNavigate } from "react-router-dom";
import icon from "../icon.png";
import LiveFeedback from "./LiveFeedback";
import { withViewTransition } from "./utils/viewTransition";

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
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: "400px" }}>
        <div className="modal-body-tight">
          <h3 className="modal-title" style={{ marginBottom: "12px" }}>
            {title}
          </h3>
          <p className="modal-message">{message}</p>
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
          >
            <button
              className="dash-btn-ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="dash-btn-danger"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </div>
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
        "*, exams(id, title, subject_code, duration_minutes, accessible_at, file_content, is_reopened)",
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
          is_public: false, // Default to negative/private
        })
        .select()
        .single();
      if (error) throw error;
      setSetMessage("Exam set created successfully!");
      setSetTitle("");
      setSetAccessibleAt("");
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
            "*, exams(id, title, subject_code, duration_minutes, accessible_at, is_reopened)",
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
    <div className="dash-shell">
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={`Delete ${deleteModal.type === "set" ? "Exam Set" : "Exam"}?`}
        message={`Are you sure you want to delete "${deleteModal.title}"? This action cannot be undone.`}
        onCancel={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDelete}
        loading={deleteModal.loading}
      />

      {/* ── masthead ── */}
      <div className="dash-header">
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div>
            <div className="dash-eyebrow">SINAG Administration</div>
            <h1 className="dash-heading">Admin Dashboard</h1>
          </div>
          <button
            className="dash-back-btn"
            onClick={() => withViewTransition(() => navigate("/"))}
          >
            ← Back to Portal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === "MANAGE" ? " active" : ""}`}
          onClick={() => setActiveTab("MANAGE")}
        >
          Manage Exam Sets
        </button>
        <button
          className={`admin-tab${activeTab === "ANALYTICS" ? " active" : ""}`}
          onClick={() => setActiveTab("ANALYTICS")}
        >
          Analytics & Item Analysis
        </button>
        <button
          className={`admin-tab${activeTab === "LIVE_FEEDBACK" ? " active" : ""}`}
          onClick={() => setActiveTab("LIVE_FEEDBACK")}
        >
          Live Feedback
        </button>
      </div>

      {activeTab === "MANAGE" && (
        <div key="manage-tab" className="fade-in" style={{ marginTop: "24px" }}>
          {step === "SELECT_OR_CREATE_SET" && (
            <div className="dashboard-split-layout fade-in">
              <div className="dashboard-split-left">
                <div className="dash-section-label">
                  Select Existing Exam Set
                </div>
                <div className="dash-panel">
                  {loadingSets ? (
                    <div>Loading...</div>
                  ) : examSets.length === 0 ? (
                    <div
                      style={{ color: "var(--ink-muted)", fontSize: "14px" }}
                    >
                      No exam sets exist yet. Please create one on the right.
                    </div>
                  ) : (
                    <div>
                      {examSets.map((set) => (
                        <div
                          key={set.id}
                          className="dash-exam-row"
                          onClick={() => {
                            setSelectedSet(set);
                            setStep("MANAGE_SET");
                          }}
                          style={{ cursor: "pointer", padding: "16px 0" }}
                        >
                          <div>
                            <div className="dash-exam-title">{set.title}</div>
                            <div className="dash-exam-code">
                              {set.exams?.length || 0}/6 Exams uploaded
                            </div>
                          </div>
                          <button
                            className="icon-btn icon-btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              promptDeleteSet(e, set);
                            }}
                            title="Delete Exam Set"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="dashboard-split-right">
                <div className="dash-section-label">Create New Exam Set</div>
                <div className="dash-panel">
                  {setMessage && (
                    <div
                      className={`dash-banner ${setMessage.includes("success") ? "dash-banner-success" : "dash-banner-error"}`}
                      style={{ marginBottom: "16px" }}
                    >
                      {setMessage}
                    </div>
                  )}
                  <form
                    onSubmit={handleCreateSet}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    <div className="dash-field">
                      <label className="dash-field-label">
                        Set Title (e.g. 2026 Mock Exam)
                      </label>
                      <input
                        type="text"
                        value={setTitle}
                        onChange={(e) => setSetTitle(e.target.value)}
                        required
                        className="dash-input"
                      />
                    </div>
                    <div className="dash-field">
                      <label className="dash-field-label">
                        Start Time (First Exam Access)
                      </label>
                      <input
                        type="datetime-local"
                        value={setAccessibleAt}
                        onChange={(e) => setSetAccessibleAt(e.target.value)}
                        required
                        className="dash-input"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creatingSet}
                      className="dash-exam-btn"
                      style={{
                        padding: "12px",
                        marginTop: "12px",
                        width: "100%",
                      }}
                    >
                      {creatingSet ? "Creating…" : "Create Set & Proceed"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {step === "MANAGE_SET" && selectedSet && (
            <div
              className="fade-in"
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <button
                    className="dash-back-btn"
                    onClick={() => setStep("SELECT_OR_CREATE_SET")}
                  >
                    ← Back
                  </button>
                  <div className="dash-set-title">
                    Managing: {selectedSet.title}
                  </div>
                </div>

                <button
                  className={`dash-pill-toggle${selectedSet.is_public ? " active" : ""}`}
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
                >
                  <span className="dash-pill-dot" />
                  {selectedSet.is_public ? "Public" : "Private"}
                </button>
              </div>

              <div
                className={
                  selectedSet.exams?.length < 6 ? "dashboard-split-layout" : ""
                }
              >
                <div
                  className={
                    selectedSet.exams?.length < 6 ? "dashboard-split-left" : ""
                  }
                >
                  <div
                    className="dash-section-label"
                    style={{ marginBottom: "8px" }}
                  >
                    Exams in this Set ({selectedSet.exams?.length || 0}/6)
                  </div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--ink-muted)",
                      marginBottom: "16px",
                    }}
                  >
                    Drag to re-arrange order. Start times cascade sequentially
                    (150 mins per exam).
                  </p>
                  <div className="dash-panel">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {!selectedSet.exams || selectedSet.exams.length === 0 ? (
                        <div
                          style={{
                            color: "var(--ink-muted)",
                            fontSize: "14px",
                            padding: "12px 0",
                          }}
                        >
                          No exams uploaded yet.
                        </div>
                      ) : (
                        selectedSet.exams.map((exam: any, idx: number) => (
                          <div
                            key={exam.id}
                            className="dash-exam-row"
                            draggable
                            onDragStart={(e) => handleDragStart(e, idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={(e) => handleDrop(e, idx)}
                            style={{
                              padding: "13px 0",
                              cursor: "grab",
                              opacity: draggedItemIdx === idx ? 0.4 : 1,
                              background:
                                draggedItemIdx === idx
                                  ? "var(--cream-dark)"
                                  : "transparent",
                              transition: "background 0.2s, opacity 0.2s",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                flexShrink: 0,
                                whiteSpace: "nowrap",
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
                                <div className="dash-exam-title">
                                  {idx + 1}. {exam.title} ({exam.subject_code})
                                </div>
                                <div className="dash-exam-code">
                                  Unlocks at:{" "}
                                  {new Date(
                                    exam.accessible_at,
                                  ).toLocaleString()}
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
                              <div
                                style={{
                                  fontSize: "12px",
                                  background: "var(--accent-bg)",
                                  color: "var(--accent)",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                150 mins
                              </div>
                              {(() => {
                                const endTime =
                                  new Date(exam.accessible_at).getTime() +
                                  (exam.duration_minutes || 150) * 60000;
                                const isClosed = Date.now() > endTime;

                                if (isClosed) {
                                  return (
                                    <button
                                      className={`icon-btn${exam.is_reopened ? " icon-btn-success" : ""}`}
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
                                                ? {
                                                    ...e,
                                                    is_reopened: newStatus,
                                                  }
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
                                          alert(
                                            "Failed to toggle reopen status.",
                                          );
                                        }
                                      }}
                                      title={
                                        exam.is_reopened
                                          ? "Close reopened exam"
                                          : "Indefinitely reopen exam for late takers"
                                      }
                                    >
                                      ↻
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                              <button
                                className="icon-btn icon-btn-danger"
                                onClick={() => promptDeleteExam(exam)}
                                title="Delete Exam"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {selectedSet.exams?.length < 6 && (
                  <div className="dashboard-split-right">
                    <div>
                      <div
                        className="dash-section-label"
                        style={{ marginBottom: "8px" }}
                      >
                        Upload Next Exam
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--ink-muted)",
                          marginBottom: "16px",
                        }}
                      >
                        Append a subject exam file. Limit 6.
                      </p>
                      <div className="dash-panel">
                        {uploadMessage && (
                          <div
                            className={`dash-banner ${uploadMessage.includes("success") ? "dash-banner-success" : "dash-banner-error"}`}
                            style={{ marginBottom: "16px" }}
                          >
                            {uploadMessage}
                          </div>
                        )}
                        <form
                          onSubmit={handleUpload}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "18px",
                          }}
                        >
                          <div className="dash-field">
                            <label className="dash-field-label">
                              Exam Title
                            </label>
                            <input
                              type="text"
                              value={examTitle}
                              onChange={(e) => setExamTitle(e.target.value)}
                              required
                              className="dash-input"
                            />
                          </div>
                          <div className="dash-field">
                            <label className="dash-field-label">
                              Exam File (.txt)
                            </label>
                            <input
                              id="examFile"
                              type="file"
                              accept=".txt"
                              onChange={handleFileChange}
                              required
                              className="dash-input"
                            />
                            <div className="dash-field-hint">
                              File must start with a subject code and contain
                              exactly 100 questions.
                            </div>
                          </div>
                          <button
                            type="submit"
                            disabled={uploading}
                            className="dash-exam-btn"
                            style={{ padding: "12px", marginTop: "12px" }}
                          >
                            {uploading ? "Uploading…" : "Upload Exam"}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "ANALYTICS" && (
        <div
          key="analytics-tab"
          className="fade-in"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div className="dash-panel">
            <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
              <div
                className="dash-field"
                style={{ flex: 1, minWidth: "200px" }}
              >
                <label className="dash-field-label">Select Exam Set</label>
                <select
                  className="dash-select"
                  value={analyticsSetId}
                  onChange={(e) => {
                    setAnalyticsSetId(e.target.value);
                    setAnalyticsExamId("ALL");
                  }}
                  style={{ width: "100%" }}
                >
                  {examSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                  {examSets.length === 0 && <option value="">No Sets</option>}
                </select>
              </div>

              <div
                className="dash-field"
                style={{ flex: 1, minWidth: "200px" }}
              >
                <label className="dash-field-label">Select View</label>
                <select
                  className="dash-select"
                  value={analyticsExamId}
                  onChange={(e) => setAnalyticsExamId(e.target.value)}
                  disabled={!currentSet}
                  style={{ width: "100%" }}
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
                <div className="dashboard-split-layout">
                  <div className="dashboard-split-left dash-panel">
                    <div
                      className="dash-section-label"
                      style={{ marginBottom: "16px" }}
                    >
                      Passers ({passers.length})
                    </div>
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
                            className="dash-list-row dash-list-row-good"
                          >
                            <span>{p.name}</span>
                            <span className="dash-list-value dash-list-value-good">
                              {p.gwa}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="dashboard-split-right dash-panel">
                    <div
                      className="dash-section-label"
                      style={{ marginBottom: "16px" }}
                    >
                      Top 10 Highest GWA
                    </div>
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
                              className={`dash-list-row${i < 3 && isComplete ? " dash-list-row-accent" : ""}${!isComplete ? " dash-list-row-muted" : ""}`}
                            >
                              <span>
                                <span className="dash-list-rank">{i + 1}.</span>{" "}
                                {t.name}{" "}
                                {!isComplete && (
                                  <span
                                    style={{
                                      fontSize: "14px",
                                      color: "var(--ink-muted)",
                                    }}
                                  >
                                    ⏳︎
                                  </span>
                                )}
                              </span>
                              <span className="dash-list-value">{t.gwa}%</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {analyticsExamId !== "ALL" && analyticsExamContent && (
                <div>
                  <div
                    className="dash-section-label"
                    style={{ marginBottom: "16px" }}
                  >
                    Item Analysis (Students: {analyticsResults.length})
                  </div>
                  <div className="dash-panel">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                      }}
                    >
                      {itemAnalysis.map((item: any, idx: number) => (
                        <div key={idx} className="dash-question-card">
                          <div className="dash-question-eyebrow">
                            Question {item.questionNum}
                          </div>
                          <div className="dash-question-stem">{item.stem}</div>

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
                              const isCorrect =
                                opt.letter === item.correctLetter;

                              return (
                                <div
                                  key={opt.letter}
                                  className={`dash-option-row${isCorrect ? " correct" : ""}`}
                                >
                                  <div className="dash-option-main">
                                    <div className="dash-option-letter">
                                      {opt.letter}
                                    </div>
                                    <div className="dash-option-text">
                                      {opt.text}
                                    </div>
                                  </div>
                                  <div className="dash-option-tally">
                                    <div className="dash-option-count">
                                      {count}
                                    </div>
                                    <div className="dash-option-percent">
                                      {percent}%
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {item.tally["No Answer"] > 0 && (
                              <div className="dash-option-row skip">
                                <div className="dash-option-text skip">
                                  No Answer / Skipped
                                </div>
                                <div className="dash-option-tally">
                                  <div
                                    className="dash-option-count"
                                    style={{ color: "var(--ink-muted)" }}
                                  >
                                    {item.tally["No Answer"]}
                                  </div>
                                  <div className="dash-option-percent">
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "LIVE_FEEDBACK" && (
        <div key="live-feedback-tab" className="admin-content-card fade-in">
          <LiveFeedback />
        </div>
      )}
    </div>
  );
}
