import React from "react";

// Small pill that distinguishes exam set types (Mock, Practice, and any
// future type) wherever a set/exam is listed. Known types get a specific
// label and color; anything else falls back to a neutral badge derived from
// the raw type string, so new exam types "just work" without a code change.

type KnownType = "MOCK" | "PRACTICE";

const TYPE_META: Record<KnownType, { label: string; className: string }> = {
  MOCK: { label: "Mock", className: "dash-badge-type-mock" },
  PRACTICE: { label: "Practice", className: "dash-badge-type-practice" },
};

function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getExamTypeMeta(type: string | null | undefined) {
  if (type && type in TYPE_META) {
    return TYPE_META[type as KnownType];
  }
  return {
    label: type ? toTitleCase(type) : "Exam",
    className: "dash-badge-type-default",
  };
}

export function ExamTypeBadge({
  type,
  style,
}: {
  type: string | null | undefined;
  style?: React.CSSProperties;
}) {
  const { label, className } = getExamTypeMeta(type);
  return (
    <span className={`dash-badge ${className}`} style={style}>
      {label}
    </span>
  );
}
