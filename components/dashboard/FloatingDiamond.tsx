"use client";
import { motion } from "framer-motion";
import styles from "./FloatingDiamond.module.css";

export default function FloatingDiamond() {
  const shouldReduceMotion = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  return (
    <motion.div 
      className={styles.container}
      animate={{ 
        rotate: [0, 360]
      }}
      transition={{ 
        duration: 20, 
        repeat: Infinity, 
        ease: "linear" 
      }}
    >
      <img 
        src="/images/nexus_orb.jpg" 
        alt="Core" 
        className={styles.orbImage} 
      />
      <div className={styles.glow} />
    </motion.div>
  );
}
