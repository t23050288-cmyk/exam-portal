"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import styles from "./Mountain.module.css";

export default function Mountain() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 400 / 150, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setSize(400, 150);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    containerRef.current.appendChild(renderer.domElement);

    // Mountain Geometry
    const geometry = new THREE.PlaneGeometry(20, 10, 32, 32);
    const vertices = geometry.attributes.position.array;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      // Create peaks
      if (Math.abs(x) < 5) {
        vertices[i + 2] = Math.random() * 2 + (5 - Math.abs(x)) * 0.5;
      } else {
        vertices[i + 2] = Math.random() * 0.5;
      }
    }

    const material = new THREE.MeshBasicMaterial({
      color: 0x28D7D6,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });

    const mountain = new THREE.Mesh(geometry, material);
    mountain.rotation.x = -Math.PI / 2.5;
    scene.add(mountain);

    // Nodes (points at peaks)
    const pointsGeom = new THREE.BufferGeometry();
    const pointsPos = [];
    for (let i = 0; i < 20; i++) {
        pointsPos.push((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 5, Math.random() * 2);
    }
    pointsGeom.setAttribute('position', new THREE.Float32BufferAttribute(pointsPos, 3));
    const pointsMat = new THREE.PointsMaterial({ color: 0x28D7D6, size: 0.15 });
    const points = new THREE.Points(pointsGeom, pointsMat);
    scene.add(points);

    camera.position.z = 8;
    camera.position.y = 2;

    const animate = () => {
      requestAnimationFrame(animate);
      mountain.rotation.z += 0.001;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      renderer.dispose();
      if (containerRef.current) containerRef.current.removeChild(renderer.domElement);
    };
  }, []);

  if (!mounted) return <div className={styles.fallback} />;

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.canvasContainer} />
      <div className={styles.overlay} />
    </div>
  );
}
