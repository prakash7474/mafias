import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const SKULL_R = 0.92;

export default function SkullStatue() {
  /* Build geometries and materials once — the scene re-renders on every scroll
     event, so constructing these inline would allocate new GPU resources each time. */
  const { stoneMat, darkMat, craniumGeo, faceGeo, jawGeo, eyeGeo, noseGeo, toothGeo } = useMemo(() => {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#7a7670',
      roughness: 0.92,
      metalness: 0.04,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: '#14121a',
      roughness: 0.96,
      metalness: 0.0,
    });

    const craniumGeo = new THREE.SphereGeometry(SKULL_R, 44, 26);
    craniumGeo.scale(1, 1.04, 1);
    const cp = craniumGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const n = Math.sin(x * 11 + y * 9 + z * 7 + 4) * 0.016;
      cp.setXYZ(i, x * (1 + n), y * (1 + n * 0.6), z * (1 + n));
    }
    cp.needsUpdate = true;
    craniumGeo.computeVertexNormals();

    const faceGeo = new THREE.SphereGeometry(SKULL_R * 0.84, 34, 18, 0, Math.PI * 2, 0, Math.PI / 1.6);

    const jawGeo = new THREE.BoxGeometry(SKULL_R * 0.78, SKULL_R * 0.62, SKULL_R * 0.52);
    const jp = jawGeo.attributes.position;
    const jh = jawGeo.parameters.height / 2;
    for (let i = 0; i < jp.count; i++) {
      const y = jp.getY(i);
      const t = (y + jh) / (jh * 2);
      const s = 1 - t * 0.18;
      jp.setXYZ(i, jp.getX(i) * s, jp.getY(i), jp.getZ(i) * s);
    }
    jp.needsUpdate = true;
    jawGeo.computeVertexNormals();

    const eyeGeo = new THREE.SphereGeometry(SKULL_R * 0.24, 18, 14);
    const noseGeo = new THREE.ConeGeometry(SKULL_R * 0.2, SKULL_R * 0.42, 10, 1, false, 0, Math.PI / 2);
    const toothGeo = new THREE.BoxGeometry(0.075, 0.13, 0.055);

    return { stoneMat, darkMat, craniumGeo, faceGeo, jawGeo, eyeGeo, noseGeo, toothGeo };
  }, []);

  useEffect(() => () => {
    [stoneMat, darkMat].forEach(m => m.dispose());
    [craniumGeo, faceGeo, jawGeo, eyeGeo, noseGeo, toothGeo].forEach(g => g.dispose());
  }, [stoneMat, darkMat, craniumGeo, faceGeo, jawGeo, eyeGeo, noseGeo, toothGeo]);

  return (
    <group position={[4.0, 1.0, -3]}>
      <mesh geometry={craniumGeo} material={stoneMat} castShadow receiveShadow />
      <mesh geometry={faceGeo} material={stoneMat}
        position={[0, SKULL_R * 0.12, SKULL_R * 0.58]}
        rotation={[-Math.PI * 0.14, 0, 0]}
        castShadow receiveShadow />
      <mesh geometry={jawGeo} material={stoneMat}
        position={[0, -SKULL_R * 0.18, SKULL_R * 0.42]}
        rotation={[Math.PI * 0.09, 0, 0]}
        castShadow receiveShadow />
      <mesh geometry={eyeGeo} material={darkMat}
        position={[-SKULL_R * 0.34, SKULL_R * 0.18, SKULL_R * 0.74]}
        castShadow={false} receiveShadow={false} />
      <mesh geometry={eyeGeo} material={darkMat}
        position={[SKULL_R * 0.34, SKULL_R * 0.18, SKULL_R * 0.74]}
        castShadow={false} receiveShadow={false} />
      <mesh geometry={noseGeo} material={darkMat}
        position={[0, -SKULL_R * 0.08, SKULL_R * 0.8]}
        rotation={[-Math.PI * 0.28, 0, 0]}
        castShadow={false} receiveShadow={false} />
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh key={i} geometry={toothGeo} material={stoneMat}
          position={[i * 0.12, -SKULL_R * 0.38, SKULL_R * 0.69]}
          rotation={[Math.PI * 0.12, 0, 0]}
          castShadow receiveShadow />
      ))}
      <mesh position={[0, -0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.5, 1.7, 24]} />
        <meshStandardMaterial color="#6e6a62" roughness={0.9} metalness={0.02} />
      </mesh>
    </group>
  );
}
