import React from "react";
import { List, BookOpen, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
    <div className="bottom-nav">
      <button
        className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
        onClick={() => setActiveTab("dashboard")}
      >
        <List size={20} />
      </button>

      <button
        className={`nav-item ${activeTab === "practice" ? "active" : ""}`}
        onClick={() => setActiveTab("practice")}
      >
        <BookOpen size={20} />
      </button>

      <button
        className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
        onClick={() => setActiveTab("settings")}
      >
        <Settings size={20} />
      </button>
    </div>
  );
};
