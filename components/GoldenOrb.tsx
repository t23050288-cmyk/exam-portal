"use client";
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, Float } from "@react-three/drei";
import * as THREE from "three";

function OrbMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.z += 0.005;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 100, 100]}>
      <meshStandardMaterial
        color="#FFD700"
        metalness={1}
        roughness={0.1}
        emissive="#B8860B"
        emissiveIntensity={0.2}
      />
    </Sphere>
  );
}

export default function GoldenOrb() {
  return (
    <div style={{ width: "100%", height: "100%", cursor: "grab" }}>
      <Canvas camera={{ position: [0, 0, 2.5], fov: 40 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.7} />
        <spotLight position={[5, 5, 5]} angle={0.3} penumbra={1} intensity={3} castShadow />
        <pointLight position={[-5, -5, 2]} intensity={1.5} color="#FFD700" />
        <Float speed={3} rotationIntensity={2} floatIntensity={1.5}>
          <OrbMesh />
        </Float>
      </Canvas>
    </div>
  );
}
