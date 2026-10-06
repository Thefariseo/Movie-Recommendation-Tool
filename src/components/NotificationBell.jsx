import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, Download } from "lucide-react";
import UserAvatar from "./UserAvatar";
import { useNotifications, useInstall, pushSupported, currentPush, enablePush, disablePush } from "../utils/notifications";

export const ago = (at) => {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/** The bell in the header: movie nights, followers and friends' loved films. */
export default function NotificationBell({ userId }) {
  const { items, push, unread, seen, markSeen } = useNotifications(userId);
  const { canInstall, install } = useInstall();
  const [open, setOpen] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef(null);

  useEffect(() => { currentPush().then((s) => setPushOn(Boolean(s))).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const toggle = () => {
    if (!open && unread) markSeen();
    setOpen((o) => !o);
  };
  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) { await disablePush(); setPushOn(false); }
      else setPushOn(await enablePush(push));
    } catch { /* permission refused or the push service is away */ }
    setBusy(false);
  };

  return (
    <div className="relative" ref={root}>
      <button type="button" onClick={toggle} className="icon-control relative" aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
        {unread ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          className="fixed inset-x-4 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">Notifications</p>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing new. Movie nights and friends' news will show up here.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link to={n.link} onClick={() => setOpen(false)}
                  className={`flex gap-3 px-4 py-3 text-left text-slate-900 transition dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${String(n.at) > seen ? "bg-indigo-50/60 dark:bg-indigo-950/30" : ""}`}>
                  {n.poster ? <img loading="lazy" decoding="async" src={`https://image.tmdb.org/t/p/w92${n.poster}`} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                    : <UserAvatar user={n.actor} name={n.actor?.display_name} className="bell-avatar" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    <span className="block text-xs text-slate-500">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{ago(n.at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {((push && pushSupported()) || canInstall) && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              {push && pushSupported() && (
                <button type="button" onClick={togglePush} disabled={busy} className="account-secondary inline-flex items-center gap-1.5 text-xs">
                  <BellRing size={14} /> {pushOn ? "Turn off on this device" : "Notify me on this device"}
                </button>
              )}
              {canInstall && (
                <button type="button" onClick={install} className="account-secondary inline-flex items-center gap-1.5 text-xs">
                  <Download size={14} /> Install the app
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** For guests: the install offer alone, when the browser allows it. */
export function InstallButton() {
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;
  return (
    <button type="button" onClick={install} className="icon-control" aria-label="Install Umbrify as an app" title="Install the app">
      <Download size={18} />
    </button>
  );
}
