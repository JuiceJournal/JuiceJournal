'use client';

const REACTION_TYPES = [
  { id: 'divine', labelKey: 'farmingHub.reactions.divine' },
  { id: 'holy', labelKey: 'farmingHub.reactions.holy' },
  { id: 'pog', labelKey: 'farmingHub.reactions.pog' }
];

function getCount(run, reaction) {
  return Number(run?.reactions?.[reaction] || 0);
}

function isSelected(run, reaction) {
  return Array.isArray(run?.viewerReactions) && run.viewerReactions.includes(reaction);
}

export default function FarmRunReactions({ run, t, interactive = false, busyReaction = null, onToggle = null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {REACTION_TYPES.map((reaction) => {
        const selected = isSelected(run, reaction.id);
        const content = (
          <>
            <span>{t(reaction.labelKey)}</span>
            <span className="rounded-full bg-black/35 px-2 py-0.5 text-[0.65rem] text-stone-100">
              {getCount(run, reaction.id)}
            </span>
          </>
        );
        const className = selected
          ? 'inline-flex items-center gap-2 rounded-full border border-poe-gold/60 bg-poe-gold/20 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-amber-100'
          : 'inline-flex items-center gap-2 rounded-full border border-poe-border bg-[rgba(28,23,20,0.6)] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-poe-mist';

        if (!interactive) {
          return (
            <span key={reaction.id} className={className}>
              {content}
            </span>
          );
        }

        return (
          <button
            key={reaction.id}
            type="button"
            disabled={busyReaction === reaction.id}
            onClick={() => onToggle?.(reaction.id)}
            className={`${className} transition-colors hover:border-poe-gold/40 hover:text-amber-100 disabled:cursor-wait disabled:opacity-60`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
