// If-None-Match uses weak comparison for GET. Cloudflare may add W/ when
// compressing the representation, so compare the opaque tag rather than bytes.
export function matchesTag(header: string | null, tag: string) {
  return !!header?.split(",").some((value) => {
    const candidate = value.trim();
    return (
      candidate === "*" ||
      candidate.replace(/^W\//, "") === tag.replace(/^W\//, "")
    );
  });
}
