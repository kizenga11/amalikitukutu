"use client";

import { useActionState, useEffect, useState } from "react";
import { seedSyllabus } from "../actions";

const SAMPLE = `Subject|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References
SAMPLE|1|TIE|1|First topic|1|Subtopic A|2|Build understanding of the concept|The student explains the concept|Discuss the concept in class|Do individual exercises|Board, books|Textbook Form 1
SAMPLE|1|TIE|1|First topic|2|Subtopic B|3
SAMPLE|1|TIE|2|Second topic|1|Subtopic C|2`;

type Msg = { ok: boolean; text: string } | null;

export default function SeedForm({ onSeeded }: { onSeeded?: () => void }) {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<Msg, FormData>(seedSyllabus, null);

  useEffect(() => {
    if (state?.ok) onSeeded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  return (
    <form action={action} className="lp-seed-form">
      <input type="hidden" name="access_token" value="" />
      <textarea
        name="data"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="lp-textarea"
        placeholder="Paste data here (each line: Subject|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|...)..."
      />
      <div className="lp-form-actions">
        <button type="button" className="cm-btn cm-btn--ghost" onClick={() => setText(SAMPLE)}>
          Load sample format
        </button>
        <button type="submit" className="cm-btn cm-btn--primary" disabled={pending || !text.trim()}>
          {pending ? "Seeding..." : "Seed / Update"}
        </button>
      </div>
      {state && <p className={`lp-msg lp-msg--${state.ok ? "ok" : "err"}`}>{state.text}</p>}
    </form>
  );
}
