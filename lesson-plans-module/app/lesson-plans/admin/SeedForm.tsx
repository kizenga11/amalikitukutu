"use client";

import { useActionState, useState } from "react";
import { seedSyllabus } from "../actions";

const SAMPLE = `Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References
MFANO|1|TIE|1|Topic ya kwanza|1|Subtopic A|2|Main competence ya topic|Specific competence A|Main activity A|Specific activity A|Chalkboard, projector|Textbook Form 1
MFANO|1|TIE|1|Topic ya kwanza|2|Subtopic B|3
MFANO|1|TIE|2|Topic ya pili|1|Subtopic C|2`;

type Msg = { ok: boolean; text: string } | null;

export default function SeedForm() {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<Msg, FormData>(seedSyllabus, null);

  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <textarea
        name="data"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 13, padding: 8 }}
        placeholder="Bandika data hapa..."
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setText(SAMPLE)}>Pakia mfano wa muundo</button>
        <button type="submit" disabled={pending || !text.trim()}>
          {pending ? "Inaseed..." : "Seed / Sasisha"}
        </button>
      </div>
      {state && <p style={{ color: state.ok ? "green" : "crimson" }}>{state.text}</p>}
    </form>
  );
}
