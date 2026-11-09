// How labs/cannon/cannon.glb was made from the Sketchfab download (scene.gltf). Needs @gltf-transform/core, functions, extensions, meshoptimizer and sharp.
// Prepare the Civil War Cannon (Zack_Hawley, CC BY 4.0) for Quest 3.
// Output: cannon.glb with two top-level parts under "Cannon":
//   "Body"   - carriage + barrel (static)
//   "Wheels" - both wheels + axle hub, pivot ON the axle so it can spin
// Origin: on the ground directly under the axle. Muzzle points +X. Y up. Units = model units (~0.45 of real size).
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten, clearNodeTransform, join, weld, simplify, dedup, prune, textureCompress, resample} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(process.argv[2]||'../src/scene.gltf');
const root=doc.getRoot(), scene=root.listScenes()[0];
const WHEEL=new Set(['Wheel_0','WheelRim_19','Wheel Spokes_7','WheelNut_13','WheelNut2_9','WheelNut3_8','WheelNut4_6','WheelNutInner_2','WheelNutInner2_5','WheelNutCap_20','RectangularPrism_4','RectangularPrismMetal_21']);
// mark wheel meshes by parent name before flattening
const isWheel=new Set();
for(const n of root.listNodes()) if(WHEEL.has(n.getName())) for(const c of [n,...n.listChildren()]) if(c.getMesh()) isWheel.add(c);
await doc.transform(flatten());
for(const n of root.listNodes()) if(n.getMesh()) clearNodeTransform(n); // bake world transforms into vertices
// world: muzzle -Z, axle at (0,0.3297,-0.3492)
const AX=[0,0.32967,-0.34923];
const mats=root.listMaterials();
// --- decide textured vs flat per material (by largest world size of the parts using it) ---
const big=new Map();
for(const n of root.listNodes()){const m=n.getMesh(); if(!m) continue; for(const p of m.listPrimitives()){const pos=p.getAttribute('POSITION');const mn=pos.getMin([]),mx=pos.getMax([]);const d=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]);const k=p.getMaterial();big.set(k,Math.max(big.get(k)||0,d));}}
const CHAINS=new Set(['Material.017','Material.038']);
async function avg(tex,ch){const img=tex.getImage();const {data,info}=await sharp(Buffer.from(img)).resize(64,64).raw().toBuffer({resolveWithObject:true});let s=[0,0,0];const n=info.width*info.height;for(let i=0;i<n;i++)for(let c=0;c<3;c++)s[c]+=data[i*info.channels+c];return s.map(v=>v/n/255);}
const srgb2lin=c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
let flat=0,kept=0;
for(const mat of mats){
  const textured=(big.get(mat)||0)>=0.3 && !CHAINS.has(mat.getName());
  if(textured){kept++;continue;}
  flat++;
  const bc=mat.getBaseColorTexture(), mr=mat.getMetallicRoughnessTexture();
  if(bc){const a=await avg(bc);mat.setBaseColorFactor([...a.map(srgb2lin),1]);mat.setBaseColorTexture(null);}
  if(mr){const a=await avg(mr);mat.setRoughnessFactor(a[1]);mat.setMetallicFactor(a[2]);mat.setMetallicRoughnessTexture(null);}
  mat.setNormalTexture(null);mat.setOcclusionTexture(null);
  // drop UVs on prims using this material so they weld + simplify better
  for(const p of mat.listParents()) if(p.propertyType==='Primitive'){p.setAttribute('TEXCOORD_0',null);p.setAttribute('TANGENT',null);}
}
console.log('materials textured:',kept,'flat:',flat);
// --- regroup: Cannon > Body, Wheels ---
const cannon=doc.createNode('Cannon'), body=doc.createNode('Body'), wheels=doc.createNode('Wheels');
cannon.addChild(body).addChild(wheels);
for(const n of root.listNodes()){ if(!n.getMesh()) continue; const w=isWheel.has(n); for(const p of n.getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION'), nor=p.getAttribute('NORMAL'), tan=p.getAttribute('TANGENT');
  // move so axle is origin, then rotate -90deg about Y (muzzle -Z -> +X): (x,y,z)->(-z,y,x)
  const f=(acc,shift)=>{ if(!acc) return; const a=acc.getArray(); const sz=acc.getElementSize(); for(let i=0;i<a.length;i+=sz){ let x=a[i],y=a[i+1],z=a[i+2]; if(shift){x-=AX[0]; z-=AX[2]; if(w) y-=AX[1];} a[i]=-z; a[i+1]=y; a[i+2]=x; } acc.setArray(a); };
  f(pos,true); f(nor,false); f(tan,false);
 }
 (w?wheels:body).addChild(n);
}
wheels.setTranslation([0,AX[1],0]);
for(const c of scene.listChildren()) scene.removeChild(c);
scene.addChild(cannon);
await doc.transform(
  dedup(), prune(),
  weld(),
  simplify({simplifier:MeshoptSimplifier, ratio:0.0, error:0.0008, lockBorder:false}),
  join({keepNamed:false}),
  prune(),
  textureCompress({encoder:sharp, targetFormat:'jpeg', quality:82, resize:[512,512], slots:/^(baseColor|metallicRoughness)/}),
  textureCompress({encoder:sharp, targetFormat:'png', resize:[512,512], slots:/^normal/}),
  dedup(), prune()
);
await MeshoptSimplifier.ready;
let tris=0;for(const m of root.listMeshes())for(const p of m.listPrimitives())tris+=(p.getIndices()?p.getIndices().getCount():p.getAttribute('POSITION').getCount())/3;
console.log('tris',tris,'meshes',root.listMeshes().length,'materials',root.listMaterials().length,'textures',root.listTextures().length);
scene.setExtras({credit:'"Civil War Cannon" by Zack_Hawley, CC BY 4.0, https://sketchfab.com/3d-models/civil-war-cannon-77642765da02400cbc8db58b5532ff9e'});
await io.write(process.argv[3]||'../out/cannon.glb',doc);
