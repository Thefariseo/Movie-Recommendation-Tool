import React, { useState } from "react";
export default function UserAvatar({ user, name, className = "" }) {
  const [failed, setFailed] = useState(null);
  const source = user?.avatar_url;
  const initials = (name || user?.full_name || "Film lover")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`user-avatar ${className}`}>
      {source && failed !== source ? (
        <img
          src={source}
          alt={`${name || "Your"} profile photo`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(source)}
        />
      ) : (
        <span aria-label={`${name || "Your"} initials`}>{initials || "U"}</span>
      )}
    </span>
  );
}
