// Flatten node transforms into the vertices, turn, scale to real height, base at y=0, centred. Keeps textures as-is.
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import * as THREE from 'three';
const [,, src, out, rotDeg, heightM] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.listScenes()[0];
const R = new THREE.Matrix4().makeRotationY((+rotDeg || 0) * Math.PI / 180);
const box = new THREE.Box3(), v = new THREE.Vector3(), seen = new Set(), meshNodes = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = new THREE.Matrix4().fromArray(node.getWorldMatrix()).premultiply(R);
  const N = new THREE.Matrix3().getNormalMatrix(M);
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), nrm = p.getAttribute('NORMAL');
    if (seen.has(pos)) throw new Error('shared accessor'); seen.add(pos);
    const a = pos.getArray();
    for (let i = 0; i < a.length; i += 3) { v.set(a[i], a[i+1], a[i+2]).applyMatrix4(M); a[i]=v.x; a[i+1]=v.y; a[i+2]=v.z; box.expandByPoint(v); }
    if (nrm) { const n = nrm.getArray(); for (let i = 0; i < n.length; i += 3) { v.set(n[i], n[i+1], n[i+2]).applyMatrix3(N).normalize(); n[i]=v.x; n[i+1]=v.y; n[i+2]=v.z; } }
  }
  meshNodes.push(node);
}
const k = (+heightM) / (box.max.y - box.min.y), c = box.getCenter(new THREE.Vector3());
for (const p of root.listMeshes().flatMap((m) => m.listPrimitives())) {
  const pos = p.getAttribute('POSITION'), a = pos.getArray();
  for (let i = 0; i < a.length; i += 3) { a[i] = (a[i]-c.x)*k; a[i+1] = (a[i+1]-box.min.y)*k; a[i+2] = (a[i+2]-c.z)*k; }
  pos.setArray(a);
}
// one clean node per mesh straight under the scene
const mesh0 = meshNodes[0].getMesh();
for (const n of meshNodes.slice(1)) for (const p of n.getMesh().listPrimitives()) mesh0.addPrimitive(p);
const clean = doc.createNode('rosetta').setMesh(mesh0);
for (const ch of scene.listChildren()) scene.removeChild(ch);
scene.addChild(clean);
await doc.transform(prune(), dedup());
await io.write(out, doc);
const s = box.getSize(new THREE.Vector3()).multiplyScalar(k);
console.log('wrote', out, (fs.statSync(out).size/1e6).toFixed(2), 'MB  size m:', s.toArray().map(x=>x.toFixed(3)).join(' x '));
