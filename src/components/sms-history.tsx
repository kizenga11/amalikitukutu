"use client";

import "./sms-messaging.css";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { Spinner } from "@/components/loading";

interface HistoryRecipient {
  student_id: string | null;
  name: string | null;
  phone: string | null;
  status: string;
  detail: string | null;
  message_id: string | null;
  message: string;
}

interface HistoryCampaign {
  id: string;
  created_at: string;
  kind: string;
  exam_id: string | null;
  exam_name: string | null;
  sender_name: string | null;
  sample_message: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  recipients: HistoryRecipient[];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sw-TZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  if (status === "sent") return "Imetumwa";
  if (status === "failed") return "Imeshindikana";
  if (status === "skipped") return "Imerukwa";
  return status;
}

function statusClass(status: string): string {
  if (status === "sent") return "sms-status--ok";
  if (status === "failed") return "sms-status--fail";
  return "sms-status--skip";
}

export default function SmsHistory({ onClose }: { onClose: () => void }) {
  const [campaigns, setCampaigns] = useState<HistoryCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      authedFetch(`/api/sms/history?q=${encodeURIComponent(debouncedQuery)}`)
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as { campaigns?: HistoryCampaign[]; error?: string };
          if (!res.ok) throw new Error(data.error ?? "Imeshindikana kupata historia ya SMS.");
          return data.campaigns ?? [];
        })
        .then((rows) => {
          if (active) setCampaigns(rows);
        })
        .catch((err) => {
          if (active) {
            setCampaigns([]);
            setError(errorMessage(err, "Imeshindikana kupata historia ya SMS."));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [debouncedQuery, refreshToken]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Histori ya SMS</h2>
          <p className="page-sub">
            Angalia SMS zote zilizotumwa kwa wazazi — ni lini, kwa nani, na zilisema nini.
          </p>
        </div>
        <div className="page-head-right">
          <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => setRefreshToken((n) => n + 1)} disabled={loading}>
            Sasisha
          </button>
          <button className="cm-btn cm-btn--primary cm-btn--sm" onClick={onClose}>
            Rudi kwenye kutuma
          </button>
        </div>
      </div>

      <div className="sms-history-toolbar">
        <div className="sm-search-bar">
          <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input
            className="sm-search"
            type="text"
            placeholder="Tafuta jina, namba, mtihani, ujumbe..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="me-loading"><Spinner size={22} /></div>
      ) : error ? (
        <div className="st-empty-state">
          {error}
          <div><button className="cm-btn cm-btn--ghost st-retry" onClick={() => setRefreshToken((n) => n + 1)}>Jaribu tena</button></div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="st-empty-state">
          {debouncedQuery ? "Hakuna historia inayolingana na utafutaji wako." : "Bado hakuna SMS zilizotumwa."}
        </div>
      ) : (
        <div className="sms-history-list">
          {campaigns.map((campaign) => {
            const open = openId === campaign.id;
            return (
              <div key={campaign.id} className={`panel sms-history-card${open ? " sms-history-card--open" : ""}`}>
                <button className="sms-history-head" onClick={() => setOpenId(open ? null : campaign.id)}>
                  <div className="sms-history-head-main">
                    <span className={`sms-history-kind sms-history-kind--${campaign.kind}`}>
                      {campaign.kind === "results" ? "Matokeo" : "Ujumbe Maalum"}
                    </span>
                    <div className="sms-history-title">
                      {campaign.kind === "results" && campaign.exam_name ? campaign.exam_name : "Ujumbe Maalum"}
                    </div>
                    <div className="sms-history-meta">
                      {formatDate(campaign.created_at)}
                      {campaign.sender_name ? ` · ${campaign.sender_name}` : ""}
                    </div>
                  </div>
                  <div className="sms-history-counts">
                    <span className="sms-history-count sms-status--ok">{campaign.sent} zilizofanikiwa</span>
                    {campaign.failed > 0 && <span className="sms-history-count sms-status--fail">{campaign.failed} zilizoshindikana</span>}
                    {campaign.skipped > 0 && <span className="sms-history-count sms-status--skip">{campaign.skipped} zilizorukwa</span>}
                    <span className="sms-history-total">{campaign.total} jumla</span>
                    <svg className={`sms-history-chevron${open ? " sms-history-chevron--open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </button>

                {open && (
                  <div className="sms-history-body">
                    {campaign.sample_message && (
                      <div className="sms-history-sample">
                        <span className="sms-history-sample-label">Mfano wa ujumbe</span>
                        <p>{campaign.sample_message}</p>
                      </div>
                    )}
                    <div className="sms-table-wrap">
                      <table className="sm-table sms-table">
                        <thead>
                          <tr>
                            <th>Mwanafunzi</th>
                            <th>Namba ya Simu</th>
                            <th>Hali</th>
                            <th>Ujumbe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaign.recipients.map((recipient, index) => (
                            <tr key={`${campaign.id}-${recipient.student_id ?? index}`}>
                              <td>{recipient.name ?? "—"}</td>
                              <td>{recipient.phone ?? "—"}</td>
                              <td>
                                <span className={`sms-status ${statusClass(recipient.status)}`}>{statusLabel(recipient.status)}</span>
                                {recipient.detail && <div className="sms-history-detail">{recipient.detail}</div>}
                              </td>
                              <td className="sms-history-message">{recipient.message || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {campaign.total > campaign.recipients.length && (
                      <p className="sms-history-note">Inaonyesha wapokeaji {campaign.recipients.length} kati ya {campaign.total}.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
