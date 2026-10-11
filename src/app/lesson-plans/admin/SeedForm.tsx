"use client";

import { useActionState, useState } from "react";
import { seedSyllabus } from "../actions";

const SAMPLE = `Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References
MFANO|1|TIE|1|Topic ya kwanza|1|Subtopic A|2|Kujenga uelewa wa dhana|Mwanafunzi aeleze dhana|Kujadili dhana darasani|Kufanya mazoezi binafsi|Ubao, vitabu|Textbook Form 1
MFANO|1|TIE|1|Topic ya kwanza|2|Subtopic B|3
MFANO|1|TIE|2|Topic ya pili|1|Subtopic C|2`;

type Msg = { ok: boolean; text: string } | null;

export default function SeedForm() {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<Msg, FormData>(seedSyllabus, null);

  return (
    <form action={action} className="lp-seed-form">
      <textarea
        name="data"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="lp-textarea"
        placeholder="Bandika data hapa (kila mstari: Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|...)..."
      />
      <div className="lp-form-actions">
        <button type="button" className="cm-btn cm-btn--ghost" onClick={() => setText(SAMPLE)}>
          Pakia mfano wa muundo
        </button>
        <button type="submit" className="cm-btn cm-btn--primary" disabled={pending || !text.trim()}>
          {pending ? "Inaseed..." : "Seed / Sasisha"}
        </button>
      </div>
      {state && <p className={`lp-msg lp-msg--${state.ok ? "ok" : "err"}`}>{state.text}</p>}
    </form>
  );
}
