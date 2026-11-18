// Subtle window opening animation: 97% -> 100% scale with a 4px upward slide and fade-in
vec4 animation(vec2 uv) {
  float p = umbriel_clamped_progress;
  float scale = mix(0.97, 1.0, p);
  float y_offset = mix(4.0, 0.0, p) / max(umbriel_size.y, 1.0);

  vec2 sample_uv = (uv - vec2(0.5, 0.5 + y_offset)) / scale + vec2(0.5);
  return umbriel_sample(sample_uv) * p;
}
