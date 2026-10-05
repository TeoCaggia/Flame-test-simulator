import * as THREE from 'three';

// Integrate emission through a closed volume. The blue envelope stays on the
// burner; the coloured plume starts at the rod tip in world coordinates.
export function createVolumetricFlame(track){
  // Hardware-interpolated value noise replaces four sine hashes per noise
  // sample. This lookup is flow data, not a lower-resolution material texture.
  const noiseData=new Uint8Array(256*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const hash=Math.sin(x*127.1+y*311.7)*43758.5453,v=Math.floor((hash-Math.floor(hash))*255),i=(y*256+x)*4;
    noiseData.set([v,v,v,255],i);
  }
  const noiseTexture=track(new THREE.DataTexture(noiseData,256,256));
  noiseTexture.name='flame-flow-lookup';noiseTexture.wrapS=noiseTexture.wrapT=THREE.RepeatWrapping;
  noiseTexture.minFilter=noiseTexture.magFilter=THREE.LinearFilter;noiseTexture.needsUpdate=true;
  // Flame motion. Disturbances are born at the burner rim and carried up by the
  // gas: the displacement at height h is the rim state of age(h) seconds ago, so
  // waves travel up the mantle, stretch as the gas accelerates and grow with
  // height while the inner cone stays anchored. Random processes, not sines,
  // drive them, so nothing repeats. A slow draught leans the upper flame and a
  // moving rod drags the gas above it. The CPU writes 64 heights per frame to a
  // half-float strip: one lookup per shader sample replaces two noise reads.
  const MOTION_TEXELS=64,MOTION_TOP=1.05,RATE=240,HISTORY=512;
  const motionData=new Uint16Array(MOTION_TEXELS*4);
  const motionTexture=track(new THREE.DataTexture(motionData,MOTION_TEXELS,1,THREE.RGBAFormat,THREE.HalfFloatType));
  motionTexture.name='flame-motion-strip';motionTexture.minFilter=motionTexture.magFilter=THREE.LinearFilter;
  motionTexture.needsUpdate=true;
  const rimX=new Float32Array(HISTORY),rimZ=new Float32Array(HISTORY),rimPuff=new Float32Array(HISTORY);
  const rim={x:0,x2:0,z:0,z2:0,puff:0,puffRate:0,draftX:0,draftZ:0,tip:0,coneX:0,coneX2:0,coneZ:0,coneZ2:0,coneH:0};
  let head=0,stepClock=0,lastTime=null,spare=null;
  const gaussian=()=>{
    if(spare!==null){const value=spare;spare=null;return value;}
    const radius=Math.sqrt(-2*Math.log(Math.max(1e-9,Math.random()))),angle=2*Math.PI*Math.random();
    spare=radius*Math.sin(angle);return radius*Math.cos(angle);
  };
  // Buoyant puffing of a small flame: a noise-driven resonator near 7.5 Hz,
  // quasi-regular like the real flicker but never periodic. Unit variance.
  const PUFF_OMEGA=2*Math.PI*7.5,PUFF_DAMPING=.16;
  const ou=(value,tau,dt,root)=>value-value*dt/tau+Math.sqrt(2/tau)*root*gaussian();
  function stepRim(dt){
    const root=Math.sqrt(dt);
    // Band-limited lateral shear at the rim, smoothed once more so it never jitters.
    rim.x=ou(rim.x,.16,dt,root);rim.x2+=(rim.x-rim.x2)*dt/.06;
    rim.z=ou(rim.z,.16,dt,root);rim.z2+=(rim.z-rim.z2)*dt/.06;
    rim.puffRate+=(-2*PUFF_DAMPING*PUFF_OMEGA*rim.puffRate-PUFF_OMEGA*PUFF_OMEGA*rim.puff)*dt
      +Math.sqrt(4*PUFF_DAMPING*PUFF_OMEGA**3)*root*gaussian();
    rim.puff+=rim.puffRate*dt;
    // Room draught and tip length wander over seconds.
    rim.draftX=ou(rim.draftX,2.8,dt,root);rim.draftZ=ou(rim.draftZ,2.8,dt,root);
    rim.tip=ou(rim.tip,.6,dt,root);
    // The inner cone trembles faster and far less than the mantle: its tip
    // wanders while the base stays on the mouth, and its height breathes.
    rim.coneX=ou(rim.coneX,.09,dt,root);rim.coneX2+=(rim.coneX-rim.coneX2)*dt/.035;
    rim.coneZ=ou(rim.coneZ,.09,dt,root);rim.coneZ2+=(rim.coneZ-rim.coneZ2)*dt/.035;
    rim.coneH=ou(rim.coneH,.22,dt,root);
    head=(head+1)%HISTORY;rimX[head]=rim.x2;rimZ[head]=rim.z2;rimPuff[head]=rim.puff;
  }
  for(let i=0;i<RATE*2;i++)stepRim(1/RATE);
  const rimAt=(buffer,age)=>{
    const back=Math.min(HISTORY-2,age*RATE),i=Math.floor(back),f=back-i;
    const a=buffer[(head-i+HISTORY)%HISTORY],b=buffer[(head-i-1+HISTORY)%HISTORY];
    return a+(b-a)*f;
  };
  // Gas leaves the mouth at 1.6 flame heights per second and accelerates with
  // buoyancy (6 heights/s²); the shader uses the same law to advect its noise.
  const ageAt=h=>(Math.sqrt(1.6*1.6+12*h)-1.6)/6;
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const toHalf=THREE.DataUtils.toHalfFloat;
  const wake={x:0,z:0,inside:0,tip:new THREE.Vector3(),known:false};
  let tipScale=1;
  // Light the flame casts, in flame heights: offset of its centroid and
  // relative change of its power.
  const castLight={x:0,z:0,lift:0,pulse:0};
  const LIGHT_TEXEL=Math.round(.6/MOTION_TOP*(MOTION_TEXELS-1));
  const coneWobble=new THREE.Vector3(0,0,1);
  function advanceMotion(time,tip,height,inside,calm){
    const dt=lastTime===null?0:Math.min(.25,Math.max(0,time-lastTime));lastTime=time;
    stepClock+=dt;
    while(stepClock>=1/RATE){stepClock-=1/RATE;stepRim(1/RATE);}
    // A rod in the flame stirs the gas above it, and moving it drags that gas
    // along; the wake relaxes in about 0.2 s once the rod stops or leaves.
    const rodH=(tip.y-3.26)/height;
    if(dt>0){
      const follow=Math.min(1,dt/.18),moving=inside&&wake.known;
      const vx=moving?(tip.x-wake.tip.x)/dt/height:0,vz=moving?(tip.z-wake.tip.z)/dt/height:0;
      wake.x+=(THREE.MathUtils.clamp(vx*.10,-.06,.06)-wake.x)*follow;
      wake.z+=(THREE.MathUtils.clamp(vz*.10,-.06,.06)-wake.z)*follow;
      wake.inside+=((inside?1:0)-wake.inside)*Math.min(1,dt/.25);
    }
    wake.tip.copy(tip);wake.known=true;
    for(let i=0;i<MOTION_TEXELS;i++){
      const h=i/(MOTION_TEXELS-1)*MOTION_TOP,age=ageAt(h),above=smooth(rodH,rodH+.2,h);
      const stirred=calm*(1+.5*wake.inside*above),grow=smooth(.12,1.05,h)*stirred,lean=.032*h*h*calm;
      const swayX=.018*grow*rimAt(rimX,age)+lean*rim.draftX+above*calm*wake.x;
      const swayZ=.018*grow*rimAt(rimZ,age)+lean*rim.draftZ+above*calm*wake.z;
      if(i===LIGHT_TEXEL){castLight.x=swayX;castLight.z=swayZ;}
      motionData[i*4]=toHalf(swayX);motionData[i*4+1]=toHalf(swayZ);
      motionData[i*4+2]=toHalf(.05*smooth(.25,1,h)*stirred*rimAt(rimPuff,age));
    }
    motionTexture.needsUpdate=true;
    // A swelling reaching the top stretches the tip before it pinches back.
    tipScale=1+calm*(.022*rim.tip+.03*rimAt(rimPuff,ageAt(.75)));
    const flicker=calm*rimAt(rimPuff,ageAt(.5));
    // The emitting volume swells with each puff and as the tip stretches, so
    // the light it casts breathes with it (about ±8 %, more when the rod stirs
    // the gas); its centroid follows the mantle at mid-height and rises with
    // the tip. The cone below barely moves and is left out.
    castLight.lift=tipScale-1;
    castLight.pulse=(1+.5*wake.inside)*(.06*THREE.MathUtils.clamp(flicker,-2.5,2.5)+.03*calm*THREE.MathUtils.clamp(rim.tip,-2.5,2.5));
    // Tip offset (flame heights) and height scale of the inner cone.
    coneWobble.set(.006*calm*rim.coneX2,.006*calm*rim.coneZ2,
      1+calm*(.022*rim.coneH+.012*rimAt(rimPuff,ageAt(.15))));
    return 1+.4*wake.inside;
  }
  const uniforms={
    flameHeight:{value:4.18},mouthRadius:{value:.32256},sampleRadius:{value:.088},
    sampleTip:{value:new THREE.Vector3(.21,4.01,0)},tint:{value:new THREE.Vector3(1,.65,.1)},
    time:{value:0},opacity:{value:0},sampleActive:{value:0},
    flowNoise:{value:noiseTexture},flowMotion:{value:motionTexture},tipScale:{value:1},turbulence:{value:1},
    coneWobble:{value:coneWobble},
    withdrawalFront:{value:-1},revealFront:{value:-1},
    boundsMin:{value:new THREE.Vector3()},boundsMax:{value:new THREE.Vector3()},
    sceneDepth:{value:null},glassDepth:{value:null},viewport:{value:new THREE.Vector2(1,1)},
    inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()}
  };
  const material=track(new THREE.ShaderMaterial({
    name:'volumetric-flame-emission',uniforms,transparent:true,depthWrite:false,depthTest:false,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
    blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
    side:THREE.BackSide,toneMapped:false,
    vertexShader:`varying vec3 worldPoint;
      void main(){
        vec4 world=modelMatrix*vec4(position,1.0);worldPoint=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:`precision highp float;
      varying vec3 worldPoint;
      uniform float flameHeight,mouthRadius,sampleRadius,time,opacity,sampleActive;
      uniform float withdrawalFront,revealFront;
      uniform float tipScale,turbulence;
      uniform vec3 coneWobble;
      uniform vec3 sampleTip,tint,boundsMin,boundsMax;
      uniform vec2 viewport;
      uniform sampler2D sceneDepth,glassDepth;
      uniform sampler2D flowNoise,flowMotion;
      uniform mat4 inverseProjection,cameraWorld;
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return texture2D(flowNoise,(i+f+.5)/256.0).r;
      }
      float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.09);}
      float widthAt(float h,float mouth){
        float width=mouth*(1.08-.58*clamp(h,0.0,1.0))
          +(.04576/.408)*pow(max(0.0,1.0-h),.72)*smoothstep(-.02,.12,h);
        float cap=max(0.0,(h-.88)/.17);
        return max(.0005,width*sqrt(max(0.0,1.0-cap*cap))*.75*mix(.70,.93,smoothstep(0.0,.40,h)));
      }
      vec4 emission(vec3 point){
        vec3 q=(point-vec3(0.0,3.26,0.0))/flameHeight;
        float h=q.y;
        // The mantle tip lengthens and shortens; the inner cone keeps its size.
        float hm=h/tipScale;
        if(h<-.035||hm>.98)return vec4(0.0);
        // Gas displacement at this height (xy) and local swelling (z), carried
        // up from the rim by advanceMotion.
        vec3 motion=texture2D(flowMotion,vec2(clamp(h/1.05,0.0,1.0)*(63.0/64.0)+.5/64.0,.5)).rgb;
        vec2 sway=motion.xy;
        float mouth=mouthRadius/flameHeight;
        float width=widthAt(hm,mouth)*(1.0+motion.z);
        // The outer mantle sits on the burner rim and rounds off downwards: it
        // widens quickly from .85 of the mouth at the outlet (vertical tangent)
        // and joins the normal profile by h=.08. widthAt alone narrows to .6 of
        // the mouth there, so the mantle seemed to start above the cone.
        float mantleWidth=max(width,mouth*(.85+.30*sqrt(clamp(h/.08,0.0,1.0)))*(1.0-smoothstep(.10,.20,h)));
        float d=length(q.xz-sway)/mantleWidth;
        // Most samples of the bounding box are empty: nothing emits beyond
        // d=1.45, so leave before any noise lookup.
        if(d>1.45)return vec4(0.0);
        // Seconds since this gas left the mouth (same law as ageAt). Noise read
        // at age-time rides with the gas, stretching as it accelerates, instead
        // of scrolling; the second layer slips against it, so tongues change
        // shape as they rise.
        float age=(sqrt(2.56+12.0*h)-1.6)/6.0,parcel=age-time;
        vec2 across=vec2(q.x-q.z,q.x+q.z)*.7071;
        float tipNoise=(noise(vec2(across.x*7.0+time*.35,parcel*10.0))
          +noise(vec2(across.y*11.0-time*.5,parcel*15.0+age*8.0))-1.0)*.5;
        // The outer mantle ends in a ragged, flickering tip instead of a clean cap.
        float flicker=tipNoise*.10*smoothstep(.45,.95,hm)*turbulence;
        // The flame is anchored inside the mouth: it reaches full strength just
        // below the rim, so no dark gap separates it from the lip. The bottom edge
        // still curves up slightly towards the sides instead of a flat cut.
        float rounding=.010*d*d;
        float vertical=smoothstep(-.03+rounding,-.006+rounding,h)*(1.0-smoothstep(.74,.95,hm+flicker));
        float ragged=d+tipNoise*.12*h*turbulence;
        float body=(1.0-smoothstep(.64,1.07,ragged))*vertical;
        float veil=(1.0-smoothstep(.90,1.42,ragged))*vertical;
        // Inner reaction cone: a thin luminous shell narrowing to a point, so it
        // reads as a sharply outlined cone, brightest along its silhouette.
        // Its base sits well inside the mantle, which is itself about as wide as the mouth.
        float coneHeight=.30*coneWobble.z;
        float coneT=clamp(h/coneHeight,0.0,1.0);
        float coneRadius=max(.0006,widthAt(0.0,mouth)*.86*pow(max(0.0,1.0-h/coneHeight),.75));
        // The tip sways about the anchored base, bending more towards the top.
        float innerD=length(q.xz-sway*.25-coneWobble.xy*coneT*coneT)/coneRadius;
        float coneZone=smoothstep(-.03,-.006,h)*(1.0-smoothstep(coneHeight-.03,coneHeight+.01,h));
        // Faint ripples carried up the cone surface by the gas, stronger near the tip.
        if(coneZone>0.0&&innerD<1.3)
          innerD*=1.0+(noise(vec2(across.x*26.0+time*.6,parcel*32.0))-.5)*.09*coneT*turbulence;
        float shell=smoothstep(.35,.86,innerD)*(1.0-smoothstep(.92,1.12,innerD))*coneZone;
        float inner=shell+(1.0-smoothstep(0.0,.9,innerD))*coneZone*.25;
        // The mantle brightens slightly as a swelling passes, as the real flicker does.
        float blueDensity=(body*.50*(1.0+motion.z*.8)+veil*.14+inner*1.9)*1.18/max(.12,mouthRadius*2.0);
        vec3 innerBlue=mix(vec3(.30,.70,1.0),vec3(.55,.95,1.0),1.0-smoothstep(0.0,.25,h));
        // Faintly violet mantle, lavender towards its edge.
        vec3 mantle=mix(vec3(.12,.26,.70),vec3(.30,.22,.72),smoothstep(.55,1.2,d));
        vec3 blue=mix(mantle,innerBlue,clamp(inner*.9,0.0,1.0));
        // Without a sample in the flame only the blue envelope remains.
        if(sampleActive*opacity<=0.0)return vec4(blue,blueDensity);
        float rise=fbm(vec2(parcel*13.0,(q.x+q.z*.71)*8.0+time*1.9))-.5;
        float fine=noise(vec2(parcel*18.0+age*6.0,(q.z-q.x*.43)*19.0-time*2.7))-.5;
        vec3 source=(sampleTip-vec3(0.0,3.26,0.0))/flameHeight;
        float ch=clamp((h-source.y)/max(.1,.95-source.y),0.0,1.0);
        float shoulderH=max(source.y,min(.68,max(.52,source.y+.28)));
        float shoulderWidth=widthAt(shoulderH,mouth);
        vec2 lateral=source.xz/max(.001,widthAt(source.y,mouth));
        lateral/=max(1.0,length(lateral));
        float curve=smoothstep(0.0,1.0,ch);
        vec2 centre=mix(source.xz,sway+lateral*shoulderWidth*.3,curve)
          -lateral*shoulderWidth*.16*sin(curve*3.14159);
        centre+=vec2(rise,fine)*.009*smoothstep(0.0,.28,ch);
        float saltWidth=sampleRadius/flameHeight;
        float expanded=mix(saltWidth,shoulderWidth*.64,smoothstep(-.12,.3,ch));
        float tapered=max(saltWidth*.55,width*.64);
        float colouredWidth=mix(expanded,tapered,smoothstep(.52,1.15,ch))
          *mix(1.0,.84,smoothstep(.78,1.0,ch));
        float clearing=withdrawalFront+rise*.022+fine*.006;
        float appearing=revealFront+rise*.018+fine*.005;
        float withdrawMask=withdrawalFront<0.0?1.0:smoothstep(clearing-.035,clearing+.055,h);
        float revealMask=revealFront<0.0?1.0:1.0-smoothstep(appearing-.055,appearing+.035,h);
        float transition=(withdrawalFront>=0.0&&revealFront>=0.0)?max(withdrawMask,revealMask):min(withdrawMask,revealMask);
        float cd=length(q.xz-centre)/max(.001,colouredWidth);
        float clip=1.0-smoothstep(.94,1.30,d);
        float colouredVertical=smoothstep(-.006,.018,h-source.y)*(1.0-smoothstep(.75,.95,hm+flicker*1.5))*clip*transition*sampleActive;
        float heat=fbm(vec2(parcel*9.0,(q.x-centre.x+q.z-centre.y)*9.0+time*1.6));
        // Rising tongues: the same turbulence frays the plume's edge above the bead.
        float frayed=cd+(.5-heat)*.35*smoothstep(.15,.8,ch);
        float colouredBody=(1.0-smoothstep(.48,1.13,frayed))*colouredVertical;
        float colouredVeil=(1.0-smoothstep(.68,1.48,frayed))*colouredVertical;
        // Brightest just above the bead, where the salt evaporates.
        float evaporation=exp(-ch*7.0)*(1.0-smoothstep(0.0,1.0,cd))*colouredVertical;
        float lateralBlend=smoothstep(.16,1.02,cd);
        // Tint is the viewer element colour, converted from sRGB by the scene.
        // The hue stays the element's, but the emitter concentration does not
        // stay flat. Salt vapour is densest just above the bead: the strongest
        // emission there is the brightest, almost saturating, form of the same
        // hue with a trace of white. Vapour thins out with height and towards
        // the edges, where the colour is dimmer. Filaments carried up by the gas
        // are alternately richer and poorer. Near the tip the cooling gas emits
        // less, and the deeper, darker colour fades into the mantle.
        float streak=noise(vec2(((q.x-centre.x)*.83+(q.z-centre.y)*.56)*34.0,parcel*4.5))-.5;
        float core=1.0-smoothstep(0.0,.8,cd);
        float rich=exp(-ch*2.4)*core;
        vec3 peak=tint/max(.001,max(tint.r,max(tint.g,tint.b)));
        float cooling=smoothstep(.40,1.0,ch);
        vec3 warm=pow(mix(tint,peak,clamp(rich+streak*.4*core,0.0,1.0)),vec3(1.0+.65*cooling+.30*lateralBlend));
        warm=mix(warm,vec3(1.0),clamp((rich*.30+evaporation*.25)*(1.0+.8*streak),0.0,.40));
        warm*=(.95+.55*streak*smoothstep(.04,.3,ch)+.20*(heat-.5))*mix(1.0,.55,cooling)*mix(1.0,.80,lateralBlend);
        float colouredDensity=(colouredBody*(1.65+.45*heat+.40*streak)+colouredVeil*.16+evaporation*.9)
          *(1.0-lateralBlend*.62)*opacity*1.80/max(.12,mouthRadius*2.0);
        // In the coloured plume, sodium emission replaces most of the blue
        // contribution instead of adding complementary colours into a pale mix.
        // Preserve blue below the tip and outside the plume, including withdrawal.
        float colouredCoverage=(1.0-smoothstep(.48,1.48,cd))*colouredVertical*clamp(opacity,0.0,1.0);
        blueDensity*=1.0-.96*colouredCoverage;
        float density=blueDensity+colouredDensity;
        vec3 colour=(blue*blueDensity+warm*colouredDensity)/max(.0001,density);
        return vec4(colour,density);
      }
      void main(){
        vec3 direction=normalize(worldPoint-cameraPosition);
        vec3 safeDirection=vec3(direction.x>=0.0?max(direction.x,.00001):min(direction.x,-.00001),
          direction.y>=0.0?max(direction.y,.00001):min(direction.y,-.00001),
          direction.z>=0.0?max(direction.z,.00001):min(direction.z,-.00001));
        vec3 a=(boundsMin-cameraPosition)/safeDirection,b=(boundsMax-cameraPosition)/safeDirection;
        vec3 nearPoint=min(a,b),farPoint=max(a,b);
        float entry=max(0.0,max(nearPoint.x,max(nearPoint.y,nearPoint.z)));
        float exitDistance=min(farPoint.x,min(farPoint.y,farPoint.z));
        vec2 screenUV=gl_FragCoord.xy/viewport;
        float depth=texture2D(sceneDepth,screenUV).x;
        if(depth<.999999){
          vec4 viewPoint=inverseProjection*vec4(screenUV*2.0-1.0,depth*2.0-1.0,1.0);
          viewPoint/=viewPoint.w;
          vec3 opaquePoint=(cameraWorld*viewPoint).xyz;
          exitDistance=min(exitDistance,dot(opaquePoint-cameraPosition,direction));
        }
        if(exitDistance<=entry)discard;
        // Emission behind the nearest glass surface is seen through the glass:
        // dimmed and veiled, so a rod handle or jar in front stays in front.
        float glassDistance=1e6;
        float glassZ=texture2D(glassDepth,screenUV).x;
        if(glassZ<.999999){
          vec4 glassPoint=inverseProjection*vec4(screenUV*2.0-1.0,glassZ*2.0-1.0,1.0);
          glassPoint/=glassPoint.w;
          glassDistance=dot((cameraWorld*glassPoint).xyz-cameraPosition,direction);
        }
        // 48 jittered steps resolve the same shape as 64 regular ones; the
        // per-pixel offset turns step banding into fine grain the flicker hides.
        float stepLength=(exitDistance-entry)/48.0;
        float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        vec4 accumulated=vec4(0.0);
        for(int i=0;i<48;i++){
          vec3 point=cameraPosition+direction*(entry+(float(i)+jitter)*stepLength);
          vec4 field=emission(point);
          float alpha=1.0-exp(-field.a*stepLength);
          if(entry+(float(i)+jitter)*stepLength>glassDistance)alpha*=.72;
          accumulated.rgb+=(1.0-accumulated.a)*field.rgb*alpha;
          accumulated.a+=(1.0-accumulated.a)*alpha;
          if(accumulated.a>.97)break;
        }
        if(accumulated.a<.002)discard;
        // Match the sRGB output transfer of the former MeshBasicMaterial flame.
        // ShaderMaterial needs it explicitly; omitting it makes emission dull.
        vec3 colour=accumulated.rgb/max(.0001,accumulated.a);
        colour=mix(colour*12.92,1.055*pow(colour,vec3(1.0/2.4))-.055,step(vec3(.0031308),colour));
        // Premultiplied emission: the flame adds light to what is behind it and
        // only partly veils it, as a transparent emitter does.
        gl_FragColor=vec4(colour*accumulated.a,accumulated.a*.42);
      }`
  }));
  const volume=new THREE.Mesh(track(new THREE.BoxGeometry(1,1,1)),material);
  volume.name='volumetric-flame';volume.renderOrder=100;
  // Light scattered around the flame: one additive billboard instead of a
  // full-screen bloom pass, tinted by the emitting salt.
  const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=128;
  const haloContext=haloCanvas.getContext('2d');
  const haloGradient=haloContext.createRadialGradient(64,64,0,64,64,64);
  for(const [stop,alpha] of [[0,1],[.18,.62],[.42,.22],[.7,.06],[1,0]])haloGradient.addColorStop(stop,`rgba(255,255,255,${alpha})`);
  haloContext.fillStyle=haloGradient;haloContext.fillRect(0,0,128,128);
  const haloTexture=track(new THREE.CanvasTexture(haloCanvas));
  const haloMaterial=track(new THREE.SpriteMaterial({map:haloTexture,color:0x000000,blending:THREE.AdditiveBlending,
    transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:false}));
  const halo=new THREE.Sprite(haloMaterial);halo.name='flame-halo';halo.renderOrder=99;
  const mesh=new THREE.Group();mesh.name='bunsen-flame';mesh.add(volume,halo);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const envelopeGlow=new THREE.Color(.10,.20,.55);
  return {
    mesh,
    update({height,mouthRadius,tip,color,intensity,time,plume,viewport,depthTexture,glassDepthTexture,camera}){
      const radius=Math.max(.9,height*.18),bottom=3.26-height*.04,top=3.26+height*1.10;
      volume.position.set(0,(bottom+top)/2,0);volume.scale.set(radius*2,top-bottom,radius*2);
      // The halo follows the coloured plume when there is one, else the cone.
      const glow=plume.active?Math.min(1,intensity):0;
      const centreY=plume.active?Math.max(3.26+height*.32,tip.y+(3.26+height*.9-tip.y)*.45):3.26+height*.22;
      halo.position.set(castLight.x*height,centreY+castLight.lift*height*.5,castLight.z*height);
      halo.scale.set(height*(.55+.45*glow),height*(.6+.75*glow)*tipScale,1);
      const haloPower=1+castLight.pulse;
      haloMaterial.color.copy(envelopeGlow).multiplyScalar(.10*(1-glow)*haloPower)
        .add({r:color[0]*.30*glow*haloPower,g:color[1]*.30*glow*haloPower,b:color[2]*.30*glow*haloPower});
      uniforms.boundsMin.value.set(-radius,bottom,-radius);uniforms.boundsMax.value.set(radius,top,radius);
      uniforms.flameHeight.value=height;uniforms.mouthRadius.value=mouthRadius;
      // Only a detached, withdrawing remnant retains its last contact point.
      if(plume.inside)uniforms.sampleTip.value.copy(tip);
      uniforms.tint.value.set(...color);uniforms.opacity.value=intensity;uniforms.time.value=time;
      // Reduced motion keeps a faint drift instead of flicker and swaying.
      const calm=reducedMotion.matches?.2:1;
      uniforms.turbulence.value=calm*advanceMotion(time,tip,height,plume.inside,calm);
      uniforms.tipScale.value=tipScale;
      uniforms.sampleActive.value=plume.active?1:0;
      uniforms.withdrawalFront.value=plume.front;uniforms.revealFront.value=plume.revealFront;
      uniforms.sceneDepth.value=depthTexture;uniforms.glassDepth.value=glassDepthTexture;uniforms.viewport.value.copy(viewport);
      uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraWorld.value.copy(camera.matrixWorld);
    },
    source:uniforms.sampleTip.value,
    // Centroid offset and power change of the light the flame casts.
    light:castLight,
    volume
  };
}
