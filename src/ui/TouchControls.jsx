import React, { useRef, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// On-screen controls for touch devices. Writes into the same InputController
// the keyboard uses, by faking key state.
// ---------------------------------------------------------------------------

export function TouchControls({ controller }) {
  const zoneRef = useRef(null);
  const [stick, setStick] = useState(null); // {ox, oy, x, y}

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone || !controller) return;
    let touchId = null;

    const setAxes = (dx, dy) => {
      const max = 46;
      const m = Math.hypot(dx, dy);
      const s = m > max ? max / m : 1;
      const nx = (dx * s) / max;
      const ny = (dy * s) / max;
      controller.touchAxes = [nx, -ny];
    };

    const onStart = (e) => {
      const t = e.changedTouches[0];
      touchId = t.identifier;
      const r = zone.getBoundingClientRect();
      setStick({ ox: t.clientX - r.left, oy: t.clientY - r.top, x: 0, y: 0 });
      controller.touchAxes = [0, 0];
      e.preventDefault();
    };
    const onMove = (e) => {
      if (touchId == null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const r = zone.getBoundingClientRect();
        setStick(prev => {
          if (!prev) return prev;
          const dx = (t.clientX - r.left) - prev.ox;
          const dy = (t.clientY - r.top) - prev.oy;
          setAxes(dx, dy);
          const max = 46;
          const m = Math.hypot(dx, dy);
          const s = m > max ? max / m : 1;
          return { ...prev, x: dx * s, y: dy * s };
        });
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        touchId = null;
        setStick(null);
        controller.touchAxes = [0, 0];
      }
    };

    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd);
    zone.addEventListener('touchcancel', onEnd);
    return () => {
      zone.removeEventListener('touchstart', onStart);
      zone.removeEventListener('touchmove', onMove);
      zone.removeEventListener('touchend', onEnd);
      zone.removeEventListener('touchcancel', onEnd);
      controller.touchAxes = null;
    };
  }, [controller]);

  const btn = (action, label, hold = false) => ({
    onTouchStart: (e) => {
      e.preventDefault();
      controller.touchButtons.add(action);
      if (!hold) controller.touchPressed.add(action);
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      controller.touchButtons.delete(action);
    },
    children: label,
  });

  return (
    <div className="touch-controls">
      <div className="stick-zone" ref={zoneRef}>
        {stick && (
          <div className="stick" style={{ left: stick.ox, top: stick.oy }}>
            <div className="knob" style={{ left: 54 + stick.x, top: 54 + stick.y }} />
          </div>
        )}
      </div>
      <div className="touch-btns">
        <button className="tbtn" {...btn('sprint', 'RUN', true)} />
        <button className="tbtn" {...btn('shoot', 'SHOOT', true)} />
        <button className="tbtn" {...btn('through', 'THRU')} />
        <button className="tbtn" {...btn('pass', 'PASS')} />
        <button className="tbtn" {...btn('slide', 'SLIDE')} />
        <button className="tbtn" {...btn('tackle', 'TACKLE')} />
      </div>
    </div>
  );
}
