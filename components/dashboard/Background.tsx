"use client";
import styles from "./Background.module.css";

export default function Background() {
  return (
    <div className={styles.container}>
      <div className={styles.mesh} />
      <div className={styles.glow} />
      <div className={styles.grid} />
    </div>
  );
}
