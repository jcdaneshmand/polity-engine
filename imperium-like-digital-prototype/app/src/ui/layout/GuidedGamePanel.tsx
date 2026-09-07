import { useState } from "react";
import type { GameState } from "../../../../engine/src/game/state";
import { GUIDED_CHAPTERS, deriveGuidedProgress, getGuidedChapter, nextGuidedChapterId, type GuidedChapterId } from "../../guidedGame";

type GuidedGamePanelProps = {
  G: GameState;
  chapterId: GuidedChapterId;
  onRestart: () => void;
  onExit: () => void;
  onNextChapter: (chapterId: GuidedChapterId) => void;
};

export default function GuidedGamePanel({ G, chapterId, onRestart, onExit, onNextChapter }: GuidedGamePanelProps) {
  const [paused, setPaused] = useState(false);
  const chapter = getGuidedChapter(chapterId);
  const progress = deriveGuidedProgress(chapterId, G);
  const currentStep = chapter.steps[progress];
  const nextChapterId = nextGuidedChapterId(chapterId);

  return (
    <section
      className="panel guided-game-panel"
      aria-label="Learning game guide"
      data-qa="guided-game-panel"
      data-chapter-id={chapterId}
      data-progress={progress}
      data-complete={currentStep ? "false" : "true"}
    >
      <div className="guided-game-heading">
        <div>
          <span className="eyebrow">Learning Game / Chapter {chapter.number} of {GUIDED_CHAPTERS.length}</span>
          <strong>{chapter.title}</strong>
        </div>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? "Continue Guide" : "Pause Guide"}
        </button>
      </div>

      {paused ? (
        <p className="guided-game-muted" role="status">Guidance is paused. The game remains active and continues to use normal rules.</p>
      ) : currentStep ? (
        <div className="guided-game-step" role="status" aria-live="polite" aria-atomic="true">
          <span>Step {progress + 1} of {chapter.steps.length}</span>
          <h2>{currentStep.title}</h2>
          <p>{currentStep.instruction}</p>
          <small>{currentStep.rule}</small>
          {currentStep.targetCardIds?.length ? <span className="sr-only">Target card ids: {currentStep.targetCardIds.join(", ")}</span> : null}
        </div>
      ) : (
        <div className="guided-game-complete" role="status" aria-live="polite">
          <h2>Chapter complete</h2>
          <p>The engine state satisfies every checkpoint for {chapter.title}.</p>
          {nextChapterId ? <button type="button" className="primary-action" onClick={() => onNextChapter(nextChapterId)}>Start Next Chapter</button> : <p>All five chapters are complete. Review the final score, then return to setup.</p>}
        </div>
      )}

      <div className="guided-game-progress" aria-label={`${progress} of ${chapter.steps.length} steps complete`}>
        {chapter.steps.map((step, index) => <span key={step.id} className={index < progress ? "is-complete" : index === progress ? "is-current" : ""}>{index + 1}</span>)}
      </div>
      <div className="guided-game-actions">
        <button type="button" onClick={() => {
          if (window.confirm("Restart this chapter from its original position? Current learning progress in this chapter will be replaced.")) onRestart();
        }}>Restart Chapter</button>
        <button type="button" onClick={onExit}>Exit to Setup</button>
      </div>
    </section>
  );
}
