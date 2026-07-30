export function normalizeBusinessText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeAddress(value: string): string {
  return normalizeBusinessText(value).replace(
    /(특별자치도|특별자치시|광역시|특별시)/g,
    "",
  );
}

export function isPotentialLicenseMatch(
  target: { name: string; address: string },
  candidate: { name: string; address: string },
): boolean {
  const targetName = normalizeBusinessText(target.name);
  const candidateName = normalizeBusinessText(candidate.name);
  const targetAddress = normalizeAddress(target.address);
  const candidateAddress = normalizeAddress(candidate.address);
  return (
    targetName.length > 1 &&
    targetName === candidateName &&
    (targetAddress.includes(candidateAddress) || candidateAddress.includes(targetAddress))
  );
}
