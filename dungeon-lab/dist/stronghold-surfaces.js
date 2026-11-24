(() => {
  'use strict';

  // Stronghold solids and their material inlays are all axis-aligned rectangles.
  // Compare the coordinates at the same precision the WebGL vertex buffer uses.
  function rectangle(face, index) {
    const [a, b, c] = face.points;
    const axis = a[0] === b[0] && a[0] === c[0] ? 0 : a[1] === b[1] && a[1] === c[1] ? 1 : 2;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    // a and c are opposite corners in both the box and the inlay builders.
    const winding = (b[u] - a[u]) * (c[v] - a[v]) - (b[v] - a[v]) * (c[u] - a[u]);
    return {
      face, index, axis, plane: Math.fround(a[axis]), sign: face.sign ?? Math.sign(winding),
      u0: Math.fround(Math.min(a[u], c[u])), v0: Math.fround(Math.min(a[v], c[v])),
      u1: Math.fround(Math.max(a[u], c[u])), v1: Math.fround(Math.max(a[v], c[v])),
      cuts: null,
    };
  }

  function cut(target, mask) {
    (target.cuts ??= []).push(mask);
  }

  function findSharedAreas(plane) {
    plane.sort((a, b) => a.u0 - b.u0);
    let active = [];
    for (const rect of plane) {
      active = active.filter((other) => other.u1 > rect.u0);
      for (const other of active) {
        if (other.v1 <= rect.v0 || other.v0 >= rect.v1) continue;
        if (rect.sign !== other.sign) {
          // Solids on both sides of this part of the plane make it an interior seam.
          cut(rect, other);
          cut(other, rect);
        } else if (rect.index > other.index) cut(other, rect);
        else cut(rect, other);
      }
      active.push(rect);
    }
  }

  function subtract(rect, mask, out) {
    const u0 = Math.max(rect.u0, mask.u0);
    const u1 = Math.min(rect.u1, mask.u1);
    const v0 = Math.max(rect.v0, mask.v0);
    const v1 = Math.min(rect.v1, mask.v1);
    if (u0 >= u1 || v0 >= v1) {
      out.push(rect);
      return;
    }
    if (rect.u0 < u0) out.push({ u0: rect.u0, u1: u0, v0: rect.v0, v1: rect.v1 });
    if (u1 < rect.u1) out.push({ u0: u1, u1: rect.u1, v0: rect.v0, v1: rect.v1 });
    if (rect.v0 < v0) out.push({ u0, u1, v0: rect.v0, v1: v0 });
    if (v1 < rect.v1) out.push({ u0, u1, v0: v1, v1: rect.v1 });
  }

  function surface(rect, part) {
    const { axis, plane, sign } = rect;
    const point = (u, v) => axis === 0 ? [plane, u, v] : axis === 1 ? [v, plane, u] : [u, v, plane];
    const { u0, u1, v0, v1 } = part;
    const corners = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
    return { points: sign > 0 ? corners : corners.reverse(), color: rect.face.color };
  }

  // Later materials own the covered part of an exterior face. For example the
  // floor and its moss pattern become adjoining polygons at exactly the same Y.
  function resolve(faces) {
    const planes = [new Map(), new Map(), new Map()];
    const rects = faces.map(rectangle);
    for (const rect of rects) {
      const byPosition = planes[rect.axis];
      if (!byPosition.has(rect.plane)) byPosition.set(rect.plane, []);
      byPosition.get(rect.plane).push(rect);
    }
    for (const byPosition of planes) {
      for (const plane of byPosition.values()) findSharedAreas(plane);
    }
    const visible = [];
    for (const rect of rects) {
      if (!rect.cuts) {
        visible.push(surface(rect, rect));
        continue;
      }
      let parts = [rect];
      for (const mask of rect.cuts) {
        const remaining = [];
        for (const part of parts) subtract(part, mask, remaining);
        parts = remaining;
        if (!parts.length) break;
      }
      for (const part of parts) visible.push(surface(rect, part));
    }
    return visible;
  }

  globalThis.StrongholdSurfaces = { resolve };
})();
