// Project onto the nearest 45-degree direction in native image coordinates.
// Limit the distance along that direction so clipping never changes the angle.
export function snappedLineEnd(start, point, width, height) {
  const dx = point.x - start.x, dy = point.y - start.y;
  const directions = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const index = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const [x, y] = directions[index];
  let distance = Math.max(0, (dx * x + dy * y) / (x * x + y * y));
  if (x) distance = Math.min(distance, x > 0 ? width - start.x : start.x);
  if (y) distance = Math.min(distance, y > 0 ? height - start.y : start.y);
  return { x: start.x + x * distance, y: start.y + y * distance };
}
