// The ports of the user and of the reference backend: no page of a capture run may call them.
export const FORBIDDEN_URL =
	/^https?:\/\/(localhost\.?|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(8080|8081|5173|5174)(\/|$)/;

export const isForbiddenUrl = (url: string): boolean => FORBIDDEN_URL.test(url);

/** A capture file must hold an image: PNG signature and more than a blank page's few bytes. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BYTES = 1000;

export function assertImage(file: string, data: Buffer): number {
	if (data.length < MIN_BYTES) {
		throw new Error(`${file} is empty or too small (${data.length} bytes).`);
	}
	if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file} is not a PNG file.`);
	return data.length;
}
