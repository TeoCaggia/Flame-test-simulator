import * as THREE from 'three';
import { RoomEnvironment } from 'three/RoomEnvironment';
import { createVolumetricFlame } from 'bunsen/flame';

// The rod follows one world-space approach curve, then a camera-facing plane
// through the current tip. World coordinates stay fixed during camera turns.
class RodMotion {
  constructor(){
    this.rest=new THREE.Vector3(-3.8,.14,2.6);
    this.target=new THREE.Vector3(.21,3.88,0);
    this.right=new THREE.Vector3(1,0,0);this.up=new THREE.Vector3(0,1,0);
    this.offset=new THREE.Vector3();this.progress=0;this.phase='path';
    this.path=new THREE.CubicBezierCurve3(this.rest.clone(),new THREE.Vector3(-3.8,2.9,2.6),
      new THREE.Vector3(.21,4.88,1.6),this.target.clone());
  }
  configure(x,y){this.target.set(x,y,0);this.path.v2.set(x,y+1,1.6);this.path.v3.copy(this.target);}
  setView(camera){
    this.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
  }
  pathPose(progress){
    const eased=progress*progress*(3-2*progress);
    return {position:this.path.getPoint(progress),angle:eased*Math.PI/6};
  }
  getPose(){
    if(this.returnPose)return {position:this.returnPose.position.clone(),angle:this.returnPose.angle};
    return this.phase==='path'?this.pathPose(this.progress):{
      position:this.target.clone().add(this.offset),angle:Math.PI/6
    };
  }
  setProgress(value){
    this.progress=THREE.MathUtils.clamp(value,0,1);
    if(this.progress>=.9995){this.progress=1;this.phase='plane';this.offset.set(0,0,0);}
  }
  reset(inFlame=false){this.returnPose=null;this.phase=inFlame?'plane':'path';this.progress=inFlame?1:0;this.offset.set(0,0,0);}
  setPlanePosition(position){
    const inPlane=position.clone().sub(this.target);
    // Clip along the plane, never by independently changing world X/Y/Z.
    let fraction=1;
    const low=[-7,.14,-2.55],high=[7,8,3.8];
    for(let i=0;i<3;i++){
      const component=inPlane.getComponent(i),origin=this.target.getComponent(i);
      if(component>0)fraction=Math.min(fraction,(high[i]-origin)/component);
      else if(component<0)fraction=Math.min(fraction,(low[i]-origin)/component);
    }
    this.offset.copy(inPlane).multiplyScalar(Math.max(0,fraction));
  }
  projectedPath(camera,width,height,grabLocal){
    const points=new Float32Array(258);
    for(let i=0;i<=128;i++){
      const progress=i/128;
      const pose=this.pathPose(progress);
      const point=grabLocal.clone().applyAxisAngle(new THREE.Vector3(0,0,1),pose.angle).add(pose.position).project(camera);
      points[i*2]=(point.x+1)*width/2;points[i*2+1]=(1-point.y)*height/2;
    }
    return points;
  }
  progressAtPointer(pointer,camera,width,height,grabLocal,projectedPath=null){
    const points=projectedPath??this.projectedPath(camera,width,height,grabLocal);
    let bestProgress=this.progress,bestDistance=Infinity;
    for(let i=1;i<=128;i++){
      const x=points[(i-1)*2],y=points[(i-1)*2+1],dx=points[i*2]-x,dy=points[i*2+1]-y;
      const t=THREE.MathUtils.clamp(((pointer.x-x)*dx+(pointer.y-y)*dy)/Math.max(1e-8,dx*dx+dy*dy),0,1);
      const distance=(x+dx*t-pointer.x)**2+(y+dy*t-pointer.y)**2;
      if(distance<bestDistance){bestDistance=distance;bestProgress=(i-1+t)/128;}
    }
    // The projected curve can curl back near its endpoint. Requiring 99.95%
    // made the last few pixels difficult to reach, especially from the handle.
    // Capture the final approach and place the tip at the exact flame target.
    if(Math.max(this.progress,bestProgress)>=.75){
      const endX=points[256],endY=points[257];
      let remaining=0;
      for(let i=Math.max(1,Math.ceil(bestProgress*128));i<=128;i++){
        remaining+=Math.hypot(points[i*2]-points[(i-1)*2],points[i*2+1]-points[(i-1)*2+1]);
      }
      const nearEnd=Math.hypot(pointer.x-endX,pointer.y-endY)<=24;
      if(nearEnd||(bestProgress>=.85&&remaining<=24&&bestDistance<=24*24))return 1;
    }
    return bestProgress;
  }
}

