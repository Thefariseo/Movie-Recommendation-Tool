// =====================================================
// File: FriendsPage.jsx
// Description: Page that aggregates recent activities from friends.
// =====================================================
import React from "react";
import FriendsActivity from "../components/FriendsActivity";


export default function FriendsPage() {
  return (
    <main className="pb-16 pt-6">
      <FriendsActivity />
    </main>
  );
}
