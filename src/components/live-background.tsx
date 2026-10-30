/** Fixed, slowly drifting light field behind the liquid-glass panels. Pure CSS so it costs no download. */
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden>
      <span className="live-orb live-orb-1" />
      <span className="live-orb live-orb-2" />
      <span className="live-orb live-orb-3" />
      <span className="live-orb live-orb-4" />
      <span className="live-sweep" />
      <span className="live-grid" />
      <span className="live-vignette" />
    </div>
  );
}
