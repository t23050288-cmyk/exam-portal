"use client";
import { motion } from "framer-motion";
import styles from "./FloatingDiamond.module.css";

export default function FloatingDiamond() {
  const shouldReduceMotion = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  return (
    <motion.div 
      className={styles.container}
      animate={shouldReduceMotion ? {} : { 
        y: [0, -20, 0],
        rotateY: [0, 180, 360]
      }}
      transition={{ 
        duration: 8, 
        repeat: Infinity, 
        ease: "easeInOut" 
      }}
    >
      <svg viewBox="0 0 100 100" className={styles.svg}>
        <path 
          d="M50 0 L90 50 L50 100 L10 50 Z" 
          fill="none" 
          stroke="var(--nexus-cyan)" 
          strokeWidth="1" 
          opacity="0.8"
        />
        <path 
          d="M10 50 L90 50 M50 0 L50 100" 
          fill="none" 
          stroke="var(--nexus-cyan)" 
          strokeWidth="0.5" 
          opacity="0.4"
        />
        <circle cx="50" cy="50" r="2" fill="var(--nexus-cyan)" />
      </svg>
      <div className={styles.glow} />
    </motion.div>
  );
}
