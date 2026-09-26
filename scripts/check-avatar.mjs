import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const file = new URL('../public/avatar/mpfb.glb', import.meta.url);
let bytes = fs.readFileSync(file);
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const arkit=`eyeBlinkLeft eyeBlinkRight eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight jawForward jawLeft jawRight jawOpen mouthClose mouthFunnel mouthPucker mouthLeft mouthRight mouthSmileLeft mouthSmileRight mouthFrownLeft mouthFrownRight mouthDimpleLeft mouthDimpleRight mouthStretchLeft mouthStretchRight mouthRollLower mouthRollUpper mouthShrugLower mouthShrugUpper mouthPressLeft mouthPressRight mouthLowerDownLeft mouthLowerDownRight mouthUpperUpLeft mouthUpperUpRight browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight cheekSquintRight noseSneerLeft noseSneerRight tongueOut`.split(' ');
const visemes='sil PP FF TH DD kk CH SS nn RR aa E I O U'.split(' ').map(v=>'viseme_'+v);
if(process.argv.includes('--prepare')) {
 const {default:sharp}=await import('sharp');
 const original=bytes.subarray(20+jsonLength+8);
 const replacement=new Map();
 for(const image of gltf.images||[]){
  if(image.bufferView===undefined)continue;
  const v=gltf.bufferViews[image.bufferView];const data=original.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  const meta=await sharp(data).metadata();
  const transform=sharp(data).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true});
  const compressed=meta.hasAlpha?await transform.png({compressionLevel:9}).toBuffer():await transform.jpeg({quality:84,mozjpeg:true}).toBuffer();
  replacement.set(image.bufferView,compressed);image.mimeType=meta.hasAlpha?'image/png':'image/jpeg';
 }
 const chunks=[];let offset=0;
 gltf.bufferViews.forEach((v,i)=>{const data=replacement.get(i)||original.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);const padding=Buffer.alloc((4-data.length%4)%4);v.byteOffset=offset;v.byteLength=data.length;chunks.push(data,padding);offset+=data.length+padding.length;});
 gltf.buffers[0].byteLength=offset;
 for(const mesh of gltf.meshes){const names=mesh.extras?.targetNames;if(!names||names.includes('viseme_sil'))continue;names.push('viseme_sil');for(const p of mesh.primitives){const count=gltf.accessors[p.attributes.POSITION].count;const index=gltf.accessors.length;gltf.accessors.push({componentType:5126,count,type:'VEC3',min:[0,0,0],max:[0,0,0]});p.targets.push({POSITION:index});}if(mesh.weights)mesh.weights.push(0);}
 let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(chunks);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);bytes=Buffer.concat([header,json,bh,bin]);fs.writeFileSync(file,bytes);
}
const names=new Set(gltf.meshes.flatMap(m=>m.extras?.targetNames||[]));
assert.equal(new Set(arkit).size,52);
for(const name of [...arkit,...visemes])assert(names.has(name),`Missing blendshape ${name}`);
for(const bone of ['Hips','Spine','Head','LeftArm','RightArm'])assert(gltf.nodes.some(n=>n.name?.replace(/^mixamorig:?/,'')===bone),`Missing rig bone ${bone}`);
for(const mesh of gltf.meshes){if(!mesh.extras?.targetNames)continue;for(const p of mesh.primitives)assert.equal(p.targets.length,mesh.extras.targetNames.length,'Morph names and targets differ');}
console.log(JSON.stringify({arkit:52,visemes:15,mixamoRig:true,megabytes:Number((bytes.length/1048576).toFixed(2)),sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
