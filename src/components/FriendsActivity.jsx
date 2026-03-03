// =====================================================
// File: FriendsActivity.jsx
// Description: Shows friends' recent activity using mocked data.
// =====================================================
import React, { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import MovieCard from "./MovieCard";

export default function FriendsActivity() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    // TODO Replace with real fetch -> e.g., Firebase Firestore
    const mock = [
      {
        id: 1,
        friend: "Giorgia",
        movie: {
          id: 603692,
          title: "John Wick: Chapter 4",
          poster_path: "/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg",
        },
        date: new Date().toISOString(),
      },
      {
        id: 2,
        friend: "Matteo",
        movie: {
          id: 872585,
          title: "Oppenheimer",
          poster_path: "/ptpr0kGAckfQkJeJIT6gx7Q9F5x.jpg",
        },
        date: new Date(Date.now() - 86400000).toISOString(), // one day ago
      },
    ];
    setActivities(mock);
  }, []);

  return (
    <div className="p-4">
      <h2 className="mb-4 text-2xl font-semibold text-slate-800 dark:text-slate-100">Friends' Activity</h2>
      <div className="space-y-6">
        {activities.map(({ id, friend, movie, date }) => (
          <div key={id} className="flex items-center gap-4 rounded-lg bg-white p-4 shadow dark:bg-slate-800">
            <UserCircle className="h-10 w-10 text-slate-400" />
            <div className="flex-1">
              <p className="text-base text-slate-700 dark:text-slate-200">
                <span className="font-medium text-indigo-600 dark:text-indigo-400">{friend}</span> added <span className="font-medium">{movie.title}</span> to their watchlist.
              </p>
              <p className="text-sm text-slate-400">{new Date(date).toLocaleString()}</p>
            </div>
            <div className="h-20 w-14 flex-shrink-0">
              <MovieCard movie={movie} showActions={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
