import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { MessageSquareText, X } from "lucide-react";
import { backend } from "../utils/backend";
import { currentLanguage } from "../i18n/index.js";

/**
 * "Feedback", in the header on every page: a short note to whoever runs
 * Umbrify, with the page it was written on and, if they want a reply, how to
 * reach them.
 */
export default function FeedbackButton() {
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const field = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    field.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const send = async (e) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await backend("social?feedback", { message, contact, page: `${pathname}${search}`.slice(0, 200), lang: currentLanguage() });
      setState("sent");
      setMessage("");
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  };
  const close = () => { setOpen(false); if (state === "sent") setState("idle"); };
  return (
    <>
      <button type="button" className="icon-control" onClick={() => setOpen(true)} aria-label="Send feedback" title="Send feedback">
        <MessageSquareText size={18} />
      </button>
      {/* Over the whole page: inside the header, its blur would hold the dialog. */}
      {open && createPortal(
        <div className="feedback-backdrop" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label="Send feedback" className="feedback-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">What do you think?</h2>
                <p className="text-sm text-slate-500">Something you liked, something broken, something missing: every note is read.</p>
              </div>
              <button type="button" onClick={close} className="icon-control" aria-label="Close"><X size={18} /></button>
            </div>
            {state === "sent" ? (
              <div className="space-y-3 py-4" role="status">
                <p className="font-semibold">Thank you! Your note is on its way.</p>
                <button type="button" onClick={close} className="account-button">Close</button>
              </div>
            ) : (
              <form onSubmit={send} className="space-y-3">
                <label className="account-label">
                  Your feedback
                  <textarea ref={field} className="account-input min-h-[120px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} required minLength={3} />
                </label>
                <label className="account-label">
                  Email, if you would like a reply <span className="font-normal text-slate-500">(optional)</span>
                  <input className="account-input" type="email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} autoComplete="email" />
                </label>
                {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
                <button className="account-button" disabled={state === "sending" || message.trim().length < 3}>{state === "sending" ? "Sending…" : "Send"}</button>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
