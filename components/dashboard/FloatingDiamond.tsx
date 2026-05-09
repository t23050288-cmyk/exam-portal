"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import styles from "./FloatingDiamond.module.css";

export default function FloatingDiamond() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    const size = 150;
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    containerRef.current.appendChild(renderer.domElement);

    // Texture
    const loader = new THREE.TextureLoader();
    const texture = loader.load("/images/nexus_orb.jpg");
    
    // Geometry
    const geometry = new THREE.SphereGeometry(3, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0xff9a4c),
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.8,
    });

    const orb = new THREE.Mesh(geometry, material);
    scene.add(orb);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xff9a4c, 2);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 7;

    const animate = () => {
      requestAnimationFrame(animate);
      orb.rotation.y += 0.01;
      orb.rotation.x += 0.002;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <div ref={containerRef} className={styles.canvasWrapper} />
      <div className={styles.glow} />
    </div>
  );
}
