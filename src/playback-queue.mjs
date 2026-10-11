const unique = ids => [...new Set(ids.filter(id => typeof id === 'string' && id))];
function shuffled(ids, random) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createPlaybackQueue(ids, {shuffle = false, repeat = 'off', random = Math.random} = {}) {
  const source = unique(ids);
  return {ids: source, order: shuffle ? shuffled(source, random) : [...source], index: 0, shuffle, repeat};
}
export const currentQueueId = queue => queue?.order[queue.index];
export function stepPlaybackQueue(queue, {direction = 1, ended = false, random = Math.random} = {}) {
  if (!currentQueueId(queue)) return null;
  if (ended && queue.repeat === 'one') return {...queue};
  const index = queue.index + (direction < 0 ? -1 : 1);
  if (index >= 0 && index < queue.order.length) return {...queue, index};
  if (queue.repeat !== 'all') return null;
  if (direction < 0) return {...queue, index: queue.order.length - 1};
  let order = queue.shuffle ? shuffled(queue.ids, random) : [...queue.ids];
  // Each shuffled cycle contains every track once, with no boundary repeat.
  if (queue.shuffle && order.length > 1 && order[0] === currentQueueId(queue)) [order[0], order[1]] = [order[1], order[0]];
  return {...queue, order, index: 0};
}
export function selectQueueTrack(queue, id) {
  const index = queue.order.indexOf(id);
  return index < 0 ? queue : {...queue, index};
}
export function setQueueShuffle(queue, enabled, random = Math.random) {
  if (queue.shuffle === enabled) return queue;
  const current = currentQueueId(queue);
  const order = enabled ? [current, ...shuffled(queue.ids.filter(id => id !== current), random)].filter(Boolean) : [...queue.ids];
  return {...queue, shuffle: enabled, order, index: Math.max(0, order.indexOf(current))};
}
export function retainQueueTracks(queue, availableIds) {
  if (!queue) return null;
  const available = new Set(availableIds), ids = queue.ids.filter(id => available.has(id)), order = queue.order.filter(id => available.has(id));
  if (!order.length) return null;
  const current = currentQueueId(queue);
  const next = queue.order.slice(queue.index).find(id => available.has(id));
  const index = Math.max(0, order.indexOf(available.has(current) ? current : next || order.at(-1)));
  return {...queue, ids, order, index};
}
