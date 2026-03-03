// =====================================================
// File: Spinner.jsx
// Description: Generic loading spinner (Tailwind animation).
// =====================================================
import React from "react";

export default function Spinner() {
  return (
    <div className="flex h-96 items-center justify-center">
      <span className="spinner" />
    </div>
  );
}
