"use client";

import { useState } from "react";
import type { Storyboard } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Field, inputClass } from "../ui";
import { Studio } from "./Studio";

/** Where Script Writer and Copilot leave a script for this screen to pick up. */
export const HANDOFF = "ds_generate_source";

function takeHandoff(): string {
  try {
    return sessionStorage.getItem(HANDOFF) ?? "";
  } catch {
    return "";
  }
}

export function Generate() {
  const [source, setSource] = useState(takeHandoff);
  const [seconds, setSeconds] = useState(30);
  const { state, run } = useTool<Storyboard>("generate");
  const [runs, setRuns] = useState(0);

  return (
    <ToolFrame
      slug="generate"
      state={state}
      cta="Write the shot list"
      wait="Splitting the script into shots and writing a prompt for each."
      onSubmit={() => {
        setRuns((n) => n + 1);
        void run({ source, seconds });
      }}
      // A fresh shot list starts a fresh studio.
      render={(board) => <Studio key={runs} board={board} />}
    >
      <Field label="Script or topic" hint="a script is kept as written; a topic gets a script first">
        <textarea
          className={`${inputClass} min-h-36`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a script, or type a topic such as: 3 knife skills every home cook gets wrong"
          required
          minLength={2}
          maxLength={6000}
        />
      </Field>
      <Field label="Length if starting from a topic">
        <select className={inputClass} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {[15, 20, 30, 45, 60].map((s) => (
            <option key={s} value={s}>
              About {s} seconds
            </option>
          ))}
        </select>
      </Field>
    </ToolFrame>
  );
}
