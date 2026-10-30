/** Fixed forest backdrop behind the liquid-glass panels, with a slow drift so the page feels alive. */
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden>
      <span className="live-photo" />
      <span className="live-haze" />
    </div>
  );
}
