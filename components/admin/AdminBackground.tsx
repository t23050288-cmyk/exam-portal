"use client";
import React from "react";

export default function AdminBackground() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: -1,
      overflow: "hidden",
      background: "#050a10",
    }}>
      {/* Primary Background Image */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: 'url("/images/admin/forest_background.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.5,
        filter: "brightness(0.6) contrast(1.2) saturate(0.8)",
      }} />

      {/* Decorative Overlays */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(circle at 50% 50%, transparent 0%, rgba(5, 10, 16, 0.4) 100%)",
      }} />

      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)",
        backgroundSize: "40px 40px",
        opacity: 0.3,
      }} />

      {/* Animated Scanline / Grid effect matching the user's image HUD style */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02))",
        backgroundSize: "100% 4px, 3px 100%",
        pointerEvents: "none",
      }} />
    </div>
  );
}
