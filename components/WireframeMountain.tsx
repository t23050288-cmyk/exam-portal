"use client";
import { useEffect, useRef, useState } from "react";

/* ── Static SVG fallback ─────────────────────────────────── */
function MountainSVG({ percentile }: { percentile?: number }) {
  return (
    <svg viewBox="0 0 360 100" xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id="mgFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,180,60,0.35)"/>
          <stop offset="100%" stopColor="rgba(255,140,0,0.02)"/>
        </linearGradient>
        <linearGradient id="mgStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF8C00"/>
          <stop offset="50%" stopColor="#ffb860"/>
          <stop offset="100%" stopColor="#FF8C00"/>
        </linearGradient>
        <filter id="mgGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="dotGlow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Grid lines */}
      {[25,50,75].map(y => (
        <line key={y} x1="0" y1={y} x2="360" y2={y}
          stroke="rgba(0,220,255,0.06)" strokeWidth="0.5"/>
      ))}
      {[60,120,180,240,300].map(x => (
        <line key={x} x1={x} y1="0" x2={x} y2="100"
          stroke="rgba(0,220,255,0.04)" strokeWidth="0.5"/>
      ))}
      {/* Mountain fill */}
      <path d="M0,90 L30,62 L55,38 L70,14 L85,28 L110,45 L140,22 L165,38 L190,55 L220,32 L250,48 L280,64 L310,42 L340,58 L360,90 Z"
        fill="url(#mgFill)"/>
      {/* Mountain stroke */}
      <path d="M0,90 L30,62 L55,38 L70,14 L85,28 L110,45 L140,22 L165,38 L190,55 L220,32 L250,48 L280,64 L310,42 L340,58 L360,90"
        fill="none" stroke="url(#mgStroke)" strokeWidth="1.8"
        strokeLinejoin="round" filter="url(#mgGlow)"/>
      {/* Peak nodes */}
      {[[70,14],[140,22],[220,32],[310,42]].map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="3.5"
          fill="#FF8C00" filter="url(#dotGlow)" opacity="0.9"/>
      ))}
      {/* Pyramid shape (right) */}
      <polygon points="330,60 355,85 305,85"
        fill="rgba(0,220,255,0.04)"
        stroke="rgba(0,220,255,0.4)" strokeWidth="1"
        filter="url(#mgGlow)"/>
      <line x1="330" y1="60" x2="330" y2="85"
        stroke="rgba(0,220,255,0.2)" strokeWidth="0.5"/>
    </svg>
  );
}

interface Props {
  percentile?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function WireframeMountain({ percentile, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [useFallback, setUseFallback] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;
    if (prefersReduced || isMobile) { setUseFallback(true); return; }

    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      try {
        const THREE = await import("three");
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const W = container.clientWidth || 400;
        const H = container.clientHeight || 160;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio(dpr);
        renderer.setSize(W, H);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
        camera.position.set(0, 4, 9);
        camera.lookAt(0, 0, 0);

        // Terrain mesh
        const geo = new THREE.PlaneGeometry(16, 8, 60, 28);
        geo.rotateX(-Math.PI / 2.2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i);
          const h = Math.sin(x * 0.8) * Math.cos(z * 0.6) * 1.4
                  + Math.sin(x * 1.4 + z * 0.4) * 0.7
                  + Math.sin(x * 0.3 - z * 0.8) * 1.1;
          pos.setY(i, Math.max(0, h));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
          color: 0xff8c00, wireframe: true, transparent: true, opacity: 0.4,
        });
        scene.add(new THREE.Mesh(geo, mat));

        // Peak nodes
        const sGeo = new THREE.SphereGeometry(0.1, 5, 5);
        const sMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
        [[-3.5, 2.1, -0.5], [-0.8, 2.5, 0.2], [2.2, 2.0, -1.5], [4.5, 1.6, 0.8]].forEach(([x,y,z]) => {
          const s = new THREE.Mesh(sGeo, sMat);
          s.position.set(x, y, z);
          scene.add(s);
        });

        // Pyramid
        const pGeo = new THREE.ConeGeometry(1.1, 1.8, 4);
        pGeo.rotateY(Math.PI / 4);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x00dcff, wireframe: true, transparent: true, opacity: 0.5 });
        const pyramid = new THREE.Mesh(pGeo, pMat);
        pyramid.position.set(6, 0.9, -1.5);
        scene.add(pyramid);

        let frame = 0, animId: number;
        const tick = () => {
          animId = requestAnimationFrame(tick);
          pyramid.rotation.y += 0.006;
          camera.position.x = Math.sin(frame * 0.004) * 0.3;
          frame++;
          renderer.render(scene, camera);
        };
        tick();

        cleanupRef.current = () => {
          cancelAnimationFrame(animId);
          renderer.dispose();
          geo.dispose(); mat.dispose();
          pGeo.dispose(); pMat.dispose();
          sGeo.dispose(); sMat.dispose();
        };
      } catch { setUseFallback(true); }
    }, { threshold: 0.1 });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => { observer.disconnect(); cleanupRef.current?.(); };
  }, []);

  const containerStyle: React.CSSProperties = {
    width: "100%", height: "100%", minHeight: 140,
    position: "relative",
    ...(style || {}),
  };

  if (useFallback) {
    return <div className={className} style={containerStyle}><MountainSVG percentile={percentile}/></div>;
  }

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }}/>
    </div>
  );
}
