export function audioLevel(samples: Float32Array) {
  let sum = 0;
  for (const x of samples) sum += x * x;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
export function isSilent(samples: Float32Array) { return audioLevel(samples) < 0.0003; }