// World units are 100 pixels of the original apparatus reference. The original
// simulation remains authoritative; this renderer supplies the camera and picking.
export function createBunsenScene({canvas, textureImages={}, elements=[], onRodStart, onRodEnd, onJar, canPickJar=()=>true, onFailure}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor(0x090914);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  // Glass refraction is already soft: a quarter-area copy of the opaque scene
  // is enough and removes most of the per-frame cost of the transmission pass.
  renderer.transmissionResolutionScale=.5;
  const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(0x090914,20,40);
  const camera=new THREE.PerspectiveCamera(42,1,.1,90);
  // Home framing: three-quarter view from the front right and above, showing
  // the whole cabinet, the bench jar, the burner with its hose and the flame.
  // Fitted to the reference screenshot of 4 October 2026 (920x709 canvas).
  const HOME_AZIMUTH=.307,HOME_ELEVATION=.351,HOME_DISTANCE=21.45;
  const homeTarget=new THREE.Vector3(0,2.57,0),target=homeTarget.clone();
  let azimuth=HOME_AZIMUTH,elevation=HOME_ELEVATION,distance=HOME_DISTANCE,active=false,gesture=null;
  let lastSize='',rodAnimation=null;
  let depthDirty=true,shadowDirty=true,lastRodVisible=true;
  let rodShadowDirty=false;
  let jarShadowDirty=false,jarShadowTime=-Infinity,jarMovedAt=-Infinity;
  const lightLift=new THREE.Vector3(0,.35,0);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=new RodMotion();
  const pickables=[];
  const track=value=>{
    if(value.isTexture&&!value.isDataTexture){
      value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      value.minFilter=THREE.LinearMipmapLinearFilter;value.magFilter=THREE.LinearFilter;
      value.generateMipmaps=true;
    }
    return value;
  };
  const environment=new RoomEnvironment();
  // Keep a dominant side window, but retain enough room bounce and opposite
  // reflection for metal, glass and shadowed surfaces to remain legible.
  environment.traverse(object=>{
    if(object.isPointLight)object.intensity*=.60;
    if(object.material?.isMeshStandardMaterial)object.material.color.setHex(0xaaa49a);
    if(object.material?.isMeshBasicMaterial){
      object.material.color.multiplyScalar(object.position.x<-10?.85:.40);
    }
  });
  const pmrem=new THREE.PMREMGenerator(renderer);
  const envTarget=track(pmrem.fromScene(environment,.09));
  scene.environment=envTarget.texture;
  scene.environmentIntensity=.22;
  environment.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xcbd8e5,0x302218,.07));
  // One lamp over the burner. Its pool (lampPool in the patched shaders) keeps
  // the apparatus lit and lets the cabinet and far wall fall into the dark.
  const key=new THREE.DirectionalLight(0xfff1de,.52);
  key.position.set(-2.5,10,7.5);key.castShadow=true;
  // The shadow camera only has to cover the worktop and the wall behind it.
  key.shadow.mapSize.set(1536,1536);
  // It also has to reach the reagent cabinet at the left end of the bench.
  Object.assign(key.shadow.camera,{left:-11,right:8,top:9.5,bottom:-6,near:.1,far:34});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-.00012;key.shadow.normalBias=.004;key.shadow.radius=2;
  key.target.position.set(0,1,0);scene.add(key,key.target);
  const rim=new THREE.DirectionalLight(0xd5dfff,.08);rim.position.set(5,7,-5);scene.add(rim);
  // Order matters: the patched lighting treats point light 1 as the coloured one.
  const flameLight=new THREE.PointLight(0x5599ff,.65,6,2);flameLight.position.set(0,4,0);scene.add(flameLight);
  const coloredFlameLight=new THREE.PointLight(0xffbf40,0,12,2);
  coloredFlameLight.name='colored-flame-light';scene.add(coloredFlameLight);
  // Analytic translucent shadows avoid extra shadow-map passes on integrated GPUs.
  // Glass attenuates direct light gradually; opaque contents keep their normal shadows.
  const glassShadowUniforms={
    glassCameraWorld:{value:camera.matrixWorld},
    glassBottleCentre:{value:new THREE.Vector3(-2.55,1.0,-1.05)},
    glassRodStart:{value:new THREE.Vector3()},glassRodEnd:{value:new THREE.Vector3()},
    glassRodVisible:{value:1},glassBottleVisible:{value:1}
  };
  const glassShadowShader=`
    uniform mat4 glassCameraWorld;
    uniform vec3 glassBottleCentre,glassRodStart,glassRodEnd;
    uniform float glassRodVisible,glassBottleVisible;
    float glassTransmission(vec3 viewPoint,vec3 viewDirection,float lightDistance){
      vec3 p=(glassCameraWorld*vec4(viewPoint,1.0)).xyz;
      vec3 d=normalize(mat3(glassCameraWorld)*viewDirection);
      vec3 radii=vec3(.52,1.0,.52);
      vec3 q=(p-glassBottleCentre)/radii,rd=d/radii;
      float t=-dot(q,rd)/dot(rd,rd);
      float blur=.04+.025*max(t,0.0);
      float bottleMask=(1.0-smoothstep(.88-blur,1.0+blur,length(q+rd*t)))
        *step(.025,t)*step(t,lightDistance)*glassBottleVisible;
      vec3 axis=glassRodEnd-glassRodStart,w=p-glassRodStart;
      float aa=max(dot(axis,axis),.0001),da=dot(d,axis);
      float along=clamp((dot(w,axis)-dot(w,d)*da)/max(.0001,aa-da*da),0.0,1.0);
      vec3 closest=glassRodStart+axis*along;
      float rt=dot(closest-p,d);
      float rodDistance=length(p+d*max(0.0,rt)-closest);
      float penumbra=.035+.025*max(rt,0.0);
      float rodMask=(1.0-smoothstep(.055,.085+penumbra,rodDistance))
        *step(.025,rt)*step(rt,lightDistance)*glassRodVisible;
      return (1.0-.30*bottleMask)*(1.0-.24*rodMask);
    }
    // Pool of the overhead lamp: full light around the burner and jar, still
    // reaching the reagent cabinet, fading across the bench edge and far tiles.
    float lampPool(vec3 viewPoint){
      vec3 p=(glassCameraWorld*vec4(viewPoint,1.0)).xyz;
      float radial=1.0-smoothstep(4.0,10.5,length((p.xz-vec2(-2.4,-.4))*vec2(1.0,1.25)));
      float below=smoothstep(-3.2,-.05,p.y);
      return mix(.16,1.0,radial*mix(.35,1.0,below));
    }
    float softSolidOcclusion(vec3 p,vec3 d,float lightDistance,vec3 centre,vec3 radii){
      vec3 q=(p-centre)/radii,rd=d/radii;
      // Do not shade a receiver with its own coarse occlusion volume.
      if(dot(q,q)<1.10)return 0.0;
      float t=-dot(q,rd)/dot(rd,rd);
      if(t<.12||t>lightDistance)return 0.0;
      float edge=.05+.022*t;
      return 1.0-smoothstep(.90-edge,1.0+edge,length(q+rd*t));
    }
    float pointLightTransmission(vec3 viewPoint,vec3 viewDirection,float lightDistance){
      vec3 p=(glassCameraWorld*vec4(viewPoint,1.0)).xyz;
      vec3 d=normalize(mat3(glassCameraWorld)*viewDirection);
      // Soft occlusion proxies for opaque apparatus under the coloured light.
      // They complement the key-light shadow map without six cubemap passes.
      float contents=softSolidOcclusion(p,d,lightDistance,
        glassBottleCentre+vec3(0,-.46,0),vec3(.47,.47,.47));
      float cork=softSolidOcclusion(p,d,lightDistance,
        glassBottleCentre+vec3(0,.93,0),vec3(.36,.20,.36));
      float barrel=softSolidOcclusion(p,d,lightDistance,
        vec3(0,2.37,0),vec3(.25,.89,.25));
      float base=softSolidOcclusion(p,d,lightDistance,
        vec3(0,.19,0),vec3(1.09,.20,1.09));
      float opaque=max(max(contents,cork)*glassBottleVisible,max(barrel,base));
      return glassTransmission(viewPoint,viewDirection,lightDistance)*(1.0-.88*opaque);
    }
  `;
  function finishMaterial(mat){
    mat.onBeforeCompile=shader=>{
      // Normal variance filters reflections only. Feeding it into refraction
      // made the transmission mip level change with the curved end/rim normals.
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        vec3 normalDx=dFdx(normal),normalDy=dFdy(normal);
        float normalVariance=max(dot(normalDx,normalDx),dot(normalDy,normalDy));
        material.roughness=max(material.roughness,sqrt(roughnessFactor*roughnessFactor+min(.18,normalVariance*.75)));`);
      if(mat.transmission){
        // A flame has a finite emitting surface. Broaden its punctual specular
        // approximation on glass, without blurring the transmitted background.
        const lighting=THREE.ShaderChunk.lights_fragment_begin
          .replace('IncidentLight directLight;',
            'IncidentLight directLight;\nfloat glassReflectionRoughness=material.roughness;')
          .replace('getPointLightInfo( pointLight, geometryPosition, directLight );',
            `getPointLightInfo( pointLight, geometryPosition, directLight );
            material.roughness=max(material.roughness,0.30);`)
          .replace('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
            `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
            material.roughness=glassReflectionRoughness;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lighting);
        const transmission=THREE.ShaderChunk.transmission_fragment.replace(
          'n, v, material.roughness, material.diffuseColor',
          'n, v, roughnessFactor, material.diffuseColor');
        shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission);
        const sampling=THREE.ShaderChunk.transmission_pars_fragment.replace(
          'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );',
          `vec2 footprintX=dFdx(fragCoord)*transmissionSamplerSize;
          vec2 footprintY=dFdy(fragCoord)*transmissionSamplerSize;
          float footprint=max(dot(footprintX,footprintX),dot(footprintY,footprintY));
          float maxLod=floor(log2(max(transmissionSamplerSize.x,transmissionSamplerSize.y)));
          lod=clamp(max(lod,0.5*log2(max(1.0,footprint))),0.0,maxLod-1.0);
          vec2 border=vec2(0.5)/transmissionSamplerSize;
          return textureBicubic(transmissionSamplerMap,clamp(fragCoord,border,vec2(1.0)-border),lod);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_pars_fragment>',sampling);
      }
      if(!mat.transmission){
        Object.assign(shader.uniforms,glassShadowUniforms);
        shader.fragmentShader=glassShadowShader+shader.fragmentShader;
        const lighting=THREE.ShaderChunk.lights_fragment_begin
          .replace('getPointLightInfo( pointLight, geometryPosition, directLight );',
            'getPointLightInfo( pointLight, geometryPosition, directLight );\n// Only the coloured flame light (point light 1), and only when it reaches this fragment.\nif(UNROLLED_LOOP_INDEX==1&&dot(directLight.color,vec3(1.0))>0.0)directLight.color *= pointLightTransmission(geometryPosition,directLight.direction,length(pointLight.position-geometryPosition));')
          .replace('getDirectionalLightInfo( directionalLight, directLight );',
            'getDirectionalLightInfo( directionalLight, directLight );\n// Glass shadows for the key light only (directional 0); the faint rim light keeps none.\ndirectLight.color *= (UNROLLED_LOOP_INDEX==0?glassTransmission(geometryPosition,directLight.direction,100.0):1.0)*lampPool(geometryPosition);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lighting)
          .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          {
            float pool=mix(.42,1.0,lampPool(geometryPosition));
            reflectedLight.indirectDiffuse*=pool;reflectedLight.indirectSpecular*=pool;
          }`);
      }
    };
    mat.customProgramCacheKey=()=>mat.transmission?'stable-glass-transmission-v3':'soft-apparatus-shadows-v4';
    return track(mat);
  }
  const material=(color,metalness=0,roughness=.4)=>finishMaterial(new THREE.MeshStandardMaterial({color,metalness,roughness}));
  const physical=options=>finishMaterial(new THREE.MeshPhysicalMaterial(options));
  const steel=physical({color:0xb4b6b9,metalness:1,roughness:.30,anisotropy:.40,anisotropyRotation:Math.PI/2});
  const burnerSteel=physical({color:0xa4a6a8,metalness:1,roughness:.48,anisotropy:.18});
  const burnerBaseMetal=physical({color:0x898c90,metalness:.95,roughness:.66});
  const burnerCollarMetal=physical({color:0x96999c,metalness:1,roughness:.56,anisotropy:.12});
  burnerSteel.name='satin-grey-steel';burnerBaseMetal.name='matte-cast-grey-metal';burnerCollarMetal.name='satin-grey-collar';
  const brass=material(0xaf8439,.85,.40),black=material(0x101119,.2,.42);
  const rubber=physical({color:0xad4549,metalness:0,roughness:.76,ior:1.48,clearcoat:.025,clearcoatRoughness:.65});
  const salt=physical({color:0xecebe5,metalness:0,roughness:.96,specularIntensity:.18});
  const rodGlass=physical({color:0xf4faf8,metalness:0,roughness:.065,transmission:.97,
    thickness:.17,ior:1.47,attenuationColor:0xd5e6df,attenuationDistance:5});
  rodGlass.name='clear-glass-rod';
  // Jars resting in the cabinet: ten transmissive jars cost about 12 ms per frame
  // on an HD Graphics 400. This imitates what the transmissive glass shows there:
  // a clear centre, reflections added on top, denser and faintly green towards
  // the silhouette where the light crosses more glass. Jars keep this glass on
  // the bench too, so they look the same wherever they are.
  const shelfGlass=finishMaterial(new THREE.MeshStandardMaterial({color:0x000000,metalness:0,roughness:.065,
    transparent:true,depthWrite:false,blending:THREE.CustomBlending,
    blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor}));
  shelfGlass.name='shelf-jar-glass';
  {
    const patchLighting=shelfGlass.onBeforeCompile;
    shelfGlass.onBeforeCompile=(shader,renderer)=>{
      patchLighting(shader,renderer);
      shader.vertexShader=`varying vec3 vJarPosition,vJarUp;
`+shader.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        vJarPosition=position;vJarUp=normalize(normalMatrix*vec3(0.0,1.0,0.0));`);
      shader.fragmentShader=`varying vec3 vJarPosition,vJarUp;
`+shader.fragmentShader
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        // Moulded glass is never perfectly true: faint horizontal waves bend
        // the reflections, irregular round the jar rather than ruled lines.
        float jarWave=sin(vJarPosition.y*43.0+vJarPosition.x*4.0)*.6+sin(vJarPosition.y*19.0-vJarPosition.z*6.0)*.4;
        normal=normalize(normal+vJarUp*jarWave*.045);`)
        .replace('#include <opaque_fragment>',`
        float jarFacing=saturate(dot(normal,geometryViewDir));
        float glassEdge=pow(1.0-jarFacing,2.5);
        // Schlick reflectance of glass, n=1.5: reflections strengthen at grazing angles.
        float jarFresnel=.04+.96*pow(1.0-jarFacing,5.0);
        // Thicker glass at the base, shoulder and rolled rim: denser and greener.
        float jarY=vJarPosition.y;
        float jarThick=(1.0-smoothstep(.10,.20,jarY))+smoothstep(1.42,1.60,jarY)*.55+smoothstep(1.84,1.90,jarY)*.35;
        vec3 jarBody=vec3(.010,.017,.014)*(glassEdge+jarThick*.55);
        gl_FragColor=vec4(outgoingLight*(.75+.6*jarFresnel)+jarBody,clamp(mix(.03,.40,glassEdge)+jarThick*.07,0.0,.55));`);
    };
    shelfGlass.customProgramCacheKey=()=>'fresnel-shelf-glass-v2';
  }
  function mesh(geometry,mat,parent=scene,position=[0,0,0],pick=null) {
    const object=new THREE.Mesh(track(geometry),mat);object.position.set(...position);
    object.castShadow=!mat.transparent&&!mat.transmission;object.receiveShadow=true;parent.add(object);
    if(!mat.transparent&&!mat.transmission&&mat.visible!==false)object.layers.enable(1);
    // Glass gets its own depth layer: the flame behind it is seen through it.
    if(mat.transmission)object.layers.enable(2);
    if(pick){object.userData.pick=pick;pickables.push(object);}
    return object;
  }
  function lathe(profile,mat,parent=scene,position=[0,0,0],pick=null) {
    return mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),80),mat,parent,position,pick);
  }
  function cylinder(radius,height,mat,parent=scene,position=[0,0,0],pick=null) {
    return mesh(new THREE.CylinderGeometry(radius,radius,height,64),mat,parent,position,pick);
  }
  function tube(points,radius,mat,parent=scene,pick=null) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),64,radius,12,false),mat,parent,[0,0,0],pick);
  }
  function beveledBoxGeometry(width,height,depth,bevel) {
    const shape=new THREE.Shape(),x=width/2-bevel,y=height/2-bevel;
    shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:depth-2*bevel,steps:1,
      bevelEnabled:true,bevelSegments:3,bevelSize:bevel,bevelThickness:bevel});
    geometry.translate(0,0,-depth/2+bevel);
    // Physical dimensions map to each face rather than repeating a photo at
    // every world unit, including the long wooden drawer fronts.
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      if(nz>=nx&&nz>=ny)uv.setXY(i,p.getX(i)/width+.5,p.getY(i)/height+.5);
      else if(ny>=nx)uv.setXY(i,p.getX(i)/width+.5,p.getZ(i)/depth+.5);
      else uv.setXY(i,p.getZ(i)/depth+.5,p.getY(i)/height+.5);
    }
    return geometry;
  }
  function beveledBox(width,height,depth,bevel,mat,parent,position) {
    return mesh(beveledBoxGeometry(width,height,depth,bevel),mat,parent,position);
  }
  function curveTube(curves,radius,mat,parent,name) {
    const path=new THREE.CurvePath();
    for(const points of curves)path.add(new THREE.CubicBezierCurve3(...points.map(p=>new THREE.Vector3(...p))));
    const object=mesh(new THREE.TubeGeometry(path,192,radius,24,false),mat,parent);
    object.name=name;return object;
  }
  function makeAirCollar(parent) {
    // Solid collar drilled across its full diameter: a continuous cylindrical
    // bore wall joins both openings, with no hollow sleeve exposed inside.
    const outer=.29,hole=.137,center=1.25,bottom=.99,top=1.49;
    const positions=[],normals=[],uvs=[];
    const point=(x,y,z,n,u=0,v=0)=>({p:[x,y,z],n,uv:[u,v]});
    function quad(a,b,c,d){
      const ab=new THREE.Vector3(...b.p).sub(new THREE.Vector3(...a.p));
      const ac=new THREE.Vector3(...c.p).sub(new THREE.Vector3(...a.p));
      const normal=new THREE.Vector3(...a.n).add(new THREE.Vector3(...b.n)).add(new THREE.Vector3(...c.n));
      const vertices=ab.cross(ac).dot(normal)>=0?[a,b,c,a,c,d]:[a,c,b,a,d,c];
      for(const vertex of vertices){positions.push(...vertex.p);normals.push(...vertex.n);uvs.push(...vertex.uv);}
    }
    for(const radius of [outer]){
      const sign=radius===outer?1:-1;
      const angles=new Set(Array.from({length:257},(_,i)=>i*Math.PI*2/256));
      for(let i=0;i<=128;i++){
        const a=Math.asin(hole*Math.cos(i*Math.PI*2/128)/radius);
        angles.add((a+Math.PI*2)%(Math.PI*2));angles.add(Math.PI-a);
      }
      const sorted=[...angles].sort((a,b)=>a-b);
      const column=angle=>{
        const x=radius*Math.sin(angle),z=radius*Math.cos(angle);
        const halfHeight=Math.sqrt(Math.max(0,hole*hole-x*x));
        const n=[sign*Math.sin(angle),0,sign*Math.cos(angle)];
        return [bottom,center-halfHeight,center+halfHeight,top].map(y=>point(x,y,z,n,angle/(Math.PI*2),(y-bottom)/(top-bottom)));
      };
      for(let i=0;i<sorted.length-1;i++){
        const a=column(sorted[i]),b=column(sorted[i+1]);
        quad(a[0],b[0],b[1],a[1]);quad(a[2],b[2],b[3],a[3]);
      }
    }
    for(let i=0;i<128;i++){
      const edge=(angle,side)=>{
        const x=hole*Math.cos(angle),y=center+hole*Math.sin(angle);
        return point(x,y,side*Math.sqrt(outer*outer-x*x),[-Math.cos(angle),-Math.sin(angle),0],angle/(Math.PI*2),(side+1)/2);
      };
      const a=i*Math.PI*2/128,b=(i+1)*Math.PI*2/128;
      quad(edge(a,1),edge(b,1),edge(b,-1),edge(a,-1));
    }
    for(const y of [bottom,top])for(let i=0;i<256;i++){
      const edge=(angle,radius)=>point(radius*Math.sin(angle),y,radius*Math.cos(angle),[0,y===top?1:-1,0]);
      const a=i*Math.PI*2/256,b=(i+1)*Math.PI*2/256;
      quad(edge(a,outer),edge(b,outer),edge(b,0),edge(a,0));
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const collar=mesh(geometry,burnerCollarMetal,parent);collar.name='vented-air-collar';
    return collar;
  }
  // Reconstructed from reagent_backgrounds/Na.png, now finished in dark wood:
  // drawers, charcoal tile wall and a yellow gas flange. Finish variation is
  // material-specific: photographic wood grain, satin steel and glazed ceramic.
  // Large, mostly peripheral surfaces use the single-lobe standard model: a
  // clearcoat lobe across most of the screen cost more than it showed.
  const worktop=material(0x4b2b1b,0,.62);
  const edgeSteel=physical({color:0x7e8287,metalness:1,roughness:.3,anisotropy:.4});
  const oak=material(0x3b2419,0,.82);
  const drawerOak=material(0x4c3021,0,.74);
  const woodTrim=material(0x301e14,0,.78);
  const join=material(0x211810,0,.72);
  const cabinetSide=material(0x3d2519,0,.76),cabinetShelf=material(0x47301f,0,.72);
  // Charcoal glaze: the wall recedes so the flame reads against a dark ground.
  const tileMaterial=material(0x45484c,0,.36);
  const grout=material(0x1f2023,0,1);
  // Build filtered material maps once, before shader warmup. Roughness remains
  // near its existing value; fine detail must not become sparkling highlights.
  function surfaceTexture(name,{finish=false,white=0,repeat=[1,1]}={}){
    const source=textureImages[name];
    if(!source?.naturalWidth)return null;
    const surface=document.createElement('canvas');
    surface.width=finish?512:source.naturalWidth;
    surface.height=finish?512:source.naturalHeight;
    const context=surface.getContext('2d');
    if(finish)context.filter='grayscale(1) contrast(0.25) brightness(1.75)';
    context.drawImage(source,0,0,surface.width,surface.height);
    context.filter='none';
    if(white){context.fillStyle=`rgba(255,255,255,${white})`;context.fillRect(0,0,surface.width,surface.height);}
    const map=track(new THREE.CanvasTexture(surface));
    map.name=`${name}-${finish?'roughness':'albedo'}`;
    if(!finish)map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.MirroredRepeatWrapping;map.repeat.set(...repeat);
    return map;
  }
  const metalFinish=surfaceTexture('metal',{finish:true,repeat:[2,1]});
  for(const mat of [burnerSteel,burnerBaseMetal,burnerCollarMetal,brass,edgeSteel])mat.roughnessMap=metalFinish;
  rubber.roughnessMap=surfaceTexture('rubber',{finish:true,repeat:[4,1]});
  salt.map=surfaceTexture('salt',{white:.50,repeat:[2,1]});
  const beadSalt=salt.clone();beadSalt.name='bead-salt';finishMaterial(beadSalt);
  tileMaterial.map=surfaceTexture('ceramic',{white:.82});
  tileMaterial.roughnessMap=surfaceTexture('ceramic',{finish:true});
  // A dedicated, evenly lit albedo replaces the stretched drawer-photo strip.
  // Surface maps share image storage; UV windows follow the grain of each part.
  const woodSource=textureImages.wood;
  if(woodSource?.naturalWidth){
    const albedo=track(new THREE.Texture(woodSource));
    albedo.colorSpace=THREE.SRGBColorSpace;albedo.needsUpdate=true;
    const finishCanvas=document.createElement('canvas');finishCanvas.width=512;finishCanvas.height=256;
    const finishContext=finishCanvas.getContext('2d');
    finishContext.filter='grayscale(1) contrast(0.12) brightness(1.9)';
    finishContext.drawImage(woodSource,0,0,512,256);
    const finish=track(new THREE.CanvasTexture(finishCanvas));
    const surfaceMap=(source,repeat,offset,rotation)=>{
      const map=track(source.clone());
      map.wrapS=map.wrapT=THREE.MirroredRepeatWrapping;
      map.repeat.set(...repeat);map.offset.set(...offset);map.center.set(.5,.5);
      map.rotation=rotation;map.needsUpdate=true;return map;
    };
    for(const [wood,repeat,offset,rotation,tint] of [
      [worktop,[1,1],[0,0],0,0xffffff],
      [drawerOak,[.48,.17],[.17,.32],0,0xf4ece1],
      [oak,[.34,.88],[.41,.12],Math.PI/2,0xe0d5c7],
      [woodTrim,[.8,.10],[.05,.73],0,0xe7d8c6],
      [cabinetSide,[.30,.95],[.22,.04],Math.PI/2,0xe6dacb],
      [cabinetShelf,[.62,.12],[.31,.55],0,0xeee3d5]
    ]){
      wood.map=surfaceMap(albedo,repeat,offset,rotation);
      wood.roughnessMap=surfaceMap(finish,repeat,offset,rotation);
      wood.color.setHex(tint);
    }
  }
  const gasYellow=material(0xffd653,0,.80);
  gasYellow.roughnessMap=tileMaterial.roughnessMap;
  const bench=new THREE.Group();bench.name='laboratory-bench';scene.add(bench);
  beveledBox(18,.32,7,.055,worktop,bench,[0,-.16,.65]);
  // Local ambient occlusion at the two fixed bases supplements the directional
  // shadow. It stays on the bench and never follows the camera or moving rod.
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;
  const contactContext=contactCanvas.getContext('2d');
  const contactGradient=contactContext.createRadialGradient(64,64,0,64,64,64);
  contactGradient.addColorStop(0,'rgba(18,12,8,.24)');
  contactGradient.addColorStop(.70,'rgba(18,12,8,.18)');
  contactGradient.addColorStop(1,'rgba(18,12,8,0)');
  contactContext.fillStyle=contactGradient;contactContext.fillRect(0,0,128,128);
  const contactTexture=track(new THREE.CanvasTexture(contactCanvas));contactTexture.colorSpace=THREE.SRGBColorSpace;
  const contactMaterial=track(new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false}));
  const burnerContact=mesh(new THREE.PlaneGeometry(2.34,2.34),contactMaterial,bench,[0,.002,0]);
  burnerContact.name='base-contact-occlusion';burnerContact.rotation.x=-Math.PI/2;burnerContact.castShadow=false;
  // The jar's contact darkening follows it and fades as the jar is lifted.
  const jarContactMaterial=track(contactMaterial.clone());
  const jarContact=mesh(new THREE.PlaneGeometry(1.24,1.24),jarContactMaterial,bench,[0,.003,0]);
  jarContact.name='jar-contact-occlusion';jarContact.rotation.x=-Math.PI/2;jarContact.castShadow=false;jarContact.visible=false;
  beveledBox(18,.42,.15,.025,woodTrim,bench,[0,-.39,4.10]);
  beveledBox(17.64,3.16,6.52,.06,oak,bench,[0,-1.98,.54]);
  beveledBox(17.12,.22,6.12,.025,black,bench,[0,-3.66,.48]);
  const legGeometry=beveledBoxGeometry(.62,3.20,.62,.045);
  for(const x of [-8.12,8.12])for(const z of [-2.25,3.32]){
    const leg=mesh(legGeometry,oak,bench,[x,-5.15,z]);leg.name='wooden-table-leg';
    beveledBox(.68,.16,.68,.025,woodTrim,bench,[x,-6.64,z]);
  }
  for(const z of [-2.25,3.32])beveledBox(16.24,.24,.28,.025,woodTrim,bench,[0,-5.94,z]);
  for(const x of [-8.12,8.12])beveledBox(.28,.24,5.57,.025,woodTrim,bench,[x,-5.94,.535]);
  for(const x of [-4.31,4.31]) {
    for(const y of [-1.34,-2.84]) {
      const height=1.35;
      mesh(new THREE.BoxGeometry(8.46,height+.065,.035),join,bench,[x,y,3.815]);
      beveledBox(8.35,height,.15,.035,woodTrim,bench,[x,y,3.885]);
      const front=beveledBox(8.08,height-.20,.055,.02,drawerOak,bench,[x,y,3.978]);
      front.name='drawer-front';
      const knob=lathe([[0,0],[.09,0],[.10,.06],[.10,.12],[.17,.14],[.21,.18],
        [.22,.22],[.20,.27],[.14,.30],[0,.31]],drawerOak,bench,[x,y,4.005]);
      knob.name='wooden-drawer-knob';knob.rotation.x=Math.PI/2;
    }
  }
  // The wall is a finite solid panel; its front surface is behind all apparatus.
  const wallFront=-2.85;
  const wall=new THREE.Group();wall.name='tiled-laboratory-wall';scene.add(wall);
  const columns=9,rows=5,tileWidth=2,tileHeight=1.75;
  const wallHeight=rows*tileHeight;
  mesh(new THREE.BoxGeometry(18,wallHeight,.20),grout,wall,[0,-.08+wallHeight/2,wallFront-.13]);
  const tiles=new THREE.InstancedMesh(track(beveledBoxGeometry(tileWidth-.035,tileHeight-.035,.06,.012)),tileMaterial,columns*rows);
  const tileTransform=new THREE.Matrix4();
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    tileTransform.makeTranslation(-9+(col+.5)*tileWidth,-.08+(row+.5)*tileHeight,wallFront-.0075);
    tiles.setMatrixAt(row*columns+col,tileTransform);
    const shade=.93+.10*(.5+.5*Math.sin(row*13.7+col*7.9));
    tiles.setColorAt(row*columns+col,new THREE.Color().setRGB(shade,shade,shade));
  }
  tiles.instanceMatrix.needsUpdate=true;tiles.castShadow=true;tiles.receiveShadow=true;tiles.layers.enable(1);wall.add(tiles);
  const gasFitting=new THREE.Group();gasFitting.name='wall-gas-connection';scene.add(gasFitting);
  const flange=cylinder(.45,.10,gasYellow,gasFitting,[2.82,4.05,wallFront+.065]);flange.rotation.x=Math.PI/2;
  flange.name='matte-yellow-gas-flange';
  const flangeRing=cylinder(.245,.07,brass,gasFitting,[2.82,4.05,wallFront+.14]);flangeRing.rotation.x=Math.PI/2;
  const pipeSeat=cylinder(.205,.16,steel,gasFitting,[2.82,4.05,wallFront+.23]);pipeSeat.rotation.x=Math.PI/2;
  // The elbow stays in one vertical plane: it comes straight out of the wall
  // and turns down, without the previous sideways bend.
  curveTube([
    [[2.82,4.05,wallFront+.24],[2.82,4.05,-2.50],[2.82,4.05,-2.36],[2.82,4.05,-2.23]],
    [[2.82,4.05,-2.23],[2.82,4.05,-2.09193],[2.82,3.93807,-1.98],[2.82,3.80,-1.98]],
    [[2.82,3.80,-1.98],[2.82,3.69,-1.98],[2.82,3.58,-1.98],[2.82,3.48,-1.98]]
  ],.19,steel,gasFitting,'gas-outlet');
  cylinder(.205,.12,edgeSteel,gasFitting,[2.82,3.50,-1.98]);
  cylinder(.17,.18,steel,gasFitting,[2.82,3.40,-1.98]);
  // Floor remains below the cabinet, leaving the worktop as the contact surface.
  const floor=mesh(new THREE.PlaneGeometry(100,100),material(0x141421,0,.92));
  floor.rotation.x=-Math.PI/2;floor.position.y=-6.79;floor.castShadow=false;
  const burner=new THREE.Group();burner.name='bunsen-burner';scene.add(burner);
  burner.rotation.y=-25*Math.PI/180;
  const baseProfile=new THREE.Path();
  baseProfile.moveTo(0,.035);baseProfile.lineTo(.96,.035);
  baseProfile.quadraticCurveTo(1.075,.035,1.09,.11);baseProfile.lineTo(1.09,.17);
  baseProfile.quadraticCurveTo(1.075,.25,.98,.265);baseProfile.lineTo(.58,.265);
  baseProfile.bezierCurveTo(.46,.265,.39,.30,.36,.40);baseProfile.lineTo(.335,.52);
  baseProfile.quadraticCurveTo(.32,.565,.28,.565);baseProfile.lineTo(0,.565);baseProfile.closePath();
  const base=lathe(baseProfile.getPoints(12).map(p=>[p.x,p.y]),burnerBaseMetal,burner);
  base.name='rounded-weighted-burner-base';
  lathe([[.29,.54],[.32,.58],[.32,.91],[.30,.95],[.27,.98]],burnerCollarMetal,burner);
  makeAirCollar(burner);
  // Continuous metal wall and an open, chamfered lip down into the barrel.
  // No cap or black disk closes the visible bore.
  const barrel=lathe([[.203,1.47],[.205,1.53],[.205,2.72],[.23,2.76],[.275,2.80],
    [.28,2.82],[.28,3.235],[.272,3.26],[.239,3.26],[.23,3.248],[.23,2.83],
    [.177,2.77],[.164,2.72],[.164,1.5],[.17,1.47],[.203,1.47]],burnerSteel,burner);
  barrel.name='open-burner-barrel';
  // Hollow steel nipple, exposed helical thread and a rubber mouth stretched
  // over its outer end. The hose surrounds the connector instead of meeting a cap.
  const connector=lathe([[.075,.27],[.125,.27],[.125,.43],[.15,.45],[.15,.51],
    [.119,.53],[.119,.98],[.105,1.03],[.075,1.03],[.075,.27]],burnerSteel,burner,[0,.88,0]);
  connector.rotation.z=-Math.PI/2;connector.name='threaded-hose-connector';
  class ThreadCurve extends THREE.Curve {
    getPoint(t,target=new THREE.Vector3()){
      const angle=t*Math.PI*2*6;
      return target.set(.54+t*.36,.88+.122*Math.cos(angle),.122*Math.sin(angle));
    }
  }
  const thread=mesh(new THREE.TubeGeometry(new ThreadCurve(),144,.012,6,false),burnerCollarMetal,burner);
  thread.name='connector-helical-thread';
  const hoseMouth=lathe([[.136,.52],[.163,.52],[.168,.56],[.155,.95],[.14,1.10],
    [.107,1.10],[.136,.95],[.136,.52]],rubber,burner,[0,.88,0]);
  hoseMouth.rotation.z=-Math.PI/2;hoseMouth.name='rubber-hose-mouth';
  // C1-continuous bends: a gently descending feed, a broad loop resting on the
  // tabletop, then a gradual rise into the vertical wall outlet.
  const rotatedInlet=x=>new THREE.Vector3(x,.88,0).applyAxisAngle(new THREE.Vector3(0,1,0),burner.rotation.y).toArray();
  curveTube([
    [rotatedInlet(1.10),rotatedInlet(1.70),[1.95,.145,1.15],[2.80,.145,1.22]],
    [[2.80,.145,1.22],[3.65,.145,1.29],[4.75,.145,.65],[4.72,.145,-.18]],
    [[4.72,.145,-.18],[4.69,.145,-1.01],[3.80,.145,-1.32],[3.38,.45,-1.65]],
    [[3.38,.45,-1.65],[2.96,.755,-1.98],[2.82,2.25,-1.98],[2.82,3.38,-1.98]]
  ],.14,rubber,scene,'gas-hose');
  // Reagent cabinet: open walnut shelving against the wall at the left end of
  // the bench, one stoppered jar per published element. A brass rail keeps the
  // jars on each shelf, so a jar is lifted over its rail before sliding out.
  const corkTexture=surfaceTexture('cork',{repeat:[2,1]});
  const corkMaterial=physical({color:corkTexture?0xffffff:0xb58b58,map:corkTexture,
    metalness:0,roughness:.96});
  corkMaterial.name='natural-matte-cork';
  const CABINET_X=-6.3,CABINET_BACK=wallFront+.02,CABINET_FRONT=CABINET_BACK+1.36;
  const CABINET_Z=(CABINET_BACK+CABINET_FRONT)/2,CABINET_TOP=8;
  const SHELVES=[5.46,2.86,.26],SLOT_Z=CABINET_BACK+.71;
  const RAIL_HEIGHT=.22,JAR_LIFT=.30,JAR_OUT_Z=CABINET_FRONT+.67;
  const TABLE_SPOT=new THREE.Vector3(-2.55,0,-1.05),JAR_CENTRE_Y=1;
  const cabinet=new THREE.Group();cabinet.name='reagent-cabinet';scene.add(cabinet);
  for(const side of [-1,1]){
    const panel=beveledBox(.1,CABINET_TOP,1.36,.02,cabinetSide,cabinet,[CABINET_X+side*2.3,CABINET_TOP/2,CABINET_Z]);
    panel.name='cabinet-side';
  }
  beveledBox(4.5,CABINET_TOP,.04,.008,cabinetSide,cabinet,[CABINET_X,CABINET_TOP/2,CABINET_BACK+.02]);
  beveledBox(4.86,.14,1.46,.03,cabinetShelf,cabinet,[CABINET_X,CABINET_TOP+.07,CABINET_Z+.03]);
  beveledBox(4.98,.06,1.52,.02,woodTrim,cabinet,[CABINET_X,CABINET_TOP+.17,CABINET_Z+.04]);
  beveledBox(4.5,.19,1.24,.02,woodTrim,cabinet,[CABINET_X,.095,CABINET_Z-.05]);
  for(const y of SHELVES){
    const shelf=beveledBox(4.5,.07,1.3,.012,cabinetShelf,cabinet,[CABINET_X,y-.035,CABINET_Z-.01]);
    shelf.name='cabinet-shelf';
    beveledBox(4.5,.14,.04,.01,woodTrim,cabinet,[CABINET_X,y-.07,CABINET_FRONT-.02]);
    const rail=cylinder(.022,4.5,brass,cabinet,[CABINET_X,y+RAIL_HEIGHT,CABINET_FRONT-.09]);
    rail.rotation.z=Math.PI/2;rail.name='brass-shelf-rail';
    for(const side of [-1,1]){
      const ferrule=cylinder(.042,.06,brass,cabinet,[CABINET_X+side*2.22,y+RAIL_HEIGHT,CABINET_FRONT-.09]);
      ferrule.rotation.z=Math.PI/2;
    }
  }
  // Wide-mouth reagent jar, 1 unit across: thick glass base, rounded shoulder,
  // rolled rim and a tapered cork. All jars share these geometries.
  const profile=points=>track(new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),80));
  const jarGlassGeometry=profile([[0,.02],[.44,.02],[.49,.05],[.5,.13],[.5,1.4],[.485,1.5],[.44,1.58],
    [.36,1.64],[.33,1.68],[.33,1.86],[.35,1.875],[.35,1.92],[.31,1.92],[.28,1.88],[.28,1.7],
    [.36,1.62],[.43,1.55],[.465,1.47],[.465,.15],[.43,.1],[0,.1]]);
  // Reagent powder: a solid filling the jar up to an uneven surface of its own,
  // with a poured slope, heaps and spatula hollows, and lumpy grain. Seeded by
  // the element symbol, so each jar keeps the same fill on every load.
  const POWDER_RADIUS=.46,POWDER_FLOOR=.1,POWDER_TILE=1.45;
  function seededRandom(text){
    let seed=2166136261;
    for(const char of text)seed=Math.imul(seed^char.charCodeAt(0),16777619);
    return()=>{
      seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);
      t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;
    };
  }
  function valueNoise(random){
    const perm=Uint8Array.from({length:256},(_,i)=>i);
    for(let i=255;i>0;i--){const j=Math.floor(random()*(i+1));[perm[i],perm[j]]=[perm[j],perm[i]];}
    const values=Float32Array.from({length:256},()=>random()*2-1);
    const at=(i,j)=>values[perm[(perm[i&255]+j)&255]],fade=t=>t*t*(3-2*t);
    return(x,z)=>{
      const i=Math.floor(x),j=Math.floor(z),u=fade(x-i),v=fade(z-j);
      const a=at(i,j)+(at(i+1,j)-at(i,j))*u,b=at(i,j+1)+(at(i+1,j+1)-at(i,j+1))*u;
      return a+(b-a)*v;
    };
  }
  function powderGeometry(symbol){
    const random=seededRandom(`powder-${symbol}`),noise=valueNoise(random);
    const range=(a,b)=>a+(b-a)*random();
    const level=range(.5,1.3),tilt=range(.04,.3),tiltAngle=range(0,Math.PI*2);
    // Heaps left by pouring (positive) and hollows left by a spatula (negative).
    const blobs=Array.from({length:1+Math.floor(random()*3)},()=>{
      const r=Math.sqrt(random())*.32,a=random()*Math.PI*2;
      return{x:r*Math.cos(a),z:r*Math.sin(a),width:range(.1,.24),height:range(-.15,.16)};
    });
    const lumps=range(.022,.05);
    const base=(x,z)=>{
      let y=level+tilt*(x*Math.cos(tiltAngle)+z*Math.sin(tiltAngle));
      for(const blob of blobs)y+=blob.height*Math.exp(-((x-blob.x)**2+(z-blob.z)**2)/(blob.width*blob.width));
      return y;
    };
    const grain=(x,z)=>lumps*(noise(x*4.5,z*4.5)+.45*noise(x*11+17,z*11-5))+.008*noise(x*29-3,z*29+8);
    const surface=(x,z)=>THREE.MathUtils.clamp(base(x,z)+grain(x,z),.3,1.36);
    const RINGS=22,SEGMENTS=96,positions=[],uvs=[],index=[],shades=[];
    const vertex=(x,y,z,u,v)=>{positions.push(x,y,z);uvs.push(u,v);return positions.length/3-1;};
    const topUv=(x,y,z)=>vertex(x,y,z,(x+POWDER_RADIUS)/(2*POWDER_TILE),(z+POWDER_RADIUS)/POWDER_TILE);
    // Each triangle is wound to face the given direction.
    const face=(a,b,c,nx,ny,nz)=>{
      const p=i=>positions.slice(i*3,i*3+3),[ax,ay,az]=p(a),[bx,by,bz]=p(b),[cx,cy,cz]=p(c);
      const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
      const facing=(uy*vz-uz*vy)*nx+(uz*vx-ux*vz)*ny+(ux*vy-uy*vx)*nz;
      index.push(...(facing<0?[a,c,b]:[a,b,c]));
    };
    const angle=s=>s/SEGMENTS*Math.PI*2;
    const centre=topUv(0,surface(0,0),0),rings=[];
    for(let i=1;i<=RINGS;i++){
      const r=POWDER_RADIUS*i/RINGS;
      rings.push(Array.from({length:SEGMENTS},(_,s)=>{
        const x=r*Math.cos(angle(s)),z=r*Math.sin(angle(s));
        return topUv(x,surface(x,z),z);
      }));
    }
    for(let s=0;s<SEGMENTS;s++){
      const n=(s+1)%SEGMENTS;
      face(centre,rings[0][s],rings[0][n],0,1,0);
      for(let i=1;i<RINGS;i++){
        const inner=rings[i-1],outer=rings[i];
        face(inner[s],outer[s],outer[n],0,1,0);face(inner[s],outer[n],inner[n],0,1,0);
      }
    }
    const topCount=positions.length/3;
    // Wall pressed against the glass, with its own vertices for a crisp edge.
    const rim=rings[RINGS-1],wallTop=[],wallBottom=[];
    for(let s=0;s<=SEGMENTS;s++){
      const k=s%SEGMENTS,x=positions[rim[k]*3],y=positions[rim[k]*3+1],z=positions[rim[k]*3+2];
      const u=s/SEGMENTS;
      wallTop.push(vertex(x,y,z,u,y/POWDER_TILE));wallBottom.push(vertex(x,POWDER_FLOOR,z,u,POWDER_FLOOR/POWDER_TILE));
    }
    for(let s=0;s<SEGMENTS;s++){
      const x=Math.cos(angle(s+.5)),z=Math.sin(angle(s+.5));
      face(wallBottom[s],wallBottom[s+1],wallTop[s+1],x,0,z);face(wallBottom[s],wallTop[s+1],wallTop[s],x,0,z);
    }
    const floorCentre=vertex(0,POWDER_FLOOR,0,.5,.5);
    for(let s=0;s<SEGMENTS;s++)face(floorCentre,wallBottom[s],wallBottom[s+1],0,-1,0);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(index);geometry.computeVertexNormals();
    // Baked shading: crevices and steep flanks of the lumps darken slightly;
    // against the glass the packed powder shows faint settling bands.
    const normals=geometry.attributes.normal.array;
    for(let i=0;i<positions.length/3;i++){
      const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
      let shade;
      if(i<topCount){
        shade=1-.32*(1-normals[i*3+1])+1.6*Math.min(0,grain(x,z));
      }else{
        const a=Math.atan2(z,x);
        shade=.9+.05*noise(a*6+40,y*22)+.03*noise(a*25,y*60-9);
      }
      shade=THREE.MathUtils.clamp(shade,.68,1);
      shades.push(shade,shade,shade);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));
    return geometry;
  }
  const jarCorkGeometry=profile([[0,1.74],[.27,1.74],[.28,1.76],[.31,1.88],[.345,2.1],[.34,2.12],[0,2.12]]);
  const jarLabelGeometry=track(new THREE.CylinderGeometry(.505,.505,.6,48,1,true,-.95,1.9));
  const subscript=text=>text.replace(/\d/g,digit=>'₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);
  function paintLabel(context,element){
    const width=context.canvas.width,height=context.canvas.height;
    context.fillStyle='#e5d8bd';context.fillRect(0,0,width,height);
    if(textureImages.paper?.naturalWidth){
      context.drawImage(textureImages.paper,0,0,width,height);
      // Keep fibre contrast subordinate to the reagent name and formula.
      context.fillStyle='rgba(245,235,214,.25)';context.fillRect(0,0,width,height);
    }
    context.strokeStyle='#8d887a';context.lineWidth=3;context.strokeRect(14,14,width-28,height-28);
    context.lineWidth=1;context.strokeRect(21,21,width-42,height-42);
    context.fillStyle='#24272a';context.textAlign='center';
    const name=element.reagentName.toLocaleUpperCase('it'),parts=name.split(/ DI /);
    const lines=parts.length===2?[parts[1],parts[0]]:name.split(/\s+/,2);
    const write=(text,size,y)=>{
      context.font=`${size}px Georgia, serif`;
      const textWidth=context.measureText(text).width;
      if(textWidth>width-72)context.font=`${Math.floor(size*(width-72)/textWidth)}px Georgia, serif`;
      context.fillText(text,width/2,y);
    };
    write(lines[0]||element.name.toLocaleUpperCase('it'),56,88);
    write(lines[1]||'',56,156);
    write(subscript(element.reagentFormula),84,262);
  }
  function canvasMaterial(width,height,paint){
    const surface=document.createElement('canvas');surface.width=width;surface.height=height;
    paint(surface.getContext('2d'));
    const map=track(new THREE.CanvasTexture(surface));map.colorSpace=THREE.SRGBColorSpace;
    return finishMaterial(new THREE.MeshStandardMaterial({map,roughness:.94,side:THREE.DoubleSide}));
  }
  const jars=new Map();
  const reagents=elements.filter(element=>element?.symbol&&element.reagentName&&element.reagentFormula);
  const slotColumns=Math.max(4,Math.ceil(reagents.length/SHELVES.length)),pitch=4.4/slotColumns;
  reagents.forEach((element,index)=>{
    const row=Math.floor(index/slotColumns),column=index%slotColumns;
    const slot=new THREE.Vector3(CABINET_X+(column-(slotColumns-1)/2)*pitch,SHELVES[Math.min(row,SHELVES.length-1)],SLOT_Z);
    const group=new THREE.Group();group.name=`reagent-jar-${element.symbol}`;scene.add(group);
    const glass=mesh(jarGlassGeometry,rodGlass,group,[0,0,0],'jar');glass.material=shelfGlass;
    const contents=finishMaterial(salt.clone());contents.color.set(element.saltColor||'#e8e1d2');
    contents.vertexColors=true;contents.bumpMap=salt.map;contents.bumpScale=.6;
    const powder=mesh(powderGeometry(element.symbol),contents,group,[0,0,0],'jar');powder.name='reagent-powder';
    const cork=mesh(jarCorkGeometry,corkMaterial,group,[0,0,0],'jar');cork.name='tapered-cork-stopper';
    const label=mesh(jarLabelGeometry,canvasMaterial(512,320,context=>paintLabel(context,element)),group,[0,.78,0],'jar');
    label.castShadow=false;
    for(const object of group.children)object.userData.symbol=element.symbol;
    // Route: lift over the rail, slide out of the shelf, arc down to the bench
    // and set the jar down vertically on its spot beside the burner.
    const lifted=slot.clone().setY(slot.y+JAR_LIFT),out=lifted.clone().setZ(JAR_OUT_Z);
    const above=TABLE_SPOT.clone().setY(TABLE_SPOT.y+.32);
    const path=new THREE.CurvePath();
    path.add(new THREE.LineCurve3(slot.clone(),lifted));path.add(new THREE.LineCurve3(lifted,out.clone()));
    path.add(new THREE.CubicBezierCurve3(out,new THREE.Vector3(out.x+(above.x-out.x)*.25,out.y+.25,out.z+.45),
      above.clone().setY(above.y+.7),above.clone()));
    path.add(new THREE.LineCurve3(above,TABLE_SPOT.clone()));
    // The powder's centre vertex: where the rod's loop dips into the salt.
    jars.set(element.symbol,{symbol:element.symbol,group,glass,cork,slot,path,u:0,moving:false,
      surface:powder.geometry.attributes.position.getY(0)});
  });
  let reagentKey=null,currentReagent=null,tableJar=null,outgoingJar=null,jarTransitions=0,beadHeld=false;
  // The route is a chain of segments (lift, slide out, arc, set down). At constant
  // speed the jar turned each corner abruptly; easing within every segment as
  // well halves the speed at the joints. Symmetric, so the return trip matches.
  function routeEase(jar,u){
    const joints=jar.joints??=(()=>{const lengths=jar.path.getCurveLengths(),total=lengths[lengths.length-1];
      return [0,...lengths.map(length=>length/total)];})();
    let k=1;while(k<joints.length-1&&u>joints[k])k++;
    const start=joints[k-1],span=Math.max(1e-6,joints[k]-start),local=THREE.MathUtils.clamp((u-start)/span,0,1);
    return THREE.MathUtils.lerp(u,start+span*local*local*(3-2*local),.5);
  }
  function placeJar(jar,u){
    jar.u=THREE.MathUtils.clamp(u,0,1);
    jar.group.position.copy(jar.path.getPointAt(routeEase(jar,jar.u)));
    // A carried jar lags slightly behind the direction of travel.
    const carry=Math.sin(Math.PI*THREE.MathUtils.clamp((jar.u-.12)/.8,0,1));
    jar.group.rotation.z=carry*.05*Math.sign(TABLE_SPOT.x-jar.slot.x);
    depthDirty=true;
    // A carried jar refreshes the shadow map at a reduced rate (render()).
    if(jar.moving){jarShadowDirty=true;jarMovedAt=performance.now();}else shadowDirty=true;
  }
  function syncJarShadow(){
    const jar=tableJar??outgoingJar;
    glassShadowUniforms.glassBottleVisible.value=jar?1:0;
    jarContact.visible=false;
    if(!jar)return;
    const position=jar.group.position;
    glassShadowUniforms.glassBottleCentre.value.copy(position).setY(position.y+JAR_CENTRE_Y);
    const lift=position.y-TABLE_SPOT.y,offset=Math.hypot(position.x-TABLE_SPOT.x,position.z-TABLE_SPOT.z);
    if(lift<.5&&offset<.3){
      jarContact.visible=true;jarContact.position.set(position.x,.003,position.z);
      jarContactMaterial.opacity=1-lift/.5;
    }
  }
  function snapJars(){
    for(const jar of jars.values()){jar.moving=false;placeJar(jar,jar===tableJar?1:0);}
    outgoingJar=null;syncJarShadow();
  }
  snapJars();
  function setElement(element){
    const key=element?`${element.symbol}:${element.saltColor}`:'';
    if(key===reagentKey)return;
    reagentKey=key;currentReagent=element;depthDirty=true;shadowDirty=true;
    // The loop carries the element's salt, unless a dip is about to replace the
    // old one (holdBead). Deselecting leaves the last salt on the loop; before
    // the first selection the loop is clean.
    if(!element)beadHeld=false;
    else if(!beadHeld){beadSalt.color.set(element.saltColor||'#e8e1d2');bead.visible=true;}
    // While a transition runs the jars are carried by their own animations.
    if(jarTransitions)return;
    tableJar=element?jars.get(element.symbol)??null:null;snapJars();
  }
  const rod=new THREE.Group();rod.name='sample-rod';scene.add(rod);
  const wire=tube([[0,0,0],[.65,.015,0],[.95,.12,0],[1.4,.10,0],[1.65,0,0],[2.12,0,0]],.0135,steel,rod,'rod');
  wire.name='platinum-wire';
  // Remove the optical glass end at the wire joint entirely. A short opaque
  // matte sleeve has no specular/environment/refraction lighting path.
  const jointMaterial=track(new THREE.MeshLambertMaterial({color:0x78827e}));
  jointMaterial.name='nonreflective-wire-joint';
  const joint=lathe([[0,1.93],[.066,1.93],[.092,1.96],[.092,2.26],
    [.090,2.29],[0,2.29]],jointMaterial,rod,[0,0,0],'rod');
  joint.rotation.z=-Math.PI/2;joint.name='matte-wire-entry-sleeve';
  // The glass starts inside the sleeve and retains its original far endpoint.
  const handle=mesh(new THREE.CapsuleGeometry(.085,3.68,8,32),rodGlass,rod,[4.105,0,0],'rod');
  handle.name='glass-rod-handle';handle.rotation.z=Math.PI/2;
  // A fused bead: smooth at close zoom, slightly flattened along the wire.
  const bead=mesh(new THREE.IcosahedronGeometry(.088,4),beadSalt,rod,[0,0,0],'rod');
  bead.scale.set(1.12,.94,.94);bead.visible=false;
  // Resting on the bench, the rod pulses with a soft outline to show it can be
  // picked up. Each part gets an inflated back-face hull (its own geometry
  // pushed along the normals): only the rim around the silhouette shows, as
  // thin as the part allows (fine on the wire, wider on the glass handle) and
  // fading outwards.
  const glowUniforms={glowColor:{value:new THREE.Color(1,.80,.52)},glowStrength:{value:0}};
  function pickupOutline(part,inflate,uniforms){
    const outline=new THREE.Mesh(part.geometry,track(new THREE.ShaderMaterial({
      name:'pickup-outline',uniforms:{...uniforms,inflate:{value:inflate}},
      side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`uniform float inflate;varying vec3 vNormal,vView;
        void main(){
          vec4 viewPosition=modelViewMatrix*vec4(position+normal*inflate,1.0);
          vNormal=normalize(normalMatrix*normal);vView=-viewPosition.xyz;
          gl_Position=projectionMatrix*viewPosition;
        }`,
      fragmentShader:`uniform vec3 glowColor;uniform float glowStrength;varying vec3 vNormal,vView;
        void main(){
          // Facing the viewer near the part, grazing at the hull's outer edge.
          float facing=abs(dot(normalize(vNormal),normalize(vView)));
          gl_FragColor=vec4(glowColor*pow(facing,1.15)*glowStrength,1.0);
        }`
    })));
    outline.name=`${part.name}-pickup-outline`;outline.visible=false;outline.renderOrder=2;
    part.add(outline);return outline;
  }
  const rodGlow=[[wire,.024],[joint,.045],[handle,.05],[bead,.045]].map(([part,inflate])=>pickupOutline(part,inflate,glowUniforms));
  let rodGlowLevel=0,rodGlowTime=null;
  // The same outline, steady instead of pulsing, marks the jar under the
  // pointer: a shelf jar selects its element, the bench jar deselects it.
  for(const jar of jars.values()){
    jar.glowUniforms={glowColor:glowUniforms.glowColor,glowStrength:{value:0}};
    jar.glow=[[jar.glass,.05],[jar.cork,.04]].map(([part,inflate])=>pickupOutline(part,inflate,jar.glowUniforms));
    jar.glowLevel=0;
  }
  let hoveredJar=null;
  // Clickable: a jar at rest on its shelf or on the bench, while nothing else runs.
  const jarPickable=jar=>Boolean(jar)&&!jarTransitions&&!jar.moving&&(jar.u===0||jar===tableJar)&&canPickJar();
  // A larger invisible picking mesh makes the thin rod usable with mouse/touch.
  const pickMaterial=track(new THREE.MeshBasicMaterial({visible:false}));
  const rodPick=cylinder(.19,4.5,pickMaterial,rod,[3.85,0,0],'rod');rodPick.rotation.z=Math.PI/2;
  const flame=createVolumetricFlame(track);scene.add(flame.mesh);
  const depthTarget=track(new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),depthBuffer:true,stencilBuffer:false}));
  const glassDepthTarget=track(new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),depthBuffer:true,stencilBuffer:false}));
  const depthMaterial=track(new THREE.MeshDepthMaterial());
  // Stand-ins that let precompile() reach the depth pass programs.
  const depthProxies=[new THREE.Mesh(new THREE.BufferGeometry(),depthMaterial),new THREE.InstancedMesh(new THREE.BufferGeometry(),depthMaterial,1)];
  const viewport=new THREE.Vector2();
  const flameBox=new THREE.Box3(),boxCorner=new THREE.Vector3();
  function flameScissor(out){
    // Screen rectangle (drawing-buffer pixels) of the flame volume, plus a margin.
    flameBox.setFromObject(flame.volume);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let i=0;i<8;i++){
      boxCorner.set(i&1?flameBox.max.x:flameBox.min.x,i&2?flameBox.max.y:flameBox.min.y,i&4?flameBox.max.z:flameBox.min.z);
      boxCorner.applyMatrix4(camera.matrixWorldInverse);
      // A corner behind the camera: fall back to the whole target.
      if(boxCorner.z>-camera.near){out.set(0,0,viewport.x,viewport.y);return;}
      boxCorner.applyMatrix4(camera.projectionMatrix);
      minX=Math.min(minX,boxCorner.x);maxX=Math.max(maxX,boxCorner.x);
      minY=Math.min(minY,boxCorner.y);maxY=Math.max(maxY,boxCorner.y);
    }
    const x0=Math.max(0,Math.floor((minX*.5+.5)*viewport.x)-8),y0=Math.max(0,Math.floor((minY*.5+.5)*viewport.y)-8);
    const x1=Math.min(viewport.x,Math.ceil((maxX*.5+.5)*viewport.x)+8),y1=Math.min(viewport.y,Math.ceil((maxY*.5+.5)*viewport.y)+8);
    out.set(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0));
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const dragPlane=new THREE.Plane(),intersection=new THREE.Vector3();
  const pointers=new Map();
  function updateCamera() {
    depthDirty=true;
    camera.position.set(target.x+distance*Math.sin(azimuth)*Math.cos(elevation),
      target.y+distance*Math.sin(elevation),target.z+distance*Math.cos(azimuth)*Math.cos(elevation));
    camera.lookAt(target);camera.updateMatrixWorld();
    motion.setView(camera);
    // Cut away the wall from the rear so a full orbit never hides the apparatus.
    const wallVisible=camera.position.z>wallFront+.20;
    if(wall.visible!==wallVisible)shadowDirty=true;
    wall.visible=wallVisible;
  }
  const animations=new Map();
  const smoothstep=u=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};
  // Rod motions start and stop with zero speed and zero acceleration: the
  // cubic smoothstep's acceleration jumps at both ends, felt as a jolt.
  const smootherstep=u=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*u*(u*(u*6-15)+10);};
  // Joins a drag already under way: starts at speed, settles at the end.
  const easeOutCubic=u=>{u=THREE.MathUtils.clamp(u,0,1);return 1-(1-u)**3;};
  function cancelAnimation(key){
    const animation=animations.get(key);
    if(animation){cancelAnimationFrame(animation.frame);animations.delete(key);animation.resolve();}
  }
  function animateChange(key,duration,update,ease=smoothstep){
    cancelAnimation(key);
    if(!active||window.matchMedia('(prefers-reduced-motion: reduce)').matches){update(1);return Promise.resolve();}
    return new Promise(resolve=>{
      const animation={resolve,frame:null,start:performance.now()};animations.set(key,animation);
      const step=now=>{
        if(animations.get(key)!==animation)return;
        // rAF timestamps can precede the start time taken in the same frame.
        const progress=THREE.MathUtils.clamp((now-animation.start)/duration,0,1);
        update(ease(progress));
        if(progress<1)animation.frame=requestAnimationFrame(step);
        else{animations.delete(key);resolve();}
      };
      animation.frame=requestAnimationFrame(step);
    });
  }
  function resetView(){
    // Shortest way back to the home azimuth, whatever the number of full turns.
    const startOffset=Math.atan2(Math.sin(azimuth-HOME_AZIMUTH),Math.cos(azimuth-HOME_AZIMUTH));
    const startElevation=elevation,startDistance=distance,startTarget=target.clone();
    return animateChange('camera',600,t=>{
      azimuth=HOME_AZIMUTH+startOffset*(1-t);elevation=THREE.MathUtils.lerp(startElevation,HOME_ELEVATION,t);
      distance=THREE.MathUtils.lerp(startDistance,HOME_DISTANCE,t);target.lerpVectors(startTarget,homeTarget,t);updateCamera();
    });
  }
  const carryDuration=jar=>THREE.MathUtils.clamp(600+jar.path.getLength()*75,800,1400);
  // Same spatial clearance as before the corner easing: measured on the route.
  const pastHalfway=(jar,from,to)=>Math.abs(routeEase(jar,jar.u)-routeEase(jar,from))>=.42*Math.abs(to-from);
  // When the next jar will be on the bench, in ms from now: the jar there
  // leaves first, the next one sets off once it is halfway (transitionElement).
  function jarLandingDelay(incoming){
    if(incoming.u===1&&!incoming.moving)return 0;
    let wait=0;
    const outgoing=tableJar&&tableJar!==incoming?tableJar:null;
    if(outgoing){
      const duration=carryDuration(outgoing),saved=outgoing.u;
      for(wait=0;wait<duration;wait+=4){
        outgoing.u=1-smoothstep(wait/duration);
        if(pastHalfway(outgoing,1,0))break;
      }
      outgoing.u=saved;
    }
    return wait+carryDuration(incoming)*(1-incoming.u);
  }
  function carryJar(jar,toTable,onHalfway){
    jar.moving=true;
    const from=jar.u,to=toTable?1:0;
    const duration=carryDuration(jar);
    let halfway=false;
    const passHalfway=()=>{if(!halfway){halfway=true;onHalfway?.();}};
    return animateChange(`jar-${jar.symbol}`,duration,t=>{
      placeJar(jar,from+(to-from)*t);syncJarShadow();
      if(pastHalfway(jar,from,to))passHalfway();
    }).then(()=>{jar.moving=false;passHalfway();syncJarShadow();shadowDirty=true;});
  }
  // The rod always lies on the bench, also with no element selected.
  async function transitionElement(element,commit){
    jarTransitions++;
    try{
      const incoming=element?jars.get(element.symbol)??null:null;
      const outgoing=tableJar&&tableJar!==incoming?tableJar:null;
      const tasks=[];
      let cleared=Promise.resolve();
      if(outgoing){
        // The jar on the bench goes back to its shelf first.
        let release;cleared=new Promise(resolve=>release=resolve);
        tableJar=null;outgoingJar=outgoing;
        tasks.push(carryJar(outgoing,false,release).then(()=>{
          if(outgoingJar===outgoing)outgoingJar=null;
          syncJarShadow();
        }));
      }
      if(element){
        // The new jar leaves its shelf once the previous one has cleared the spot.
        await cleared;
        // commit() can synchronously render: prepare the rod's entry pose first.
        commit();
        if(incoming&&incoming!==tableJar){tableJar=incoming;tasks.push(carryJar(incoming,true));}
        await Promise.all(tasks);
      }else{
        await Promise.all(tasks);
        commit();
      }
    }finally{
      jarTransitions--;
      if(!jarTransitions){
        tableJar=currentReagent?jars.get(currentReagent.symbol)??null:null;
        // Settle any jar left mid-route by a cancelled animation.
        for(const jar of jars.values())if(jar.u!==(jar===tableJar?1:0))placeJar(jar,jar===tableJar?1:0);
        for(const jar of jars.values())jar.moving=false;
        outgoingJar=null;syncJarShadow();shadowDirty=true;
      }
    }
  }
  // Outside quick mode, choosing an element samples it: the cork comes off and
  // stands on the bench in front of the jar, the rod turns upright, dips its
  // loop into the powder and goes back to rest, then the cork goes back on.
  // Each motion is one continuous curve and two independent easings, both
  // fastest halfway through and still at their ends: the tip travels along
  // the curve by arc length over the whole duration, and the rod turns over
  // the first ROD_TURN_SHARE of it (the last share on the way back).
  // Clearances, checked numerically for a 6.1-unit rod: >= 1.19 from the
  // burner and the flame, >= 0.82 over the jar rim until it is upright; inside
  // the jar it moves only vertically along the axis. Above 0.7 the still
  // tilted rod would touch the jar.
  const DIP_ABOVE_MOUTH=2.35,DIP_DEPTH=.07,ROD_TURN_SHARE=.6,ROD_CLEAR_Y=4.6;
  const CORK_ON_BENCH=new THREE.Vector3(.25,-1.74,.95),CORK_PULL=.22,CORK_ARC=.35;
  function setRodPose(position,angle){motion.returnPose={position,angle};alignRod();}
  // Aims at the bench spot, not at the jar: the jar may still be on its shelf
  // when the motion is planned.
  function dipPath(jar){
    const rest=motion.pathPose(0).position;
    const mouth=TABLE_SPOT.clone().setY(DIP_ABOVE_MOUTH);
    const inSalt=mouth.clone().setY(TABLE_SPOT.y+jar.surface-DIP_DEPTH);
    // Leaves the bench upwards, arrives over the mouth downwards: the descent
    // continues the same tangent.
    const arc=new THREE.CubicBezierCurve3(rest,rest.clone().setY(rest.y+2),mouth.clone().setY(mouth.y+1.2),mouth);
    const path=new THREE.CurvePath();
    path.add(arc);path.add(new THREE.LineCurve3(mouth,inSalt));
    // Halfway along the arc the tip is clear of the jar and the cork's path.
    const arcLengths=arc.getLengths();
    return {path,clearOfJar:arcLengths[arcLengths.length>>1]/path.getLength()};
  }
  function playRod(path,reverse,duration,onProgress){
    const upright=Math.PI/2;
    return animateChange('rod-dip',duration,t=>{
      const travel=smootherstep(t),u=reverse?1-travel:travel;
      const turn=smootherstep((reverse?1-t:t)/ROD_TURN_SHARE);
      setRodPose(path.getPointAt(u),upright*turn);onProgress?.(u);
    },t=>t);
  }
  const rodOnBench=()=>motion.phase==='path'&&motion.progress===0&&!motion.returnPose;
  // From wherever the rod is straight into the jar: from the bench along the
  // usual arc, from the air rising a little first; both arrive over the mouth
  // downwards and go on down the axis into the salt.
  function pathIntoJar(jar){
    if(rodOnBench())return dipPath(jar).path;
    const start=motion.getPose().position;
    const mouth=TABLE_SPOT.clone().setY(DIP_ABOVE_MOUTH);
    const inSalt=mouth.clone().setY(TABLE_SPOT.y+jar.surface-DIP_DEPTH);
    const path=new THREE.CurvePath();
    // Straight up over the burner barrel (top 3.26) before heading off: a
    // still tilted rod moving sideways from low down would cut it with its
    // handle. The arc then leaves upwards too, so the joint has no corner.
    let from=start.clone();
    if(from.y<ROD_CLEAR_Y){const lifted=from.clone().setY(ROD_CLEAR_Y);path.add(new THREE.LineCurve3(from,lifted));from=lifted;}
    path.add(new THREE.CubicBezierCurve3(from,from.clone().setY(from.y+.8),mouth.clone().setY(mouth.y+1.2),mouth));
    path.add(new THREE.LineCurve3(mouth,inSalt));
    return path;
  }
  // Inverse of smootherstep: when the tip reaches a given share of its path.
  function smootherstepInverse(value){
    let low=0,high=1;
    for(let i=0;i<40;i++){const middle=(low+high)/2;if(smootherstep(middle)<value)low=middle;else high=middle;}
    return (low+high)/2;
  }
  const waitMs=ms=>ms>0&&active&&!reducedMotion.matches?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
  function whenLanded(jar){
    return new Promise(resolve=>{
      const check=()=>!active||tableJar===jar&&jar.u===1&&!jar.moving?resolve():requestAnimationFrame(check);
      check();
    });
  }
  // Straight out of the neck, over the rim at that height or higher, then
  // straight down onto the bench clear of the jar.
  function corkCurve(){
    const lifted=new THREE.Vector3(0,CORK_PULL,0),over=CORK_ON_BENCH.clone().setY(CORK_PULL);
    const curve=new THREE.CurvePath();
    curve.add(new THREE.LineCurve3(new THREE.Vector3(),lifted));
    curve.add(new THREE.CubicBezierCurve3(lifted,lifted.clone().setY(CORK_PULL+CORK_ARC),
      over.clone().setY(CORK_PULL+CORK_ARC),over));
    curve.add(new THREE.LineCurve3(over,CORK_ON_BENCH.clone()));
    return curve;
  }
  const corkPath=corkCurve();
  const CORK_TIME=550;
  function moveCork(jar,toBench){
    return animateChange('cork-dip',CORK_TIME,t=>{
      jar.cork.position.copy(corkPath.getPointAt(toBench?t:1-t));
      depthDirty=true;jarShadowDirty=true;jarMovedAt=performance.now();
    },smootherstep).then(()=>{shadowDirty=true;});
  }
  // Called together with transitionElement(element), before it moves the jars.
  // One motion from the rod's current pose into the jar, started so that the
  // rod is over the mouth just as the cork comes off; until then it stays put.
  async function dipRod(element){
    const jar=element?jars.get(element.symbol)??null:null;
    try{
      if(!jar)return;
      const now=performance.now();
      // A frame or two of slack: the jar lands, and the cork starts, on a frame.
      const overMouth=now+jarLandingDelay(jar)+CORK_TIME+60;
      cancelRodAnimation();
      const start=motion.getPose(),inward=pathIntoJar(jar),upright=Math.PI/2;
      const inwardLength=inward.getLength();
      // Share of the path before the last stretch (down the axis into the salt).
      const mouthAt=smootherstepInverse(1-inward.curves[inward.curves.length-1].getLength()/inwardLength);
      let inwardDuration=420+115*inwardLength;
      // Too far to make it at the natural pace: a little faster instead.
      if(now+mouthAt*inwardDuration>overMouth)inwardDuration=Math.max(500,(overMouth-now)/mouthAt);
      await waitMs(overMouth-mouthAt*inwardDuration-performance.now());
      const corkOff=whenLanded(jar).then(()=>moveCork(jar,true));
      await animateChange('rod-dip',inwardDuration,t=>{
        setRodPose(inward.getPointAt(smootherstep(t)),THREE.MathUtils.lerp(start.angle,upright,smootherstep(t/ROD_TURN_SHARE)));
      },t=>t);
      await corkOff;
      const {path,clearOfJar}=dipPath(jar);
      const duration=Math.round(420+115*path.getLength());
      // The loop is buried in the powder: it comes out carrying the new salt.
      beadSalt.color.set(currentReagent.saltColor||'#e8e1d2');bead.visible=true;beadHeld=false;
      await animateChange('rod-dip',180,()=>{});
      // Back along the same poses; the cork follows once the rod is clear.
      let corkBack=null;
      await playRod(path,true,duration,u=>{if(!corkBack&&u<=clearOfJar)corkBack=moveCork(jar,false);});
      await corkBack;
    }finally{
      if(jar){cancelAnimation('cork-dip');jar.cork.position.set(0,0,0);}
      cancelAnimation('rod-dip');
      if(beadHeld&&currentReagent)beadSalt.color.set(currentReagent.saltColor||'#e8e1d2');
      if(currentReagent)bead.visible=true;beadHeld=false;
      motion.reset(false);alignRod();depthDirty=true;shadowDirty=true;
    }
  }
  function setRay(event) {
    const bounds=canvas.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    raycaster.setFromCamera(pointer,camera);
  }
  function pick(event) {
    setRay(event);
    visiblePickables.length=0;
    for(const object of pickables){
      const kind=object.userData.pick;
      const visible=kind==='jar'?jarPickable(jars.get(object.userData.symbol))
        :kind==='rod'?rod.visible:true;
      if(visible)visiblePickables.push(object);
    }
    pickHits.length=0;
    return raycaster.intersectObjects(visiblePickables,false,pickHits)[0];
  }
  const visiblePickables=[],pickHits=[];
  // Hover only changes the cursor: one raycast per frame is enough.
  let hoverEvent=null,hoverFrame=0;
  function scheduleHover(event){
    hoverEvent=event;
    if(hoverFrame)return;
    hoverFrame=requestAnimationFrame(()=>{
      hoverFrame=0;
      if(!active||!hoverEvent||pointers.size)return;
      const hit=pick(hoverEvent);
      hoveredJar=hit?.object.userData.pick==='jar'?jars.get(hit.object.userData.symbol):null;
      canvas.style.cursor=hoveredJar?'pointer':'grab';
    });
  }
  function listen(type,handler,options) {canvas.addEventListener(type,handler,options);}
  function finishGesture() {
    const wasRod=gesture?.kind==='rod-path'||gesture?.kind==='rod-glide'||gesture?.kind==='rod-plane';
    gesture=null;canvas.style.cursor='grab';
    if(wasRod)onRodEnd();
  }
  function alignRod(){
    const pose=motion.getPose();
    if(rod.position.distanceToSquared(pose.position)>1e-12||Math.abs(rod.rotation.z-pose.angle)>1e-8){
      // The rod's shadow follows it on every rendered frame (render()).
      depthDirty=true;rodShadowDirty=true;
      rod.position.copy(pose.position);rod.rotation.z=pose.angle;rod.updateMatrixWorld();
    }
  }
  function beginPlaneDrag(event){
    setRay(event);
    dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),motion.getPose().position);
    const hit=raycaster.ray.intersectPlane(dragPlane,intersection);
    gesture={kind:'rod-plane',offset:hit?motion.getPose().position.sub(hit):new THREE.Vector3()};
  }
  function cancelRodAnimation(){
    if(!rodAnimation)return;
    const animation=rodAnimation;rodAnimation=null;
    cancelAnimationFrame(animation.frame);animation.resolve();
  }
  function moveToFlame(duration=500,ease=smootherstep){
    cancelRodAnimation();
    if(!active){motion.reset(true);return Promise.resolve();}
    const startProgress=motion.progress,startOffset=motion.offset.clone(),phase=motion.phase;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)duration=0;
    return new Promise(resolve=>{
      const animation={resolve,frame:null,started:performance.now()};rodAnimation=animation;
      const step=now=>{
        if(rodAnimation!==animation)return;
        const progress=duration?Math.min(1,(now-animation.started)/duration):1;
        const eased=ease(progress);
        if(phase==='path')motion.setProgress(startProgress+(1-startProgress)*eased);
        else motion.offset.copy(startOffset).multiplyScalar(1-eased);
        if(progress===1){motion.reset(true);rodAnimation=null;}
        alignRod();
        if(progress<1)animation.frame=requestAnimationFrame(step);else resolve();
      };
      animation.frame=requestAnimationFrame(step);
    });
  }
  async function moveToRest(){
    cancelRodAnimation();
    const startProgress=motion.phase==='path'?motion.progress:1;
    const startOffset=motion.phase==='plane'?motion.offset.clone():new THREE.Vector3();
    const startAngle=motion.getPose().angle;
    // Travel by arc length and turn, each fastest halfway and still at the
    // ends (checked clear of the burner for the flame targets in use).
    const path=motion.path;path.updateArcLengths();
    const lengths=path.getLengths(),at=startProgress*(lengths.length-1),i=Math.floor(at);
    const startLength=i>=lengths.length-1?lengths[i]:THREE.MathUtils.lerp(lengths[i],lengths[i+1],at-i);
    const startU=startLength/lengths[lengths.length-1];
    await animateChange('rod-return',520,t=>{
      const position=path.getPointAt(startU*(1-t)).addScaledVector(startOffset,1-t);
      motion.returnPose={position,angle:startAngle*(1-t)};alignRod();
    },smootherstep);
    motion.reset(false);alignRod();
  }
  function pinchDistance() {const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
  listen('pointerdown',event=>{
    if(!active||event.button>0)return;
    cancelAnimation('camera');
    // Focused for the keyboard controls; the ring is only for keyboard users.
    event.preventDefault();canvas.classList.add('pointer-focused');canvas.focus({preventScroll:true});
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);
    if(pointers.size===2){finishGesture();gesture={kind:'pinch',start:pinchDistance(),distance};return;}
    const hit=pick(event),kind=hit?.object.userData.pick;
    if(kind==='rod'&&onRodStart()!==false) {
      cancelRodAnimation();
      if(motion.phase==='path')gesture={kind:'rod-path',grabLocal:rod.worldToLocal(hit.point.clone())};
      else beginPlaneDrag(event);
    }else gesture={kind:kind==='jar'?'jar':'orbit',symbol:hit?.object.userData.symbol,
      x:event.clientX,y:event.clientY,azimuth,elevation,moved:false};
    canvas.style.cursor='grabbing';
  });
  listen('pointermove',event=>{
    if(!active)return;
    if(!pointers.has(event.pointerId)){scheduleHover(event);return;}
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(!gesture)return;
    if(gesture.kind==='pinch') {distance=THREE.MathUtils.clamp(gesture.distance*gesture.start/Math.max(1,pinchDistance()),8,29);updateCamera();return;}
    if(gesture.kind==='rod-path') {
      const bounds=canvas.getBoundingClientRect();
      const mouse=new THREE.Vector2(event.clientX-bounds.left,event.clientY-bounds.top);
      const size=`${bounds.width}:${bounds.height}`;
      if(gesture.pathSize!==size){
        gesture.path=motion.projectedPath(camera,bounds.width,bounds.height,gesture.grabLocal);gesture.pathSize=size;
      }
      const progress=motion.progressAtPointer(mouse,camera,bounds.width,bounds.height,gesture.grabLocal,gesture.path);
      if(progress===1&&motion.progress<.999){
        // Captured short of the end (the last stretch runs mostly in depth):
        // glide the rest instead of jumping, then keep dragging in the plane.
        const glide={kind:'rod-glide',event};gesture=glide;
        moveToFlame(Math.round(100+400*(1-motion.progress)),easeOutCubic).then(()=>{
          if(gesture===glide)beginPlaneDrag(glide.event);
        });
        return;
      }
      motion.setProgress(progress);
      alignRod();
      if(motion.phase==='plane')beginPlaneDrag(event);
      return;
    }
    if(gesture.kind==='rod-glide'){gesture.event=event;return;}
    if(gesture.kind==='rod-plane') {
      setRay(event);
      if(raycaster.ray.intersectPlane(dragPlane,intersection)) {
        motion.setPlanePosition(intersection.clone().add(gesture.offset));
        alignRod();
      }
      return;
    }
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.hypot(dx,dy)>5)gesture.moved=true;
    if(gesture.kind==='orbit'||gesture.moved) {
      azimuth=gesture.azimuth-dx*.008;elevation=THREE.MathUtils.clamp(gesture.elevation+dy*.006,0,1.28);updateCamera();
    }
  });
  function release(event,cancelled=false) {
    if(!pointers.has(event.pointerId))return;
    if(!cancelled&&gesture?.kind==='jar'&&!gesture.moved){hoveredJar=null;onJar(gesture.symbol);}
    finishGesture();pointers.delete(event.pointerId);
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  listen('pointerup',event=>release(event));
  listen('pointercancel',event=>release(event,true));
  listen('pointerleave',()=>{hoverEvent=null;hoveredJar=null;});
  listen('lostpointercapture',event=>release(event,true));
  listen('wheel',event=>{if(!active)return;event.preventDefault();if(gesture)return;cancelAnimation('camera');distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),8,29);updateCamera();},{passive:false});
  listen('dblclick',event=>{if(active&&!pick(event))resetView();});
  listen('blur',()=>canvas.classList.remove('pointer-focused'));
  listen('keydown',event=>{
    if(!active||gesture)return;
    if(event.key!=='Home')cancelAnimation('camera');
    if(event.key==='ArrowLeft')azimuth-=.12;
    else if(event.key==='ArrowRight')azimuth+=.12;
    else if(event.key==='ArrowUp')elevation=Math.min(1.28,elevation+.08);
    else if(event.key==='ArrowDown')elevation=Math.max(0,elevation-.08);
    else if(event.key==='+'||event.key==='=')distance=Math.max(8,distance*.9);
    else if(event.key==='-')distance=Math.min(29,distance*1.1);
    else if(event.key==='Home')resetView();else return;
    event.preventDefault();updateCamera();
  });
  listen('webglcontextlost',event=>{event.preventDefault();active=false;onFailure();});
  updateCamera();
  return {
    setElement,transitionElement,moveToRest,dipRod,
    // Call before committing a non-quick selection: the loop keeps its old salt
    // (or none, the first time) until dipRod() takes the new one from the jar.
    holdBead(){beadHeld=true;},
    // Compiles the programs off the main thread (KHR_parallel_shader_compile),
    // so the first frame does not wait for the driver. Besides the screen pass
    // this covers the variants the transmission pass draws opaque objects with
    // (any render target: no tone mapping, linear output), which
    // compileAsync(scene) alone leaves to a blocking compile on first use.
    async precompile(){
      if(!renderer.compileAsync)return;
      const savedRod=rod.visible,savedShadows=renderer.shadowMap.enabled;
      const target=new THREE.WebGLRenderTarget(1,1);
      try{
        rod.visible=true;scene.updateMatrixWorld();
        const opaque=[];
        scene.traverse(object=>{
          const material=object.material;
          if(object.isMesh&&material&&!Array.isArray(material)&&!material.transparent&&!(material.transmission>0))opaque.push(object);
        });
        // Submit the screen variants first so the driver compiles both sets
        // in parallel; compileAsync below then only waits for them.
        renderer.compile(scene,camera);
        renderer.setRenderTarget(target);
        const targetVariants=opaque.map(object=>renderer.compileAsync(object,camera,scene));
        // The flame depth pass: depthMaterial as override, shadows off, on
        // plain and instanced (wall tiles) meshes.
        renderer.setRenderTarget(depthTarget);renderer.shadowMap.enabled=false;
        for(const proxy of depthProxies)targetVariants.push(renderer.compileAsync(proxy,camera,scene));
        renderer.shadowMap.enabled=savedShadows;renderer.setRenderTarget(null);
        await Promise.all(targetVariants);
        await renderer.compileAsync(scene,camera);
      }finally{
        renderer.setRenderTarget(null);renderer.shadowMap.enabled=savedShadows;target.dispose();rod.visible=savedRod;
      }
    },
    async prepare(element,args){
      const saved=currentReagent,savedBead=bead.visible,savedSalt=beadSalt.color.clone();
      try{
        setElement(element);rod.visible=true;scene.updateMatrixWorld();
        await this.precompile();
        // A real hidden frame also prepares transmission/depth/shadow variants
        // and uploads geometry/textures before the loading screen is removed.
        this.render({...args,visible:true});renderer.getContext().finish();
      }finally{
        setElement(saved);rod.visible=args.visible;depthDirty=true;shadowDirty=true;
        bead.visible=savedBead;beadSalt.color.copy(savedSalt);
      }
    },
    setActive(value){active=value;if(!value){cancelRodAnimation();finishGesture();pointers.clear();}},
    resetView,
    configureRod(x,y){motion.configure(x,y);},
    resetRod(inFlame=false){cancelRodAnimation();motion.reset(inFlame);alignRod();},
    getRodPose(){return motion.getPose();},
    moveToFlame,
    sampleIsInsideFlame(height,mouth){
      const sample=motion.getPose().position,h=(sample.y-3.26)/height;
      if(h<0||h>1.02)return false;
      const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
      const width=(mouth*(1.08-.58*Math.min(1,h))+height*(.04576/.408)*Math.pow(Math.max(0,1-h),.72)*smooth(-.02,.12,h))
        *Math.sqrt(Math.max(0,1-Math.max(0,(h-.88)/.17)**2))*.75*(.70+.23*smooth(0,.40,h));
      return Math.hypot(sample.x,sample.z)<=width;
    },
    render({geometry,color,intensity,visible,time,plume}) {
      if(!active)return;
      const width=canvas.clientWidth,height=canvas.clientHeight,size=`${width}:${height}`;
      if(size!==lastSize){
        renderer.setSize(width,height,false);renderer.getDrawingBufferSize(viewport);
        depthTarget.setSize(viewport.x,viewport.y);glassDepthTarget.setSize(viewport.x,viewport.y);
        camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();lastSize=size;depthDirty=true;
      }
      const unit=geometry.scale*100;
      const flameHeight=height*.408*1.12/unit;
      alignRod();rod.visible=visible;
      // The rod is the one object the user moves by hand, and a shadow updated
      // a few times per second visibly jumps along the wall: while it moves the
      // shadow map is redrawn with every frame (at most 30 per second).
      if(rodShadowDirty){shadowDirty=true;rodShadowDirty=false;}
      if(jarShadowDirty){
        const now=performance.now();
        // Carried jar: about 15 shadow updates per second, then once at rest.
        if(now-jarMovedAt>60||now-jarShadowTime>66){shadowDirty=true;jarShadowDirty=false;jarShadowTime=now;}
      }
      // Pickup hint: fades in at rest on the bench, out as soon as the rod moves.
      // No hint while the rod cannot be picked up (no element, jars moving).
      const rodAtRest=visible&&currentReagent&&!jarTransitions&&motion.phase==='path'&&motion.progress===0&&!motion.returnPose
        &&!rodAnimation&&!(gesture?.kind?.startsWith('rod'));
      const glowStep=rodGlowTime===null?1:Math.min(1,Math.max(0,time-rodGlowTime)*5);rodGlowTime=time;
      rodGlowLevel+=((rodAtRest?1:0)-rodGlowLevel)*glowStep;
      const glowPulse=reducedMotion.matches?.6:.5-.5*Math.cos(time*Math.PI*2/1.8);
      glowUniforms.glowStrength.value=rodGlowLevel*(.35+.95*glowPulse);
      for(const outline of rodGlow)outline.visible=rodGlowLevel>.002;
      for(const jar of jars.values()){
        jar.glowLevel+=((jar===hoveredJar&&jarPickable(jar)?1:0)-jar.glowLevel)*Math.min(1,glowStep*1.6);
        jar.glowUniforms.glowStrength.value=jar.glowLevel*.85;
        for(const outline of jar.glow)outline.visible=jar.glowLevel>.002;
      }
      if(visible!==lastRodVisible){depthDirty=true;shadowDirty=true;lastRodVisible=visible;}
      coloredFlameLight.color.setRGB(...color,THREE.SRGBColorSpace);
      const linearColor=coloredFlameLight.color.toArray();
      flame.update({height:flameHeight,mouthRadius:geometry.radius/unit,tip:motion.getPose().position,
        color:linearColor,intensity,time,plume,viewport,depthTexture:depthTarget.depthTexture,
        glassDepthTexture:glassDepthTarget.depthTexture,camera});
      const calm=reducedMotion.matches?.25:1;
      // The cast light follows the flame's own puffing instead of fixed sines.
      const lightPulse=1+calm*.04*THREE.MathUtils.clamp(flame.flicker,-2,2);
      coloredFlameLight.intensity=plume.active?14*intensity*lightPulse:0;
      coloredFlameLight.position.copy(flame.source).add(lightLift);
      scene.updateMatrixWorld();
      glassShadowUniforms.glassRodStart.value.set(2.18,0,0).applyMatrix4(rod.matrixWorld);
      glassShadowUniforms.glassRodEnd.value.set(6.03,0,0).applyMatrix4(rod.matrixWorld);
      glassShadowUniforms.glassRodVisible.value=visible?rod.scale.x:0;
      // Opaque depth clips the integration at the wire, salt and apparatus.
      // Glass and the invisible picking handle must not occlude the flame.
      const cameraMask=camera.layers.mask;
      const shadowEnabled=renderer.shadowMap.enabled;
      if(depthDirty){
        try{
          camera.layers.set(1);scene.overrideMaterial=depthMaterial;renderer.shadowMap.enabled=false;
          // Only the flame reads this depth: restrict the pass to its screen box.
          flameScissor(depthTarget.scissor);depthTarget.scissorTest=true;
          renderer.setRenderTarget(depthTarget);renderer.render(scene,camera);
          // Nearest glass surface in front of the flame (rod handle, jars).
          glassDepthTarget.scissor.copy(depthTarget.scissor);glassDepthTarget.scissorTest=true;
          camera.layers.set(2);renderer.setRenderTarget(glassDepthTarget);renderer.render(scene,camera);
          depthDirty=false;
        }finally{
          renderer.setRenderTarget(null);camera.layers.mask=cameraMask;
          scene.overrideMaterial=null;renderer.shadowMap.enabled=shadowEnabled;
        }
      }
      renderer.shadowMap.needsUpdate=shadowDirty;shadowDirty=false;
      renderer.render(scene,camera);
    }
  };
}
