import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float ridge(float a) {
  return sin(a * 3.1) * 0.5 + sin(a * 7.3 + 1.7) * 0.25 + sin(a * 13.7 + 0.4) * 0.14 + sin(a * 23.0 + 2.2) * 0.07;
}

void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  float az = atan(d.x, d.z);

  // base vertical gradient
  vec3 top = vec3(0.010, 0.006, 0.045);
  vec3 mid = vec3(0.055, 0.018, 0.140);
  vec3 hor = vec3(0.420, 0.090, 0.330);
  vec3 col = mix(mid, top, smoothstep(0.04, 0.75, el));

  // horizon glow band
  float hg = exp(-abs(el + 0.015) * 8.0);
  col += hor * hg * 1.1;

  // sun (toward -z)
  vec3 sunDir = normalize(vec3(0.0, 0.17, -1.0));
  float sunDot = dot(d, sunDir);
  float disc = smoothstep(0.958, 0.972, sunDot);
  float glow = pow(clamp(sunDot, 0.0, 1.0), 24.0);
  vec3 sunLow = vec3(1.0, 0.28, 0.25);
  vec3 sunHigh = vec3(1.0, 0.75, 0.35);
  vec3 sunCol = mix(sunLow, sunHigh, smoothstep(-0.05, 0.35, d.y));
  // horizontal slats through the lower half of the disc
  float slat = step(0.35, sin(d.y * 120.0 - uTime * 0.4));
  float slatMask = mix(slat, 1.0, smoothstep(0.12, 0.22, d.y));
  col += sunCol * disc * slatMask * 1.4;
  col += sunCol * glow * 0.35;

  // stars in the upper sky
  if (el > 0.03) {
    vec2 sp = vec2(az * 38.0, el * 90.0);
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float h = hash(cell);
    if (h > 0.90) {
      float tw = 0.55 + 0.45 * sin(uTime * 2.5 + h * 60.0);
      float star = smoothstep(0.16, 0.0, length(f)) * tw;
      col += vec3(0.75, 0.82, 1.0) * star * smoothstep(0.03, 0.25, el) * (h - 0.9) * 12.0;
    }
  }

  // two mountain ridge silhouettes
  float r1 = 0.030 + 0.050 * (ridge(az) * 0.5 + 0.5);
  float r2 = 0.012 + 0.028 * (ridge(az * 1.7 + 3.9) * 0.5 + 0.5);
  float m1 = smoothstep(r1, r1 - 0.006, el) * smoothstep(-0.16, -0.015, el);
  float m2 = smoothstep(r2, r2 - 0.005, el) * smoothstep(-0.14, -0.01, el);
  vec3 mCol1 = vec3(0.045, 0.012, 0.09);
  vec3 mCol2 = vec3(0.022, 0.006, 0.05);
  // rim light on ridge tops
  col += vec3(0.9, 0.25, 0.5) * smoothstep(0.006, 0.0, abs(el - r1)) * 0.35 * smoothstep(-0.2, 0.0, el);
  col = mix(col, mCol1, m1);
  col = mix(col, mCol2, m2);

  // subtle purple haze near floor
  col += vec3(0.10, 0.03, 0.20) * exp(-abs(el + 0.1) * 5.0) * 0.4;

  gl_FragColor = vec4(col, 1.0);
}
`

export function Sky() {
  const mat = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <mesh scale={[58, 58, 58]} frustumCulled={false}>
      <sphereGeometry args={[1, 40, 24]} />
      <shaderMaterial
        ref={mat}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
