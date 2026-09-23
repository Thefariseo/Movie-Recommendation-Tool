import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { backend } from "../utils/backend";
import UserAvatar from "./UserAvatar";
export default function ProfileFriends({ userId }) {
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFriends(null);
    setError("");
    backend("social", undefined, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setFriends(
            data.people.filter(
              (p) =>
                data.following.includes(p.id) && data.followers.includes(p.id),
            ),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Your friends could not be loaded.");
      });
    return () => controller.abort();
  }, [userId, retry]);
  return (
    <section className="account-panel space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Friends{friends ? ` · ${friends.length}` : ""}
        </h2>
        <Link className="text-sm text-indigo-600 hover:underline" to="/friends">
          Your circle →
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm">
          {error}{" "}
          <button className="underline" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : friends === null ? (
        <p role="status" className="text-sm text-slate-500">
          Loading friends…
        </p>
      ) : friends.length ? (
        <ul className="grid grid-cols-2 gap-3">
          {friends.slice(0, 8).map((friend) => (
            <li key={friend.id} className="flex min-w-0 items-center gap-2">
              <UserAvatar
                user={friend}
                name={friend.display_name}
                className="friend-avatar"
              />
              <span className="truncate text-sm">{friend.display_name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">
          Follow each other to appear here and plan your next movie night.
        </p>
      )}
      {!!friends?.length && (
        <Link className="account-secondary inline-flex" to="/tonight">
          Plan a movie night
        </Link>
      )}
    </section>
  );
}
