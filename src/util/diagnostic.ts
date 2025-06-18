export function prettyData(data: unknown) {
  return JSON.stringify(data, null, '  ');
}
