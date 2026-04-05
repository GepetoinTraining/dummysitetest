"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";

interface Canvas3DProps {
  style?: React.CSSProperties;
  [key: string]: unknown;
}

export default function Canvas3D({ style, ...props }: Canvas3DProps) {
  return (
    <div style={{ width: "100%", height: props.height as string ?? "400px", ...style }}>
      <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Grid
          args={[20, 20]}
          cellColor="#7d756b"
          sectionColor="#4e463d"
          fadeDistance={30}
          fadeStrength={1}
        />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
