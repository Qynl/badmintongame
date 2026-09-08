import { useEffect, useMemo } from 'react';
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { labelTexture } from './materials';
function Sign({ text, position, rotation = [0, 0, 0], size = [5, 1.1], orange = false }: { text: string; position: [number, number, number]; rotation?: [number, number, number]; size?: [number, number]; orange?: boolean }) {
  const map = useMemo(() => labelTexture(text, orange ? '#192924' : '#d7dace', orange ? '#d88850' : '#233d35'), [text, orange]);
  return <mesh position={position} rotation={rotation}><planeGeometry args={size}/><meshStandardMaterial map={map} roughness={0.95}/></mesh>;
}
function Seating({ side }: { side: number }) {
  const seats = useMemo(() => {
    const geometry = new BoxGeometry(1, 1, 1), material = new MeshStandardMaterial({ roughness: 0.74 });
    const mesh = new InstancedMesh(geometry, material, 189), transform = new Object3D();
    let index = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 21; i++) {
      const x = row * 0.8, y = row * 0.4 + 0.38, z = i * 0.7 - 7;
      const color = new Color(i % 7 === 0 ? '#8d7859' : '#43564d');
      transform.position.set(x, y + 0.14, z); transform.rotation.set(0, 0, 0); transform.scale.set(0.49, 0.07, 0.52); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index++, color);
      transform.position.set(x + 0.23, y + 0.4, z); transform.rotation.z = -0.1; transform.scale.set(0.065, 0.49, 0.51); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index++, color);
      transform.position.set(x + 0.1, y - 0.03, z); transform.rotation.z = 0; transform.scale.set(0.06, 0.3, 0.4); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index++, new Color('#303931'));
    }
    mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }, []);
  useEffect(() => () => { seats.geometry.dispose(); (seats.material as MeshStandardMaterial).dispose(); }, [seats]);
  return <group position={[side * 7.5, 0, -1]} rotation={[0, side < 0 ? Math.PI : 0, 0]}>
    {[0, 1, 2].map((row) => <mesh key={row} position={[row * 0.8 + 0.3, row * 0.4 + 0.15, 0]} receiveShadow><boxGeometry args={[0.9, 0.3, 16]}/><meshStandardMaterial color="#777971" roughness={0.95}/></mesh>)}
    <primitive object={seats}/>
  </group>;
}
function Equipment() {
  return <group position={[5.2, 0, 3.9]}>
    <mesh position={[0, 0.46, 0]} castShadow><boxGeometry args={[0.55, 0.09, 2.7]}/><meshStandardMaterial color="#a18a65" roughness={0.55}/></mesh>
    {[-0.95, 0.95].map((z) => <mesh key={z} position={[0, 0.22, z]}><boxGeometry args={[0.46, 0.44, 0.08]}/><meshStandardMaterial color="#26302a" metalness={0.5}/></mesh>)}
    <mesh position={[0, 0.58, -0.6]} rotation={[0.03, 0.1, 0]} castShadow><boxGeometry args={[0.48, 0.14, 0.55]}/><meshStandardMaterial color="#d5d1ba" roughness={1}/></mesh>
    <mesh position={[0.1, 0.64, 0.7]} castShadow><cylinderGeometry args={[0.045, 0.053, 0.26, 16]}/><meshStandardMaterial color="#bb713f" roughness={0.32} metalness={0.2}/></mesh>
    <mesh position={[0.1, 0.79, 0.7]}><cylinderGeometry args={[0.032, 0.032, 0.04, 12]}/><meshStandardMaterial color="#dddcd0"/></mesh>
    <mesh position={[-0.55, 0.19, 0]} rotation={[0, 0.12, -0.1]} castShadow><capsuleGeometry args={[0.18, 0.55, 5, 12]}/><meshStandardMaterial color="#242e29" roughness={0.8}/></mesh>
    <mesh position={[-0.65, 0.4, -0.8]}><cylinderGeometry args={[0.035, 0.035, 0.8, 12]}/><meshStandardMaterial color="#e8d8b6" roughness={0.8}/></mesh>
  </group>;
}
export function Environment() {
  return <group>
    <mesh position={[0, 4.7, -12]} receiveShadow><boxGeometry args={[26, 9.4, 0.25]}/><meshStandardMaterial color="#454e44" roughness={0.97}/></mesh>
    <mesh position={[0, 1.05, -11.84]}><boxGeometry args={[26, 2.1, 0.11]}/><meshStandardMaterial color="#283e33" roughness={0.82}/></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * 12, 4.7, 0]} receiveShadow><boxGeometry args={[0.25, 9.4, 34]}/><meshStandardMaterial color="#5b6257" roughness={1}/></mesh>
      <mesh position={[side * 11.81, 1.0, 0]}><boxGeometry args={[0.12, 2, 34]}/><meshStandardMaterial color="#283e33" roughness={0.9}/></mesh>
      {[-8, -3, 2, 7, 12].map((z) => <group key={z} position={[side * 11.7, 0, z]}>
        <mesh position={[0, 4.5, 0]}><boxGeometry args={[0.35, 9, 0.3]}/><meshStandardMaterial color="#343e35" metalness={0.25} roughness={0.7}/></mesh>
        <mesh position={[-side * 0.02, 6.25, 1.8]} rotation={[0, -side * Math.PI / 2, 0]}><planeGeometry args={[3, 2.5]}/><meshStandardMaterial color="#c6d1c4" emissive="#b4c7b7" emissiveIntensity={0.23} roughness={0.32}/></mesh>
        {[0.3, 1.3, 2.3, 3.3].map((v) => <mesh key={v} position={[-side * 0.045, 6.25, v]}><boxGeometry args={[0.08, 2.6, 0.06]}/><meshStandardMaterial color="#424b41"/></mesh>)}
      </group>)}
      <Seating side={side}/>
    </group>)}
    {Array.from({ length: 49 }, (_, i) => <mesh key={i} position={[-11.7 + i * 0.48, 4.6, -11.81]}><boxGeometry args={[0.06, 4.5, 0.07]}/><meshStandardMaterial color="#333c31" roughness={0.8}/></mesh>)}
    <Sign text="F E A T H E R" position={[0, 4.8, -11.72]} size={[8, 1.5]}/>
    <Sign text="PLAY THE LONG GAME." position={[0, 3.4, -11.7]} size={[5.4, 0.55]}/>
    <Sign text="01" position={[-8, 3.5, -11.7]} size={[1.6, 1.6]} orange/>
    <Sign text="THE CLUB / EST. 2024" position={[8, 3.5, -11.7]} size={[3.4, 0.75]}/>
    <mesh position={[-5.7, 1.18, -11.64]}><boxGeometry args={[1.2, 2.36, 0.15]}/><meshStandardMaterial color="#182b24" roughness={0.7}/></mesh>
    <mesh position={[-5.25, 1.05, -11.54]}><boxGeometry args={[0.04, 0.2, 0.04]}/><meshStandardMaterial color="#c2bca6" metalness={0.8}/></mesh>
    <Sign text="EXIT" position={[-5.7, 2.65, -11.59]} size={[0.65, 0.25]}/>
    <mesh position={[0, 4.7, 17]} receiveShadow><boxGeometry args={[26, 9.4, 0.25]}/><meshStandardMaterial color="#454e44" roughness={0.97}/></mesh>
    <mesh position={[0, 1.05, 16.84]}><boxGeometry args={[26, 2.1, 0.11]}/><meshStandardMaterial color="#283e33" roughness={0.82}/></mesh>
    <Sign text="F E A T H E R" position={[0, 4.8, 16.72]} rotation={[0, Math.PI, 0]} size={[8, 1.5]}/>
    <Sign text="EVERY POINT IS A NEW BEGINNING." position={[0, 3.4, 16.72]} rotation={[0, Math.PI, 0]} size={[7, 0.6]}/>
    <mesh position={[0, 9.4, 0]}><boxGeometry args={[26, 0.25, 34]}/><meshStandardMaterial color="#33382e" roughness={1}/></mesh>
    {[-10, -5, 0, 5, 10, 15].map((z) => <group key={z} position={[0, 8.7, z]}>
      <mesh><boxGeometry args={[24, 0.42, 0.2]}/><meshStandardMaterial color="#2f382f" metalness={0.4} roughness={0.6}/></mesh>
      <mesh position={[0, -0.65, 0]}><boxGeometry args={[24, 0.12, 0.16]}/><meshStandardMaterial color="#40483b" metalness={0.4}/></mesh>
      {[-9, -6, -3, 0, 3, 6, 9].map((x) => <mesh key={x} position={[x, -0.32, 0]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.065, 0.8, 0.065]}/><meshStandardMaterial color="#40483b" metalness={0.4}/></mesh>)}
    </group>)}
    {[-4.8, 4.8].map((x) => [-7, -1, 5].map((z) => <group key={`${x}-${z}`} position={[x, 7.9, z]}>
      <mesh><boxGeometry args={[0.65, 0.12, 2.2]}/><meshStandardMaterial color="#858b78" metalness={0.6} roughness={0.4}/></mesh>
      <mesh position={[0, -0.067, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[0.5, 2]}/><meshStandardMaterial color="#fff4dc" emissive="#fff4dc" emissiveIntensity={3}/></mesh>
    </group>))}
    <Equipment/>
  </group>;
}
