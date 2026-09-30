'use client';

import { useState } from 'react';
import CharacterArea from '@/components/CharacterArea';
import ChatPanel from '@/components/ChatPanel';
import Sidebar from '@/components/Sidebar';
import { useConversation } from '@/lib/conversation/useConversation';

/**
 * The single view: full-screen animated character with sidebar and overlay chat panel (FR-001, FR-003, D14).
 *
 * Full-screen responsive layout:
 * - Collapsible Sidebar on the left (toggled as off-canvas drawer on mobile < 640px)
 * - Hamburger menu button (< 640px) in top-left
 * - Full-screen centered character display
 * - Transparent ChatPanel overlay covering bottom 50% of the character area
 *
 * The seam is preserved:
 * - CharacterArea receives emotion and thinking across the seam
 */
export default function Page() {
  const conversation = useConversation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleNewChat = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] relative">
      {/* Sidebar (left panel on desktop/tablet, off-canvas drawer on mobile) */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        onNewChat={handleNewChat}
      />

      {/* Main stage area */}
      <main className="relative flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Mobile top bar with hamburger menu (< 640px) */}
        <div className="sm:hidden absolute top-3 left-3 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
            className="p-2 rounded-xl bg-[rgba(28,30,39,0.85)] backdrop-blur-md border border-[var(--border)] text-[var(--text)] shadow-md hover:bg-[var(--surface)] active:scale-95 transition-all cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Character Stage: Full-screen height, character centered in screen width */}
        <div className="relative w-full h-full flex-1 overflow-hidden">
          <CharacterArea
            emotion={conversation.emotion}
            thinking={conversation.status === 'waiting'}
          />

          {/* Chat Panel: Overlays bottom 50% of the character area with transparent background */}
          <ChatPanel conversation={conversation} />
        </div>
      </main>
    </div>
  );
}
