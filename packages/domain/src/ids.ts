// ADR-0001: ids are client-generated UUIDv7 (RFC 9562), so offline devices mint them without coordination and they
// sort by creation time. Randomness is injected, keeping this pure: the app passes bytes from a secure source.

const hex = (byte: number) => byte.toString(16).padStart(2, "0");

/** A UUIDv7 for `now` (Unix milliseconds) from 10 random bytes. */
export const uuidv7 = (now: number, random: Uint8Array): string => {
	if (random.length < 10) throw new Error("uuidv7 needs 10 random bytes");
	const bytes = new Uint8Array(16);
	// 48-bit big-endian timestamp; division keeps it exact beyond 32 bits.
	let time = now;
	for (let i = 5; i >= 0; i -= 1) {
		bytes[i] = time % 256;
		time = Math.floor(time / 256);
	}
	bytes.set(random.subarray(0, 10), 6);
	bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
	bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC 9562 variant
	const text = Array.from(bytes, hex).join("");
	return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};
