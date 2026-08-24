import React, { useState } from "react";
import { supabase } from "./lib/supabase";

export default function AdminDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [accessibleAt, setAccessibleAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !accessibleAt) {
      setMessage("Please fill in all fields and select a file.");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const text = await file.text();

      // Basic validation
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const subjectCode = lines[0]; // Assuming first line is subject code

      if (!subjectCode.match(/^[A-Z]+(?:_[A-Z0-9]+)*$/i)) {
        throw new Error(
          "Invalid file format: First line must be a subject code (e.g., LOM_1)",
        );
      }

      // Check if it has 100 questions. Simplified check by counting 'Q.'
      const questionCount = lines.filter((l) => l.startsWith("Q.")).length;
      if (questionCount !== 100) {
        throw new Error(
          `File must contain exactly 100 questions. Found ${questionCount}.`,
        );
      }

      const { error } = await supabase.from("exams").insert({
        title,
        subject_code: subjectCode,
        file_content: text,
        accessible_at: new Date(accessibleAt).toISOString(),
      });

      if (error) throw error;

      setMessage("Exam uploaded successfully!");
      setFile(null);
      setTitle("");
      setAccessibleAt("");
    } catch (err: any) {
      setMessage(err.message || "An error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
      <h1
        style={{ fontSize: "24px", marginBottom: "24px", color: "var(--ink)" }}
      >
        Admin Dashboard
      </h1>

      <div
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "8px",
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
          Upload Mock Exam
        </h2>

        {message && (
          <div
            style={{
              padding: "12px",
              marginBottom: "16px",
              borderRadius: "4px",
              background: message.includes("success")
                ? "var(--green-bg)"
                : "var(--red-bg)",
              color: message.includes("success")
                ? "var(--green)"
                : "var(--red)",
            }}
          >
            {message}
          </div>
        )}

        <form
          onSubmit={handleUpload}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "4px",
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
              Accessible At (Local Time)
            </label>
            <input
              type="datetime-local"
              value={accessibleAt}
              onChange={(e) => setAccessibleAt(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "4px",
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
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "4px",
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
              File must start with a subject code and contain exactly 100
              questions starting with "Q." and choices with "O." or "*O.".
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
              borderRadius: "4px",
              cursor: uploading ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            {uploading ? "Uploading..." : "Upload Exam"}
          </button>
        </form>
      </div>
    </div>
  );
}
