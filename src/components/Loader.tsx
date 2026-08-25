import React from "react";

export function Loader() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        minHeight: "50vh",
        width: "100%",
        flex: 1,
      }}
    >
      <div className="app-loader"></div>
    </div>
  );
}
