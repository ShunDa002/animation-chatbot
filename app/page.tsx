'use client';

import CharacterArea from '@/components/CharacterArea';
import ChatPanel from '@/components/ChatPanel';
import { useConversation } from '@/lib/conversation/useConversation';

/**
 * The single view, with no navigation (FR-001).
 *
 * This is where the seam is wired, and it is worth reading closely because it is the whole of the
 * cross-seam traffic in the application:
 *
 *     <CharacterArea emotion={conversation.emotion} thinking={conversation.status === 'waiting'} />
 *
 * One Emotion, one boolean. No reply text, no message object, no duration, no confidence score, and
 * no callback coming back the other way (FR-020, contracts/emotion-seam.md). If a future change
 * needs to add a third thing here, the contract has failed and amending it is a spec-level decision.
 */
export default function Page() {
  const conversation = useConversation();

  return (
    <main className="page">
      <header className="masthead">
        <h1>Aria</h1>
        <p>An animated character who reacts to what she says.</p>
      </header>

      <div className="stage-and-chat">
        <CharacterArea
          emotion={conversation.emotion}
          thinking={conversation.status === 'waiting'}
        />
        <ChatPanel conversation={conversation} />
      </div>

      <p className="attribution">
        {/* Filled in with the rig's required attribution once the model is vendored (T010). */}
        Built with Next.js. Character rendering by pixi-live2d-display over PixiJS.
      </p>
    </main>
  );
}
