/**
 * A deliberately badly formatted version of the "Market equilibrium" slide, built in HTML so it
 * scales like the real slide canvas (sizes are in container-width units).
 */
export function MessySlide() {
  return (
    <div className="lp-messy" role="img" aria-label="A cluttered, hand-formatted slide: misspelled title, overflowing text and clashing colors">
      <div className="lp-messy-band" />
      <p className="lp-messy-title">
        Market <span className="lp-messy-typo">Equilibrum</span>!!
      </p>
      <p className="lp-messy-sticker">IMPORTANT!!</p>
      <div className="lp-messy-body">
        <p>
          Market equilibrium is the price at which the quantity buyers want to purchase equals the quantity sellers want to supply, so
          there is no pressure for the price to change. This is very important for the exam!!!
        </p>
        <p className="lp-messy-b1">• demand curve slopes DOWN</p>
        <p className="lp-messy-b2">• supply curve slopes up (see graph)</p>
        <p className="lp-messy-b3">- if price above P* = surplus, if below = shortage, also price controls create shortages or surpluses which we will see next week in chapter 5</p>
        <p>In the graph the demand curve and the supply curve cross at the equilibrium point (P*, Q*) and that is where the market clears…</p>
      </div>
      <div className="lp-messy-graph">[insert graph here]</div>
    </div>
  );
}
