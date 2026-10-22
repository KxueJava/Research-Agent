import * as THREE from "three";

// Material shared with the approved standalone prototype, including its softer light palette.
const fragmentShader = `precision mediump float;
    varying vec2 uvv; uniform float time; uniform float light; uniform float aspect;
    vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i).x,hash2(i+vec2(1.,0.)).x,f.x),mix(hash2(i+vec2(0.,1.)).x,hash2(i+1.).x,f.x),f.y);}
    float waterCells(vec2 p,float t){p+=.38*vec2(sin(p.y*2.4+t*.21),cos(p.x*2.1-t*.17));vec2 cell=floor(p),uv=fract(p);float first=9.,second=9.;
      for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 h=hash2(cell+g);vec2 point=.5+.32*sin(t*.48+6.2831*h);vec2 d=g+point-uv;float v=dot(d,d);second=min(second,max(first,v));first=min(first,v);}}
      return 1.-smoothstep(.025,.17,second-first);
    }
    void main(){
      vec2 p=uvv;float t=time;vec2 q=vec2(p.x*aspect,p.y);
      vec2 flow=vec2(.10*sin(q.y*3.3+t*.19),.09*cos(q.x*2.1-t*.16));
      float n=noise(q*1.6+flow+vec2(t*.026,-t*.018));
      float field=exp(-length((p-vec2(.70+.07*sin(t*.11),.73))*vec2(1.1,1.45))*2.4);
      vec3 deep=mix(vec3(.009,.045,.079),vec3(.025,.22,.29),field*.93);
      deep+=vec3(.006,.035,.043)*n;
      vec3 shallow=mix(vec3(.55,.65,.69),vec3(.77,.82,.83),smoothstep(.0,1.,p.y));
      float angle=atan((p.x-.76)*aspect,1.32-p.y);
      float shaft1=pow(max(0.,sin(angle*19.+.9*sin(t*.12)+n*.6)),7.);
      float shaft2=pow(max(0.,cos(angle*11.-t*.09)),15.);
      float depthFade=smoothstep(.02,.97,p.y);
      float shaft=(shaft1*.75+shaft2*.35)*depthFade;
      float cells=waterCells(q*6.8+flow*5.+vec2(t*.075,-t*.036),t);
      float cellsFar=waterCells(q*4.1+flow*3.-vec2(t*.035,t*.021),t*.65);
      float ceiling=.875+.012*sin(q.x*4.5+t*.6)+.008*sin(q.x*9.-t*.38);
      float waterline=exp(-abs(p.y-ceiling)*95.);
      float surface=smoothstep(ceiling-.01,ceiling+.03,p.y);
      float ripple=pow(.5+.5*sin(q.x*12.+p.y*39.+sin(q.x*3.+t*.55)*2.-t*.8),6.);
      vec3 col=mix(deep,shallow,light);
      col+=mix(vec3(.10,.35,.37),vec3(.20,.28,.24),light)*shaft*.55*mix(1.,.30,light);
      col+=mix(vec3(.09,.27,.29),vec3(.20,.27,.22),light)*(cells*.24+cellsFar*.09)*(.35+.65*depthFade)*mix(1.,.18,light);
      col+=mix(vec3(.12,.35,.38),vec3(.20,.25,.20),light)*(waterline*.38+surface*ripple*.22)*mix(1.,.15,light);
      col*=1.-.18*pow(1.-p.y,2.);
      gl_FragColor=vec4(col,1.);
    }`;

export function createOceanScene(canvas: HTMLCanvasElement): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: THREE.WebGLRenderer | undefined;
  let geometry: THREE.PlaneGeometry | undefined;
  let material: THREE.ShaderMaterial | undefined;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let lost = false;
  let disposed = false;
  const uniforms = {
    time: { value: 0 },
    light: { value: document.documentElement.classList.contains("dark") ? 0 : 1 },
    aspect: { value: window.innerWidth / window.innerHeight },
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
  const release = () => {
    material?.dispose(); geometry?.dispose(); renderer?.dispose();
    material = undefined; geometry = undefined; renderer = undefined;
  };
  const lowPower = () => window.innerWidth < 680 || (navigator.hardwareConcurrency || 4) < 4;
  const resize = () => {
    if (!renderer || lost) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower() ? 1 : 1.35));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.aspect.value = window.innerWidth / window.innerHeight;
  };
  const frame = (now: number) => {
    raf = 0;
    if (disposed || lost || document.hidden || motion.matches || !renderer) return;
    raf = requestAnimationFrame(frame);
    if (last && now - last < 1000 / (lowPower() ? 24 : 30)) return;
    const dt = last ? Math.min(now - last, 100) : 33;
    last = now; elapsed += dt / 1000;
    uniforms.time.value = elapsed;
    try { renderer.render(scene, camera); }
    catch { lost = true; canvas.dataset.state = "static"; stop(); }
  };
  const start = () => {
    stop();
    canvas.dataset.state = renderer && !lost && !motion.matches ? "animated" : "static";
    if (renderer && !lost && !motion.matches && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const init = () => {
    if (disposed || motion.matches || renderer || lost) return;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "low-power"
      });
      scene = new THREE.Scene(); camera = new THREE.Camera(); geometry = new THREE.PlaneGeometry(2, 2);
      material = new THREE.ShaderMaterial({
        uniforms,
        fragmentShader,
        vertexShader: "varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}",
        depthTest: false,
        depthWrite: false
      });
      scene.add(new THREE.Mesh(geometry, material)); resize();
    } catch { lost = true; release(); }
    start();
  };
  const onMotion = () => { if (!renderer && !lost) init(); start(); };
  const onTheme = () => { uniforms.light.value = document.documentElement.classList.contains("dark") ? 0 : 1; };
  const onLost = (event: Event) => { event.preventDefault(); lost = true; stop(); canvas.dataset.state = "static"; };
  const onRestored = () => { release(); lost = false; init(); };
  const onPageHide = () => stop();
  const onPageShow = () => start();
  const observer = new MutationObserver(onTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", start);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  motion.addEventListener("change", onMotion);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  init();
  return () => {
    disposed = true; stop(); observer.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", start);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    motion.removeEventListener("change", onMotion);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    release();
  };
}
