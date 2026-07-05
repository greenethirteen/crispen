"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const ACCEPT_LABEL = "PNG · JPG · WEBP";

export function UploadZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      setError(null);
      const file = files?.[0];
      if (!file) return;
      if (!ACCEPT.includes(file.type)) {
        setError(`Unsupported format. Accepted: ${ACCEPT_LABEL}.`);
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`group flex w-full flex-col items-center justify-center gap-4 border-2 border-dashed px-8 py-20 text-center transition-colors disabled:opacity-50 ${
          dragging
            ? "border-registration bg-registration/5"
            : "border-ink/30 hover:border-ink/60"
        }`}
      >
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${
            dragging ? "border-registration" : "border-ink/40"
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke={dragging ? "#E8412C" : "#17161A"}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="font-display text-lg font-medium text-ink">
            Drop artwork to start the press check
          </p>
          <p className="label-mono">or click to browse — {ACCEPT_LABEL}</p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <p className="mt-3 font-mono text-sm text-registration">✕ {error}</p>
      )}
    </div>
  );
}
