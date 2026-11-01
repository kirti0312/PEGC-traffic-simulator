import { memo } from 'react';

// Placeholder until steps 7a / 7b. States plainly that nothing is measured here yet.
export const StubScreen = memo(function StubScreen({ title, step }) {
  return (
    <div className="dock">
      <div className="wrap">
        <h2>{title}</h2>
        <div className="glass card"><p className="lead">This screen is built in step {step}. No results are shown here until real simulation runs back them.</p></div>
      </div>
    </div>
  );
});
