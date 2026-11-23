// The footer's water: the Paper Water shader (Apache-2.0, copied into
// vendor/paper-shaders) as caustic light along the top of the water. Its
// code loads only when the footer comes near the screen, and it pauses by
// itself while off screen. It holds still with reduced motion. Without
// WebGL it never starts, and the footer keeps the plain SVG wave.

const OCEAN = "#143C72";
const SKY = "#8EB9DF";
// Tuned on the footer test page: the same on desktop and phones except the
// ripple size.
const SETTINGS = { highlights: 0.15, caustic: 0.3, waves: 0.18, layering: 0.62, speed: 0.45 };
const RIPPLE_SIZE = { desktop: 0.22, phone: 0.4 };
const phone = matchMedia("(max-width: 640px)");
const still = matchMedia("(prefers-reduced-motion: reduce)");

async function start(footer) {
  const [{ ShaderMount }, { waterFragmentShader }, { getShaderColorFromString }, { ShaderFitOptions }, { emptyPixel }] =
    await Promise.all([
      import("./vendor/paper-shaders/shader-mount.js"),
      import("./vendor/paper-shaders/shaders/water.js"),
      import("./vendor/paper-shaders/get-shader-color-from-string.js"),
      import("./vendor/paper-shaders/shader-sizing.js"),
      import("./vendor/paper-shaders/empty-pixel.js"),
    ]);
  const image = new Image();
  image.src = emptyPixel;  // no photo: the water is the texture itself
  await image.decode();

  const uniforms = () => ({
    u_image: image,
    u_colorBack: getShaderColorFromString(OCEAN),
    u_colorHighlight: getShaderColorFromString(SKY),
    u_highlights: SETTINGS.highlights,
    u_layering: SETTINGS.layering,
    u_waves: SETTINGS.waves,
    u_edges: 0,
    u_caustic: SETTINGS.caustic,
    u_size: phone.matches ? RIPPLE_SIZE.phone : RIPPLE_SIZE.desktop,
    u_fit: ShaderFitOptions.cover,
    u_rotation: 0, u_scale: 1,
    u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5,
    u_worldWidth: 0, u_worldHeight: 0,
  });
  const layer = footer.querySelector(".water-shader");
  const mount = new ShaderMount(layer, waterFragmentShader, uniforms(), undefined,
    still.matches ? 0 : SETTINGS.speed, 0, 1.5, undefined, ["u_image"]);
  footer.classList.add("water-on");  // hides the SVG wave underneath
  phone.addEventListener("change", () => mount.setUniforms(uniforms()));
  still.addEventListener("change", () => mount.setSpeed(still.matches ? 0 : SETTINGS.speed));
}

const footer = document.querySelector(".site-footer");
if (footer?.querySelector(".water-shader")) {
  const seen = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    seen.disconnect();
    start(footer).catch(() => {});  // no WebGL: the SVG wave stays
  }, { rootMargin: "600px 0px" });
  seen.observe(footer);
}
