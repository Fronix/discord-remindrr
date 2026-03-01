import type { RemindFlowState } from "../types";

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const _map = new Map<string, RemindFlowState>();

type InitData = Pick<
	RemindFlowState,
	"message" | "timezone" | "date" | "interval" | "ordinal"
>;

/** Initialise a new /remind session keyed by sessionId. */
export function initState(
	sessionId: string,
	userId: string,
	data: InitData,
): void {
	_map.set(sessionId, {
		sessionId,
		userId,
		expiresAt: Date.now() + STATE_TTL_MS,
		scheduleType: null,
		weekdays: null,
		hour: "12",
		minute: "00",
		...data,
	});
}

/** Patch select-menu–sourced fields on an existing session. No-op if missing or expired. */
export function patchState(
	sessionId: string,
	patch: Partial<
		Pick<RemindFlowState, "scheduleType" | "weekdays" | "hour" | "minute">
	>,
): void {
	const entry = _map.get(sessionId);
	if (!entry) return;
	Object.assign(entry, patch);
}

/** Retrieve session state, returning null if missing or expired. */
export function getState(sessionId: string): RemindFlowState | null {
	const entry = _map.get(sessionId);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		_map.delete(sessionId);
		return null;
	}
	return entry;
}

/** Remove session state (e.g. after reminder is created). */
export function clearState(sessionId: string): void {
	_map.delete(sessionId);
}

/** Periodically clean up expired entries (call this on a timer). */
export function purgeExpired(): void {
	const now = Date.now();
	for (const [key, val] of _map) {
		if (now > val.expiresAt) _map.delete(key);
	}
}
