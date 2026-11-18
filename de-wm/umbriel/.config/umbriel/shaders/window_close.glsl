// Subtle window closing animation: 100% -> 97% scale with a 4px downward slide and fade-out
vec4 animation(vec2 uv) {
  float p = umbriel_clamped_progress;
  float scale = mix(1.0, 0.97, p);
  float y_offset = mix(0.0, 4.0, p) / max(umbriel_size.y, 1.0);

  vec2 sample_uv = (uv - vec2(0.5, 0.5 + y_offset)) / scale + vec2(0.5);
  return umbriel_sample(sample_uv) * (1.0 - p);
}
