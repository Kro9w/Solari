import React, { useState } from "react";
import { supabase } from "./utils/supabase";

export default function Admin() {
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [duration, setDuration] = useState("60");
  const [accessibleAt, setAccessibleAt] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.from("Exam").insert({
        title,
        subjectCode,
        duration: parseInt(duration),
        accessibleAt: new Date(accessibleAt).toISOString(),
        rawText,
      });

      if (error) throw error;

      setMessage("Exam successfully uploaded!");
      setTitle("");
      setSubjectCode("");
      setDuration("60");
      setAccessibleAt("");
      setRawText("");
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "800px",
        margin: "0 auto",
        background: "var(--cream)",
      }}
    >
      <h1 style={{ fontFamily: "var(--font-display)", marginBottom: "24px" }}>
        Admin Panel
      </h1>

      {message && (
        <div
          style={{
            padding: "12px",
            background: message.includes("Error")
              ? "var(--red)"
              : "var(--green)",
            color: "white",
            borderRadius: "var(--radius-sm)",
            marginBottom: "24px",
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleUpload}
        style={{ display: "flex", flexDirection: "column", gap: "20px" }}
      >
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Exam Title
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid var(--cream-border)",
            }}
            placeholder="e.g. LLE Mock Exam 1"
          />
        </div>

        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
            >
              Subject Code
            </label>
            <input
              type="text"
              required
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid var(--cream-border)",
              }}
              placeholder="e.g. LOM_1"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
            >
              Duration (minutes)
            </label>
            <input
              type="number"
              required
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid var(--cream-border)",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Accessible At (Local Time)
          </label>
          <input
            type="datetime-local"
            required
            value={accessibleAt}
            onChange={(e) => setAccessibleAt(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid var(--cream-border)",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Raw Exam Text (Strict ABCD format)
          </label>
          <textarea
            required
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            style={{
              width: "100%",
              height: "300px",
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid var(--cream-border)",
              fontFamily: "monospace",
            }}
            placeholder={`1. What is the capital of France?\nA. London\n*B. Paris\nC. Berlin\nD. Rome`}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "14px",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: "16px",
          }}
        >
          {loading ? "Uploading..." : "Upload Exam"}
        </button>
      </form>
    </div>
  );
}
