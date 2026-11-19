/**
 * Maelekezo ya kusubmit kazi kwa PDF.
 * Inatumika kwenye orodha ya kazi na kwenye ukurasa wa kazi uliofunguliwa.
 */
export default function StudentSubmissionHelp() {
  return (
    <details className="sp-help">
      <summary>Maelekezo: jinsi ya kusubmit kazi kwa PDF</summary>
      <ol className="sp-help-steps">
        <li>
          Andaa kazi yako, kisha ihifadhi kama faili ya <strong>PDF</strong> (mfano:{" "}
          <code>jina_la_kazi.pdf</code>).
        </li>
        <li>
          Fungua kazi husika kwenye orodha ya kazi, kisha bonyeza{" "}
          <strong>&ldquo;Choose File&rdquo;</strong> kwenye sehemu ya <strong>Your attachment</strong>.
        </li>
        <li>
          Chagua faili ya PDF kutoka kwenye kifaa chako. Faili inapaswa kuwa ndogo kuliko{" "}
          <strong>3 MB</strong>.
        </li>
        <li>
          Angalia jina la faili linaloonekana, kisha bonyeza{" "}
          <strong>&ldquo;Submit assignment&rdquo;</strong> ili kuiwasilisha.
        </li>
        <li>
          Subiri ujumbe wa kuthibitisha. Kazi ikishawasilishwa huwezi kuibadilisha tena,
          kwa hiyo ikague vizuri kabla ya kusubmit.
        </li>
      </ol>
      <p className="sp-help-note">
        Majibu ya maswali yanaweza kuandikwa kwenye sehemu zilizotolewa; PDF ni nyongeza ya
        majibu yako. Draft huhifadhiwa kiotomatiki, lakini kazi husika haipotei hadi ubonyeze
        &ldquo;Submit assignment&rdquo;.
      </p>
    </details>
  );
}
