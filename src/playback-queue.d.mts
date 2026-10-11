export type PlaybackQueue = {ids: string[]; order: string[]; index: number; shuffle: boolean; repeat: 'off' | 'all' | 'one'};
export function createPlaybackQueue(ids: string[], options?: {shuffle?: boolean; repeat?: PlaybackQueue['repeat']; random?: () => number}): PlaybackQueue;
export function currentQueueId(queue: PlaybackQueue | null): string | undefined;
export function stepPlaybackQueue(queue: PlaybackQueue, options?: {direction?: number; ended?: boolean; random?: () => number}): PlaybackQueue | null;
export function selectQueueTrack(queue: PlaybackQueue, id: string): PlaybackQueue;
export function setQueueShuffle(queue: PlaybackQueue, enabled: boolean, random?: () => number): PlaybackQueue;
export function retainQueueTracks(queue: PlaybackQueue | null, availableIds: string[]): PlaybackQueue | null;
